import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';

// ─── Stripe Webhook Handler ───────────────────────────────────────────────
// Listens for checkout.session.completed from Stripe.
// THIS is where we fire the Inngest event — not at checkout creation.
//
// Why: We only process orders when payment is confirmed by Stripe.
// The Inngest function then handles all downstream steps durably.
//
// LIVESTREAM TALKING POINT:
// "We're not trusting the redirect — we're trusting Stripe's webhook.
//  Inngest picks up from there and guarantees every step runs exactly once."

export async function POST(req: NextRequest) {
  const body = await req.text();

  // In production, verify the Stripe signature:
  // const sig = req.headers.get('stripe-signature')!;
  // const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

  // For demo, parse directly:
  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as {
      id: string;
      metadata: { orderId: string };
      customer_details: { email: string };
      amount_total: number;
    };

    // Fire the Inngest event — this kicks off the fulfill-order function
    await inngest.send({
      name: 'store/order.placed',
      data: {
        orderId: session.metadata?.orderId ?? `ORD-${session.id}`,
        stripeSessionId: session.id,
        lineItems: [], // In production: extract from session.line_items
        customerEmail: session.customer_details?.email ?? '',
        shippingAddress: {
          name: '',
          line1: '',
          city: '',
          state: '',
          zip: '',
          country: 'US',
        },
      },
    });
  }

  return NextResponse.json({ received: true });
}
