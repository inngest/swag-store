import { inngest } from '../client';
import { orderChannel, adminChannel } from '../channels';
import { getStripe } from '@/lib/stripe';
import { recordDiscountRedemption, recordPendingOrder, reserveInventory } from '@/lib/store-db';

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

export const fulfillOrder = inngest.createFunction(
  {
    id: 'fulfill-order',
    name: 'Fulfill Order',
    retries: 3,
    triggers: [{ event: 'store/order.placed' }],
  },
  async ({ event, step }) => {
    const data = event.data as {
      orderId: string;
      stripePaymentIntentId?: string;
      encrypted?: {
        customerEmail?: string;
        customerName?: string | null;
        customerPhone?: string | null;
        shipping?: ShippingInfo;
      };
      lineItems: LineItem[];
      amountTotal: number;
      currency: string;
      stripeSessionId?: string;
      discount?: {
        code: string;
        amountCents: number;
      } | null;
    };

    const {
      orderId,
      stripePaymentIntentId,
      lineItems,
      amountTotal,
      currency,
    } = data;
    const customerEmail = data.encrypted?.customerEmail;
    const customerName = data.encrypted?.customerName ?? null;
    const customerPhone = data.encrypted?.customerPhone ?? null;
    const shipping = data.encrypted?.shipping ?? null;

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

    await emit('send-confirmation', 'running');
    const confirmation = await step.run('send-confirmation', async () => {
      return {
        delegatedTo: 'stripe',
        sent: true,
        notedAt: new Date().toISOString(),
      };
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

function formatCents(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}
