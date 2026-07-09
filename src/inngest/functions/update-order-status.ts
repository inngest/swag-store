import { NonRetriableError } from 'inngest';
import { inngest } from '../client';
import { adminChannel, orderChannel } from '../channels';
import { APP_ORIGIN, originTrigger } from '@/lib/app-origin';
import { getStripe } from '@/lib/stripe';
import { isOrderEmailConfigured, sendOrderShippedEmail } from '@/lib/email';
import {
  fetchOrderPaymentRef,
  isOrderStatus,
  releaseOrderReservations,
  updateOrderStatus,
  type OrderStatus,
} from '@/lib/store-db';

export const updateOrderStatusFunction = inngest.createFunction(
  {
    id: 'update-order-status',
    name: 'Update Order Status',
    retries: 2,
    triggers: [originTrigger('admin/order.status_update.requested')],
  },
  async ({ event, step }) => {
    const data = event.data as {
      orderId: string;
      status: OrderStatus;
      tracking?: string;
      notes?: string;
      actorEmail?: string;
    };

    if (!isOrderStatus(data.status)) {
      throw new NonRetriableError(`Invalid order status: ${String(data.status)}`);
    }

    const transition = await step.run('update-order-status', async () => {
      try {
        return await updateOrderStatus({
          orderId: data.orderId,
          status: data.status,
          tracking: data.tracking,
          notes: data.notes,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Bad transitions and missing orders won't heal on retry.
        if (message.includes('Invalid status transition') || message.includes('Order not found')) {
          throw new NonRetriableError(message);
        }
        throw err;
      }
    });

    const becameCancelled =
      data.status === 'cancelled' && transition.previousStatus !== 'cancelled';
    const becameShipped =
      data.status === 'shipped' && transition.previousStatus !== 'shipped';

    if (becameCancelled) {
      // Put the units back on the shelf. Idempotent: already-released
      // reservations (e.g. a failed fulfillment that auto-restocked) are
      // skipped, so cancelling a NEEDS ATTENTION order can't double-restock.
      const restock = await step.run('release-inventory', async () => {
        return releaseOrderReservations({
          orderId: data.orderId,
          reason: `Order cancelled by ${data.actorEmail ?? 'admin'}`,
          actorEmail: data.actorEmail ?? 'system:order-cancel',
        });
      });

      if (restock.released.length > 0) {
        await step.sendEvent('inventory-changed-after-cancel', {
          id: `inventory-changed-cancel-${data.orderId}`,
          name: 'store/inventory.changed',
          data: {
            appOrigin: APP_ORIGIN,
            source: 'order-cancelled',
            reason: 'Inventory restocked after order cancellation',
            orderId: data.orderId,
          },
        });
      }

      // Refund whatever Stripe actually captured for this order. $0 comp
      // orders have no PaymentIntent and no-op. The idempotency key makes
      // replays safe, and an already-refunded PI (failed-fulfillment path)
      // comes back as such rather than double-refunding.
      await step.run('refund-payment', async () => {
        const ref = await fetchOrderPaymentRef(data.orderId);
        if (!ref?.stripeSessionId) {
          return { refunded: false as const, reason: 'no Stripe session on order' };
        }
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(ref.stripeSessionId);
        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;
        if (!paymentIntentId) {
          return { refunded: false as const, reason: 'no payment intent (zero-dollar order)' };
        }
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi.status !== 'succeeded') {
          return { refunded: false as const, reason: `payment intent status is ${pi.status}` };
        }
        const existing = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 1 });
        if (existing.data.length > 0) {
          return { refunded: false as const, reason: `already refunded (${existing.data[0].id})` };
        }
        const created = await stripe.refunds.create(
          { payment_intent: paymentIntentId },
          { idempotencyKey: `${data.orderId}-cancel` },
        );
        return { refunded: true as const, refundId: created.id, amountCents: created.amount };
      });
    }

    if (becameShipped) {
      // Close the loop the confirmation email opens ("we'll let you know when
      // it ships"). Failure-safe: a broken email never fails the status change.
      await step.run('send-shipped-email', async () => {
        if (!isOrderEmailConfigured()) {
          return { sent: false as const, skipped: 'order email not configured' };
        }
        const ref = await fetchOrderPaymentRef(data.orderId);
        if (!ref?.email) {
          return { sent: false as const, skipped: 'no customer email on order' };
        }
        try {
          return await sendOrderShippedEmail({
            to: ref.email,
            orderId: data.orderId,
            tracking: data.tracking ?? '',
            appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`[update-order-status] send-shipped-email failed for ${data.orderId}: ${reason}`);
          return { sent: false as const, error: reason };
        }
      });
    }

    await step.realtime.publish('emit-admin-status-update', adminChannel.order, {
      orderId: data.orderId,
      step: data.status,
      status: 'complete',
      ts: Date.now(),
    });

    await step.realtime.publish(
      'emit-order-status-update',
      orderChannel(data.orderId).status,
      {
        status: data.status,
        tracking: data.tracking,
        ts: Date.now(),
      },
    );

    return {
      orderId: data.orderId,
      status: data.status,
      previousStatus: transition.previousStatus,
      actorEmail: data.actorEmail,
    };
  },
);
