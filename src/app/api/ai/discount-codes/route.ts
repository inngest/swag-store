import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/api-auth';
import { generateSwagCodesForActor } from '@/lib/order-automation';
import { MAX_DISCOUNT_CODE_BATCH } from '@/lib/store-db';

export async function POST(req: NextRequest) {
  try {
    const actor = await requireApiActor(req);
    const body = (await req.json()) as {
      kind?: 'sales_credit' | 'devrel_comp';
      recipient?: string;
      purpose?: string;
      count?: number;
    };

    if (body.kind !== 'sales_credit' && body.kind !== 'devrel_comp') {
      return NextResponse.json({ error: 'kind must be sales_credit or devrel_comp' }, { status: 400 });
    }

    const count = body.count === undefined ? 1 : Math.floor(Number(body.count));
    if (!Number.isFinite(count) || count < 1 || count > MAX_DISCOUNT_CODE_BATCH) {
      return NextResponse.json(
        { error: `count must be an integer between 1 and ${MAX_DISCOUNT_CODE_BATCH}` },
        { status: 400 },
      );
    }

    const discountCodes = await generateSwagCodesForActor({
      actorEmail: actor.email,
      kind: body.kind,
      recipient: body.recipient,
      purpose: body.purpose,
      count,
    });

    return NextResponse.json({ discountCode: discountCodes[0], discountCodes });
  } catch (err) {
    return apiError(err);
  }
}

function apiError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Request failed';
  const status = message.includes('API token') || message.includes('SWAG_STORE_API_TOKEN')
    ? 401
    : message.includes('DATABASE_URL')
      ? 503
      : 500;
  return NextResponse.json({ error: message }, { status });
}
