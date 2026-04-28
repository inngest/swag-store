import { NextRequest, NextResponse } from 'next/server';
import { PRODUCTS } from '@/lib/catalog';

// ─── Checkout API Route ───────────────────────────────────────────────────
// Creates a Stripe Checkout Session and returns the redirect URL.
// The frontend POSTs the cart, this returns { url } to redirect to.
//
// LIVESTREAM: Show this route being built. The key insight:
//   - We don't fire the Inngest event here
//   - We wait for Stripe webhook confirmation (idempotent, reliable)
//   - Then fire "store/order.placed" from the webhook handler

export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json();

    // Build line items for Stripe
    const lineItems = items.map((item: { productId: string; variantId: string; quantity: number; size?: string }) => {
      const product = PRODUCTS.find((p) => p.id === item.productId);
      if (!product) throw new Error(`Product not found: ${item.productId}`);

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: product.name,
            description: item.size ? `Size: ${item.size}` : undefined,
          },
          unit_amount: product.price,
        },
        quantity: item.quantity,
      };
    });

    // In production, use the Stripe SDK:
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    // const session = await stripe.checkout.sessions.create({
    //   mode: 'payment',
    //   line_items: lineItems,
    //   success_url: `${req.nextUrl.origin}/orders/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    //   cancel_url: `${req.nextUrl.origin}/checkout`,
    //   metadata: { orderId: generateOrderId() },
    // });
    // return NextResponse.json({ url: session.url });

    // For demo/livestream, return a mock URL:
    const mockOrderId = `ORD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    return NextResponse.json({
      url: `/orders/${mockOrderId}`,
      orderId: mockOrderId,
    });
  } catch (err) {
    console.error('Checkout error:', err);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
