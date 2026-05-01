import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { inngest } from '@/inngest/client';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'missing stripe-signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid signature';
    console.error('[stripe-webhook] signature verification failed:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.orderId ?? session.id;

    const lineItems = await getStripe().checkout.sessions.listLineItems(session.id, {
      expand: ['data.price.product'],
    });

    const shipping = session.collected_information?.shipping_details ?? null;
    const customerName = session.customer_details?.name ?? shipping?.name ?? null;

    await inngest.send({
      id: `order-placed-${session.id}`,
      name: 'store/order.placed',
      data: {
        orderId,
        stripeSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id,
        // PII goes under `encrypted` so the encryption middleware encrypts it
        // before it lands in Inngest's storage. Non-PII (orderId, totals,
        // line items) stays plaintext for dashboard observability.
        encrypted: {
          customerEmail: session.customer_details?.email ?? session.customer_email,
          customerName,
          customerPhone: session.customer_details?.phone ?? null,
          shipping: shipping
            ? {
                name: shipping.name ?? customerName,
                line1: shipping.address?.line1 ?? null,
                line2: shipping.address?.line2 ?? null,
                city: shipping.address?.city ?? null,
                state: shipping.address?.state ?? null,
                postalCode: shipping.address?.postal_code ?? null,
                country: shipping.address?.country ?? null,
              }
            : null,
        },
        amountTotal: session.amount_total,
        currency: session.currency,
        lineItems: lineItems.data.map((li) => {
          const product =
            typeof li.price?.product === 'object' && li.price?.product
              ? (li.price.product as Stripe.Product)
              : null;
          const meta = product?.metadata ?? {};
          return {
            description: li.description,
            quantity: li.quantity,
            amountTotal: li.amount_total,
            priceId: typeof li.price === 'string' ? li.price : li.price?.id,
            productId:
              typeof li.price?.product === 'string' ? li.price.product : product?.id,
            productName: product?.name,
            sku: meta.sku || undefined,
            variantId: meta.variantId || undefined,
            size: meta.size || undefined,
            color: meta.color || undefined,
          };
        }),
        metadata: session.metadata ?? {},
      },
    });

    console.log(`[stripe-webhook] fired store/order.placed for ${orderId}`);
  }

  return NextResponse.json({ received: true });
}
