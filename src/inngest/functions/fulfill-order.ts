import { inngest } from '../client';

// ─── Fulfill Order — Inngest Durable Function ─────────────────────────────
// Triggered by the "store/order.placed" event after Stripe webhook confirms payment.
// Each step.run() is memoized — if the function fails mid-flight and retries,
// completed steps are NOT re-executed. This is the core Inngest value prop.
//
// LIVESTREAM DEMO: Walk through this function step by step. The order status
// page at /orders/[id] polls this function's run status to show real-time progress.

export const fulfillOrder = inngest.createFunction(
  {
    id: 'fulfill-order',
    name: 'Fulfill Order',
    retries: 3,
    triggers: [{ event: 'store/order.placed' }],
  },
  async ({ event, step }) => {
    const { orderId, stripeSessionId, lineItems, customerEmail } = event.data as {
      orderId: string;
      stripeSessionId: string;
      lineItems: Array<{ productId: string; variantId: string; quantity: number; price: number }>;
      customerEmail: string;
      shippingAddress: { name: string; line1: string; city: string; state: string; zip: string; country: string };
    };

    // ─── Step 1: Capture Payment ──────────────────────────────────────────
    const payment = await step.run('capture-payment', async () => {
      return {
        paymentIntentId: `pi_${stripeSessionId}`,
        amount: (lineItems ?? []).reduce((sum, item) => sum + item.price * item.quantity, 0),
        status: 'succeeded',
      };
    });

    // ─── Step 2: Reserve Inventory ────────────────────────────────────────
    const inventory = await step.run('reserve-inventory', async () => {
      const reserved = (lineItems ?? []).map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        reserved: true,
      }));
      return { reserved };
    });

    // ─── Step 3: Submit to Fulfillment ────────────────────────────────────
    const fulfillment = await step.run('submit-to-fulfillment', async () => {
      return {
        fulfillmentOrderId: `FUL-${orderId}`,
        provider: 'Printful',
        status: 'accepted',
        estimatedDays: 3,
      };
    });

    // ─── Step 4: Generate Shipping Label ─────────────────────────────────
    const shipping = await step.run('generate-shipping-label', async () => {
      return {
        trackingNumber: `1Z999AA1${Math.floor(Math.random() * 10000000000).toString().padStart(10, '0')}`,
        carrier: 'UPS',
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      };
    });

    // ─── Step 5: Send Confirmation Email ─────────────────────────────────
    await step.run('send-confirmation', async () => {
      console.log(`Sending confirmation to ${customerEmail} with tracking ${shipping.trackingNumber}`);
      return { sent: true, to: customerEmail, trackingNumber: shipping.trackingNumber };
    });

    return { orderId, status: 'fulfilled', payment, inventory, fulfillment, shipping };
  }
);
