import { isEncryptedValue } from '@inngest/middleware-encryption';
import { LibSodiumEncryptionService } from '@inngest/middleware-encryption/strategies/libSodium';
import { inngest } from '../client';
import { orderChannel, adminChannel } from '../channels';
import { APP_ORIGIN, originTrigger } from '@/lib/app-origin';
import { getStripe } from '@/lib/stripe';
import { isOrderEmailConfigured, sendOrderConfirmationEmail } from '@/lib/email';
import { sendOrderFulfillmentFailureSlackMessage } from '@/lib/slack';
import {
  fetchOrder,
  isStoreDatabaseEnabled,
  recordDiscountRedemption,
  recordPendingOrder,
  releaseOrderReservations,
  reserveInventory,
  updateOrderStatus,
} from '@/lib/store-db';

type LineItem = {
  description: string | null;
  quantity: number | null;
  amountTotal: number | null;
  priceId?: string;
  productId?: string;
  productName?: string;
  sku?: string;
  variantId?: string;
  size?: string;
  color?: string;
};

type ShippingInfo = {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
} | null;

type EncryptedPii = {
  customerEmail?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  shipping?: ShippingInfo;
};

type OrderPlacedData = {
  orderId: string;
  stripePaymentIntentId?: string;
  encrypted?: EncryptedPii;
  lineItems: LineItem[];
  amountTotal: number;
  currency: string;
  stripeSessionId?: string;
  discount?: {
    code: string;
    amountCents: number;
  } | null;
};

