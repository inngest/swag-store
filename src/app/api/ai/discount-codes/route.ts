import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/api-auth';
import { generateSwagCodeForActor } from '@/lib/order-automation';

export async function POST(req: NextRequest) {
  try {
    const actor = await requireApiActor(req);
    const body = (await req.json()) as {
      kind?: 'sales_credit' | 'devrel_comp';
      recipient?: string;
      purpose?: string;
    };

    if (body.kind !== 'sales_credit' && body.kind !== 'devrel_comp') {
      return NextResponse.json({ error: 'kind must be sales_credit or devrel_comp' }, { status: 400 });
    }

    const discountCode = await generateSwagCodeForActor({
      actorEmail: actor.email,
      kind: body.kind,
      recipient: body.recipient,
      purpose: body.purpose,
    });

    return NextResponse.json({ discountCode });
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
