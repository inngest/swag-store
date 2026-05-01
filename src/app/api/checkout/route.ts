import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { PRODUCTS } from '@/lib/catalog';

type CartItem = {
  productId: string;
  variantId: string;
  quantity: number;
  size?: string;
  color?: string;
};

export async function POST(req: NextRequest) {
  try {
    const { items } = (await req.json()) as { items: CartItem[] };

    if (!items?.length) {
      return NextResponse.json({ error: 'cart is empty' }, { status: 400 });
    }

    const lineItems = items.map((item) => {
      const product = PRODUCTS.find((p) => p.id === item.productId);
      if (!product) throw new Error(`Product not found: ${item.productId}`);

      const descriptionParts = [item.size && `Size: ${item.size}`, item.color && `Color: ${item.color}`]
        .filter(Boolean)
        .join(' · ');

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: product.name,
            ...(descriptionParts ? { description: descriptionParts } : {}),
            metadata: {
              sku: product.sku,
              variantId: item.variantId,
              size: item.size ?? '',
              color: item.color ?? '',
            },
          },
          unit_amount: product.price,
        },
        quantity: item.quantity,
      };
    });

    const orderId = `ord_${Math.random().toString(36).slice(2, 10)}`;
    const origin = req.nextUrl.origin;

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}/orders/confirmation?ord=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
      metadata: { orderId },
      shipping_address_collection: {
        allowed_countries: ['US', 'CA'],
      },
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: true },
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    return NextResponse.json({ url: session.url, orderId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed';
    console.error('[checkout] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