export const fulfillOrder = inngest.createFunction(
  {
    id: 'fulfill-order',
    name: 'Fulfill Order',
    retries: 3,
    triggers: [originTrigger('store/order.placed')],
    // Safety net: the customer has (usually) already been charged by the time
    // this function runs, so a permanently failed run must never silently drop
    // the order. Park it in the pending queue, refund the payment, and alert.
    onFailure: async ({ event, error, step }) => {
      const original = event.data.event;
      const data = original.data as OrderPlacedData;
      const { orderId, stripePaymentIntentId, lineItems, amountTotal, currency } = data;
      const failureReason = errorMessage(error);

      // The encryption middleware only decrypts the top-level failure event, so
      // the original event's PII may still be an encrypted blob here. Decrypt it
      // inline (never into step state) and degrade gracefully if we can't.
      const pii = await decryptPii(data.encrypted);
      const shipping = pii?.shipping ?? null;
      const customerName =
        pii?.customerName ??
        shipping?.name ??
        (pii?.customerEmail ? pii.customerEmail.split('@')[0] : null);

      const itemsLabel = (lineItems ?? [])
        .map((li) => {
          const name = li.productName ?? li.description ?? 'item';
          const variant = [li.size, li.color].filter(Boolean).join('/');
          const variantTag = variant ? ` (${variant})` : '';
          const quantity = li.quantity ?? 1;
          const qtyTag = quantity > 1 ? ` × ${quantity}` : '';
          return `${name}${variantTag}${qtyTag}`;
        })
        .join(', ');

      const needsAttentionNote = `NEEDS ATTENTION: fulfillment failed after retries — ${failureReason}. Any reserved inventory has been auto-restocked; re-reserve before shipping.`;

      // If an order row already exists, another consumer (or a later step of
      // this run) recorded it successfully. Overwriting it would erase good
      // PII, and refunding would claw back a fulfilled order. Alert only.
      const existingOrder = await step.run('check-existing-order', async () => {
        if (!isStoreDatabaseEnabled()) return null;
        const existing = await fetchOrder(orderId);
        return existing ? { status: existing.status ?? 'pending' } : null;
      });

      if (existingOrder) {
        await step.realtime.publish('publish-admin-duplicate-failure', adminChannel.order, {
          orderId,
          amount: amountTotal,
          currency,
          items: (lineItems ?? []).map((li) => ({
            name: li.productName ?? li.description ?? 'item',
            quantity: li.quantity ?? 1,
          })),
          step: 'fulfillment-failed-duplicate',
          status: 'failed',
          ts: Date.now(),
        });
        return {
          orderId,
          skipped: 'order already recorded by a successful run; no overwrite, no refund',
          failureReason,
        };
      }

      await step.run('record-failed-order', async () => {
        return recordPendingOrder({
          row: {
            orderId,
            createdAt: new Date().toISOString(),
            email: pii?.customerEmail ?? '',
            name: customerName ?? '',
            items: itemsLabel,
            totalCents: amountTotal,
            currency: (currency ?? 'usd').toUpperCase(),
            shipAddress: [shipping?.line1, shipping?.line2].filter(Boolean).join(', '),
            shipCity: shipping?.city ?? '',
            shipState: shipping?.state ?? '',
            shipZip: shipping?.postalCode ?? '',
            shipCountry: shipping?.country ?? '',
            phone: pii?.customerPhone ?? '',
            status: 'pending',
            tracking: '',
            notes: needsAttentionNote,
            discountCode: data.discount?.code ?? '',
            discountAmountCents: data.discount?.amountCents ?? 0,
          },
          lineItems,
          stripeSessionId: data.stripeSessionId,
        });
      });

      // Compensate the reserve-inventory step: whatever this order decremented
      // goes back into stock. No-ops when nothing was reserved (the reservation
      // ledger is written in the same transaction as the decrement) and on
      // repeat invocations (released rows are skipped).
      const restock = await step.run('release-inventory', async () => {
        return releaseOrderReservations({
          orderId,
          reason: `Fulfillment failed: ${failureReason}`,
          actorEmail: 'system:fulfill-order-failure',
        });
      });

      if (restock.released.length > 0) {
        await step.sendEvent('inventory-changed-after-release', {
          id: `inventory-changed-release-${orderId}`,
          name: 'store/inventory.changed',
          data: {
            appOrigin: APP_ORIGIN,
            source: 'order-failure-release',
            reason: 'Inventory restocked after failed fulfillment',
            orderId,
          },
        });
      }

      const refund = await step.run('refund-payment', async () => {
        if (!stripePaymentIntentId) {
          return { refunded: false as const, reason: 'no payment intent on order' };
        }
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
        if (pi.status !== 'succeeded') {
          return { refunded: false as const, reason: `payment intent ${pi.id} status is ${pi.status}` };
        }
        const created = await stripe.refunds.create(
          { payment_intent: stripePaymentIntentId },
          { idempotencyKey: orderId },
        );
        return { refunded: true as const, refundId: created.id, amountCents: created.amount };
      });

      const refundSummary = refund.refunded
        ? `Stripe refund ${refund.refundId} issued (${formatCents(refund.amountCents)}).`
        : `No refund issued: ${refund.reason}.`;

      if (refund.refunded && isStoreDatabaseEnabled()) {
        await step.run('note-refund', async () => {
          return updateOrderStatus({
            orderId,
            status: 'pending',
            notes: `${needsAttentionNote} ${refundSummary}`,
          });
        });
      }

      await step.realtime.publish(
        'publish-admin-fulfillment-failed',
        adminChannel.order,
        {
          orderId,
          customerEmail: pii?.customerEmail,
          amount: amountTotal,
          currency,
          items: (lineItems ?? []).map((li) => ({
            name: li.productName ?? li.description ?? 'item',
            quantity: li.quantity ?? 1,
          })),
          step: 'fulfillment-failed',
          status: 'failed',
          ts: Date.now(),
        },
      );

      await step.run('send-ops-alert', async () => {
        return sendOrderFulfillmentFailureSlackMessage({
          orderId,
          reason: failureReason,
          amountCents: amountTotal,
          currency: currency ?? 'usd',
          refundSummary,
        });
      });

      return { orderId, recovered: true, refund, reason: failureReason };
    },
  },
  async ({ event, step }) => {
    const data = event.data as OrderPlacedData;

    const {
      orderId,
      stripePaymentIntentId,
      lineItems,
      amountTotal,
      currency,
    } = data;
    const customerEmail = data.encrypted?.customerEmail;
    const customerPhone = data.encrypted?.customerPhone ?? null;
    const shipping = data.encrypted?.shipping ?? null;
    // Mirror the webhook's fallback chain so events from other producers (or
    // older payloads) still record a usable customer name instead of "Unknown".
    const customerName =
      data.encrypted?.customerName ??
      shipping?.name ??
      (customerEmail ? customerEmail.split('@')[0] : null);

    const adminItems = (lineItems ?? []).map((li) => ({
      name: li.productName ?? li.description ?? 'item',
      quantity: li.quantity ?? 1,
    }));

    const emit = async (
      name: string,
      status: 'running' | 'complete' | 'failed',
      output?: Record<string, unknown>,
    ) => {
      const ts = Date.now();
      await step.realtime.publish(
        `emit-${name}-${status}`,
        orderChannel(orderId).step,
        { name, status, output, ts },
      );
      await step.realtime.publish(
        `emit-admin-${name}-${status}`,
        adminChannel.order,
        {
          orderId,
          customerEmail,
          amount: amountTotal,
          currency,
          items: adminItems,
          step: name,
          status,
          ts,
        },
      );
    };

    await emit('capture-payment', 'running');
    let payment: {
      paymentIntentId?: string;
      status: string;
      amount: number;
      currency: string;
    };
    try {
      payment = await step.run('capture-payment', async () => {
        if (!stripePaymentIntentId) {
          return { status: 'mocked', amount: amountTotal, currency };
        }
        const pi = await getStripe().paymentIntents.retrieve(stripePaymentIntentId);
        if (pi.status !== 'succeeded') {
          throw new Error(`PaymentIntent ${pi.id} not succeeded: ${pi.status}`);
        }
        return {
          paymentIntentId: pi.id,
          status: pi.status,
          amount: pi.amount,
          currency: pi.currency,
        };
      });
    } catch (err) {
      await emit('capture-payment', 'failed', { error: errorMessage(err) });
      throw err;
    }
    await emit('capture-payment', 'complete', payment);

    if (data.discount?.code && data.stripeSessionId) {
      await step.run('record-discount-redemption', async () => {
        return recordDiscountRedemption({
          code: data.discount!.code,
          orderId,
          stripeSessionId: data.stripeSessionId!,
          amountCents: data.discount!.amountCents,
        });
      });
    }

    await emit('reserve-inventory', 'running');
    let inventory: {
      reservations: Array<{
        sku: string;
        name: string;
        size: string;
        color: string;
        quantity: number;
        reservedAt: string;
      }>;
      count: number;
    };
    try {
      inventory = await step.run('reserve-inventory', async () => {
        const reservations = await reserveInventory({ orderId, lineItems });
        console.log(`[fulfill-order] reserved inventory for ${orderId}:`, reservations);
        return reservations;
      });
    } catch (err) {
      await emit('reserve-inventory', 'failed', { error: errorMessage(err) });
      throw err;
    }
    await emit('reserve-inventory', 'complete', inventory);

    await step.sendEvent('check-low-stock-after-reserve', {
      id: `inventory-changed-order-${orderId}`,
      name: 'store/inventory.changed',
      data: {
        appOrigin: APP_ORIGIN,
        source: 'order-fulfillment',
        reason: 'Inventory reserved for order fulfillment',
        orderId,
        reservations: inventory.reservations,
      },
    });

    await emit('send-confirmation', 'running');
    const confirmation = await step.run('send-confirmation', async () => {
      if (!customerEmail) {
        return { sent: false as const, skipped: 'no customer email on order' };
      }
      if (!isOrderEmailConfigured()) {
        const missing = [
          !process.env.RESEND_API_KEY && 'RESEND_API_KEY',
          !process.env.ORDER_EMAIL_FROM && 'ORDER_EMAIL_FROM',
        ]
          .filter(Boolean)
          .join(' + ');
        console.log(`[fulfill-order] send-confirmation skipped for ${orderId}: ${missing} not configured`);
        return { sent: false as const, skipped: `${missing} not configured` };
      }
      try {
        return await sendOrderConfirmationEmail({
          to: customerEmail,
          orderId,
          items: (lineItems ?? []).map((li) => ({
            name: li.productName ?? li.description ?? 'item',
            quantity: li.quantity ?? 1,
          })),
          totalCents: amountTotal,
          currency: currency ?? 'usd',
          appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        });
      } catch (err) {
        // A failed confirmation email must never fail the order. Log without
        // PII and surface the error in the step output instead.
        const reason = errorMessage(err);
        console.error(`[fulfill-order] send-confirmation failed for ${orderId}: ${reason}`);
        return { sent: false as const, error: reason };
      }
    });
    await emit('send-confirmation', 'complete', confirmation);

    await emit('record-order', 'running');
    const recorded = await step.run('record-order', async () => {
      const itemsLabel = inventory.reservations
        .map((r) => {
          const variant = [r.size, r.color].filter(Boolean).join('/');
          const variantTag = variant ? ` (${variant})` : '';
          const qtyTag = r.quantity > 1 ? ` × ${r.quantity}` : '';
          return `${r.name}${variantTag}${qtyTag}`;
        })
        .join(', ');

      return recordPendingOrder({
        row: {
          orderId,
          createdAt: new Date().toISOString(),
          email: customerEmail ?? '',
          name: customerName ?? '',
          items: itemsLabel,
          totalCents: amountTotal,
          currency: (currency ?? 'usd').toUpperCase(),
          shipAddress: [shipping?.line1, shipping?.line2].filter(Boolean).join(', '),
          shipCity: shipping?.city ?? '',
          shipState: shipping?.state ?? '',
          shipZip: shipping?.postalCode ?? '',
          shipCountry: shipping?.country ?? '',
          phone: customerPhone ?? '',
          status: 'pending',
          tracking: '',
          notes: data.discount?.code
            ? `Discount ${data.discount.code} applied (${formatCents(data.discount.amountCents)}).`
            : '',
          discountCode: data.discount?.code ?? '',
          discountAmountCents: data.discount?.amountCents ?? 0,
        },
        lineItems,
        stripeSessionId: data.stripeSessionId,
      });
    });
    await emit('record-order', 'complete', recorded);

    return {
      orderId,
      status: 'pending',
      payment,
      inventory,
      confirmation,
      recorded,
    };
  }
);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// The `inngest/function.failed` event nests the original event one level deep,
// where the encryption middleware does not decrypt it. Mirror the middleware's
// decryption here so the failure handler can read PII the same way the main
// handler does. Returns undefined (instead of throwing) so the recovery path
// never dies on a decryption problem.
async function decryptPii(encrypted: unknown): Promise<EncryptedPii | undefined> {
  if (!encrypted) return undefined;
  if (!isEncryptedValue(encrypted)) return encrypted as EncryptedPii;
  const key = process.env.INNGEST_ENCRYPTION_KEY;
  if (!key) return undefined;
  try {
    const service = new LibSodiumEncryptionService(key);
    return (await service.decrypt(encrypted.data)) as EncryptedPii;
  } catch (err) {
    console.error('[fulfill-order] failed to decrypt PII in failure handler:', errorMessage(err));
    return undefined;
  }
}

function formatCents(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}
