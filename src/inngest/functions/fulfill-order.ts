import { inngest } from '../client';

// ─── Fulfill Order — Inngest Durable Function ─────────────────────────────
// LIVESTREAM TARGET: This function is intentionally a stub. The plugin will
// build it live with three durable steps:
//   1. capture-payment
//   2. reserve-inventory
//   3. send-confirmation
//
// Each step.run() is a memoized durable boundary. If the function fails
// mid-flight and retries, completed steps are NOT re-executed.

export const fulfillOrder = inngest.createFunction(
  {
    id: 'fulfill-order',
    name: 'Fulfill Order',
    retries: 3,
    triggers: [{ event: 'store/order.placed' }],
  },
  async ({ event, step }) => {
    // TODO (livestream Block 2): implement three durable steps
    //   - capture-payment: confirm Stripe PaymentIntent succeeded
    //   - reserve-inventory: decrement stock per SKU
    //   - send-confirmation: log/mock email send
    //
    // Each step should publish a Realtime event on channel `order:{orderId}`
    // so the order status page can subscribe and render progress live.

    return { orderId: (event.data as { orderId: string }).orderId, status: 'pending' };
  }
);
