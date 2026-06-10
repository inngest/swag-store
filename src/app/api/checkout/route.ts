import { NextRequest, NextResponse } from 'next/server';
import { type CheckoutCartItem } from '@/lib/checkout';
import { CheckoutInputError } from '@/lib/checkout-errors';
import { createCheckoutSessionForCart } from '@/lib/order-automation';

export async function POST(req: NextRequest) {
  try {
    const { items, discountCode } = (await req.json()) as {
      items: CheckoutCartItem[];
      discountCode?: string;
    };

    if (!Array.isArray(items) || !items.length) {
      return NextResponse.json({ error: 'cart is empty' }, { status: 400 });
    }

    const session = await createCheckoutSessionForCart({
      items,
      discountCode,
      origin: req.nextUrl.origin,
    });

    return NextResponse.json({ url: session.url, orderId: session.orderId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed';
    console.error('[checkout] error:', message);
    if (err instanceof CheckoutInputError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (isStripeCouponError(err)) {
      return NextResponse.json(
        { error: 'That discount code is no longer valid. Remove it and try again.' },
        { status: 400 },
      );
    }
    const status = message.includes('Discount code') ||
      message.includes('cart is empty') ||
      message.includes('Product variant')
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function isStripeCouponError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type?: string }).type === 'StripeInvalidRequestError' &&
    err instanceof Error &&
    /coupon/i.test(err.message)
  );
}
