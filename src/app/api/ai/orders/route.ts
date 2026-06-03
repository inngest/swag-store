import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/api-auth';
import { submitAutomatedOrder, type AutomatedOrderInput } from '@/lib/order-automation';

export async function POST(req: NextRequest) {
  try {
    await requireApiActor(req);
    const body = (await req.json()) as AutomatedOrderInput;
    const result = await submitAutomatedOrder({
      input: body,
      origin: req.nextUrl.origin,
    });

    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}

function apiError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Request failed';
  const status = message.includes('API token') || message.includes('SWAG_STORE_API_TOKEN')
    ? 401
    : message.includes('requires customer')
      ? 400
      : message.includes('not found') ||
          message.includes('Invalid') ||
          message.includes('cart is empty') ||
          message.includes('already been redeemed')
        ? 400
        : 500;
  return NextResponse.json({ error: message }, { status });
}
