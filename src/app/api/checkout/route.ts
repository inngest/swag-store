import { NextRequest, NextResponse } from 'next/server';
import { type CheckoutCartItem } from '@/lib/checkout';
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
