import { NextRequest, NextResponse } from 'next/server';

// ─── Stripe Webhook Handler ───────────────────────────────────────────────
// LIVESTREAM TARGET (Block 1): The plugin will build this out to:
//   1. Validate the Stripe signature using STRIPE_WEBHOOK_SECRET
//   2. On `checkout.session.completed`, call inngest.send({
//        name: 'store/order.placed',
//        data: { orderId, stripeSessionId, lineItems, customerEmail, ... }
//      })
//
// Why webhooks (not redirect): we trust Stripe's confirmation, not the user's
// browser. Inngest picks up from there and guarantees every step runs once.

export async function POST(req: NextRequest) {
  const body = await req.text();

  // TODO (livestream Block 1): validate signature + fire Inngest event
  // const sig = req.headers.get('stripe-signature')!;
  // const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  // if (event.type === 'checkout.session.completed') {
  //   await inngest.send({ name: 'store/order.placed', data: { ... } });
  // }

  console.log('[stripe-webhook] received', body.slice(0, 100));
  return NextResponse.json({ received: true });
}
