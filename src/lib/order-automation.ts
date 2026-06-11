import { inngest } from '@/inngest/client';
import { APP_ORIGIN } from './app-origin';
import { getCheckoutSubtotalCents, normalizeCheckoutItems, type CheckoutCartItem } from './checkout';
import { runSwagCodeAgent, runSwagCodeAgentBatch, type SwagCodeAgentKind } from './discount-code-agent';
import { getStripe } from './stripe';
import { ensureStripeCouponForDiscount } from './stripe-discounts';
import {
  listPublicProducts,
  recordDiscountRedemption,
  validateCartAvailability,
  validateDiscountCode,
  type AdminDiscountCode,
} from './store-db';

export type AutomatedOrderInput = {
  items: CheckoutCartItem[];
  discountCode?: string;
  customer?: {
    email?: string;
    name?: string;
    phone?: string;
  };
  shipping?: {
    name?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
};

export type EventSwagOrderInput = Omit<AutomatedOrderInput, 'discountCode'> & {
  eventName: string;
  eventDate?: string;
  recipient?: string;
  purpose?: string;
};

export type AutomatedOrderResult =
  | {
      status: 'submitted';
      orderId: string;
      orderUrl: string;
      totalCents: number;
      discountCode: string;
      discountAmountCents: number;
    }
  | {
      status: 'payment_required';
      orderId: string;
      checkoutUrl: string;
      totalCents: number;
      discountCode: string;
      discountAmountCents: number;
    };

export type AutomatedOrderPreview = {
  status: 'ready_for_direct_submit' | 'needs_customer_shipping' | 'payment_required';
  subtotalCents: number;
  discountCode: string;
  discountAmountCents: number;
  totalCents: number;
  missingFields: string[];
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    variantId: string;
    size: string;
    color: string;
    quantity: number;
    unitAmountCents: number;
    amountTotalCents: number;
  }>;
  nextAction: string;
};

export type EventSwagOrderPreview = Omit<AutomatedOrderPreview, 'discountCode' | 'nextAction'> & {
  eventName: string;
  eventDate: string;
  recipient: string;
  discountCode: '';
  nextAction: string;
};

export type EventSwagOrderResult = {
  discountCode: AdminDiscountCode;
  order: AutomatedOrderResult;
};

export async function generateSwagCodeForActor(input: {
  actorEmail: string;
  recipient?: string;
  purpose?: string;
  kind: SwagCodeAgentKind;
}): Promise<AdminDiscountCode> {
  return runSwagCodeAgent(input);
}

export async function generateSwagCodesForActor(input: {
  actorEmail: string;
  recipient?: string;
  purpose?: string;
  kind: SwagCodeAgentKind;
  count?: number;
}): Promise<AdminDiscountCode[]> {
  return runSwagCodeAgentBatch(input);
}

export async function listAutomationProducts() {
  const products = await listPublicProducts();
  return products.map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    sku: product.sku,
    priceCents: product.price,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      size: variant.size ?? '',
      color: variant.color ?? '',
      stock: variant.stock,
    })),
  }));
}

export async function previewAutomatedOrder(input: AutomatedOrderInput): Promise<AutomatedOrderPreview> {
  const prepared = await prepareCheckout(input.items, input.discountCode);
  const discountCode = prepared.appliedDiscount?.code ?? '';
  const discountAmountCents = prepared.appliedDiscount?.discountCents ?? 0;
  const totalCents = Math.max(0, prepared.subtotalCents - discountAmountCents);
  const missingFields = totalCents === 0 ? missingDirectOrderFields(input) : [];
  const status = totalCents > 0
    ? 'payment_required'
    : missingFields.length
      ? 'needs_customer_shipping'
      : 'ready_for_direct_submit';

  return {
    status,
    subtotalCents: prepared.subtotalCents,
    discountCode,
    discountAmountCents,
    totalCents,
    missingFields,
    items: prepared.lineItemsForEvent.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      variantId: item.variantId,
      size: item.size ?? '',
      color: item.color ?? '',
      quantity: item.quantity,
      unitAmountCents: Math.round(item.amountTotal / item.quantity),
      amountTotalCents: item.amountTotal,
    })),
    nextAction: orderPreviewNextAction(status),
  };
}

export async function previewEventSwagOrder({
  input,
  actorEmail,
}: {
  input: EventSwagOrderInput;
  actorEmail: string;
}): Promise<EventSwagOrderPreview> {
  const eventName = normalizeEventName(input.eventName);
  const prepared = await prepareCheckout(input.items);
  const missingFields = missingDirectOrderFields(input);
  const status = missingFields.length ? 'needs_customer_shipping' : 'ready_for_direct_submit';

  return {
    status,
    eventName,
    eventDate: input.eventDate?.trim() ?? '',
    recipient: input.recipient?.trim() || actorEmail,
    subtotalCents: prepared.subtotalCents,
    discountCode: '',
    discountAmountCents: prepared.subtotalCents,
    totalCents: 0,
    missingFields,
    items: prepared.lineItemsForEvent.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      variantId: item.variantId,
      size: item.size ?? '',
      color: item.color ?? '',
      quantity: item.quantity,
      unitAmountCents: Math.round(item.amountTotal / item.quantity),
      amountTotalCents: item.amountTotal,
    })),
    nextAction: missingFields.length
      ? 'Collect the missing customer and shipping fields before calling create_event_order.'
      : 'Call create_event_order after the user confirms the event swag order details.',
  };
}

export async function createEventSwagOrder({
  input,
  actorEmail,
  origin,
}: {
  input: EventSwagOrderInput;
  actorEmail: string;
  origin: string;
}): Promise<EventSwagOrderResult> {
  const eventName = normalizeEventName(input.eventName);
  const purpose = [
    'Event swag order',
    eventName,
    input.eventDate?.trim() && `on ${input.eventDate.trim()}`,
    input.purpose?.trim(),
  ].filter(Boolean).join(' - ');
  const discountCode = await generateSwagCodeForActor({
    actorEmail,
    kind: 'devrel_comp',
    recipient: input.recipient?.trim() || actorEmail,
    purpose,
  });
  const order = await submitAutomatedOrder({
    input: {
      ...input,
      discountCode: discountCode.code,
    },
    origin,
  });

  return { discountCode, order };
}

export async function submitAutomatedOrder({
  input,
  origin,
}: {
  input: AutomatedOrderInput;
  origin: string;
}): Promise<AutomatedOrderResult> {
  const prepared = await prepareCheckout(input.items, input.discountCode);
  const orderId = newOrderId();
  const discountCode = prepared.appliedDiscount?.code ?? '';
  const discountAmountCents = prepared.appliedDiscount?.discountCents ?? 0;
  const totalCents = Math.max(0, prepared.subtotalCents - discountAmountCents);

  if (totalCents > 0) {
    const session = await createStripeCheckoutSession({
      orderId,
      origin,
      lineItems: prepared.lineItems,
      appliedDiscount: prepared.appliedDiscount,
      customerEmail: input.customer?.email,
    });

    return {
      status: 'payment_required',
      orderId,
      checkoutUrl: session.url,
      totalCents,
      discountCode,
      discountAmountCents,
    };
  }

  const customerEmail = input.customer?.email?.trim();
  const customerName = input.customer?.name?.trim() || input.shipping?.name?.trim();
  const shipping = input.shipping;
  if (missingDirectOrderFields(input).length || !shipping) {
    throw new Error('Direct API order submission requires customer email, customer/shipping name, and a full shipping address.');
  }

  const stripeSessionId = `api_${orderId}`;
  if (prepared.appliedDiscount) {
    await recordDiscountRedemption({
      code: prepared.appliedDiscount.code,
      orderId,
      stripeSessionId,
      amountCents: prepared.appliedDiscount.discountCents,
    });
  }

  await inngest.send({
    id: `api-order-placed-${orderId}`,
    name: 'store/order.placed',
    data: {
      appOrigin: APP_ORIGIN,
      orderId,
      stripeSessionId,
      encrypted: {
        customerEmail,
        customerName,
        customerPhone: input.customer?.phone ?? null,
        shipping: {
          name: shipping.name ?? customerName,
          line1: shipping.line1,
          line2: shipping.line2 ?? null,
          city: shipping.city,
          state: shipping.state,
          postalCode: shipping.postalCode,
          country: shipping.country ?? 'US',
        },
      },
      amountTotal: 0,
      currency: 'usd',
      discount: prepared.appliedDiscount
        ? {
            code: prepared.appliedDiscount.code,
            amountCents: prepared.appliedDiscount.discountCents,
          }
        : null,
      lineItems: prepared.lineItemsForEvent,
      metadata: {
        orderId,
        source: 'api',
        discountCode,
        discountAmountCents: String(discountAmountCents),
      },
    },
  });

  return {
    status: 'submitted',
    orderId,
    orderUrl: `${origin}/orders/${orderId}`,
    totalCents,
    discountCode,
    discountAmountCents,
  };
}

export async function createCheckoutSessionForCart({
  items,
  discountCode,
  origin,
}: {
  items: CheckoutCartItem[];
  discountCode?: string;
  origin: string;
}): Promise<{ url: string; orderId: string }> {
  const prepared = await prepareCheckout(items, discountCode);
  const orderId = newOrderId();
  const session = await createStripeCheckoutSession({
    orderId,
    origin,
    lineItems: prepared.lineItems,
    appliedDiscount: prepared.appliedDiscount,
  });

  return { url: session.url, orderId };
}

function missingDirectOrderFields(input: AutomatedOrderInput): string[] {
  const customerEmail = input.customer?.email?.trim();
  const customerName = input.customer?.name?.trim() || input.shipping?.name?.trim();
  const shipping = input.shipping;
  const missing: string[] = [];

  if (!customerEmail) missing.push('customer.email');
  if (!customerName) missing.push('customer.name or shipping.name');
  if (!shipping?.line1?.trim()) missing.push('shipping.line1');
  if (!shipping?.city?.trim()) missing.push('shipping.city');
  if (!shipping?.state?.trim()) missing.push('shipping.state');
  if (!shipping?.postalCode?.trim()) missing.push('shipping.postalCode');

  return missing;
}

function orderPreviewNextAction(status: AutomatedOrderPreview['status']): string {
  if (status === 'payment_required') {
    return 'Call submit_order only after the user approves a Stripe Checkout session; then return checkoutUrl to the user.';
  }

  if (status === 'needs_customer_shipping') {
    return 'Collect the missing customer and shipping fields before calling submit_order.';
  }

  return 'Call submit_order after the user confirms the zero-dollar order details.';
}

function normalizeEventName(eventName: string): string {
  const normalized = eventName.trim();
  if (!normalized) throw new Error('eventName is required for event swag orders.');
  return normalized;
}

async function prepareCheckout(items: CheckoutCartItem[], discountCode?: string) {
  const products = await listPublicProducts();
  const normalizedItems = normalizeCheckoutItems(items, products);

  await validateCartAvailability(
    normalizedItems.map(({ product, variant, quantity }) => ({
      productId: product.id,
      variantId: variant.id,
      quantity,
    })),
  );

  const subtotalCents = getCheckoutSubtotalCents(normalizedItems);
  const appliedDiscount = discountCode?.trim()
    ? await validateDiscountCode({ code: discountCode, subtotalCents })
    : null;

  const lineItems = normalizedItems.map(({ product, variant, quantity }) => {
    const descriptionParts = [variant.size && `Size: ${variant.size}`, variant.color && `Color: ${variant.color}`]
      .filter(Boolean)
      .join(' · ');

    return {
      price_data: {
        currency: 'usd',
        product_data: {
          name: product.name,
          ...(descriptionParts ? { description: descriptionParts } : {}),
          metadata: {
            productId: product.id,
            sku: product.sku,
            variantId: variant.id,
            size: variant.size ?? '',
            color: variant.color ?? '',
          },
        },
        unit_amount: product.price,
      },
      quantity,
    };
  });

  const lineItemsForEvent = normalizedItems.map(({ product, variant, quantity }) => ({
    description: product.name,
    quantity,
    amountTotal: product.price * quantity,
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    variantId: variant.id,
    size: variant.size,
    color: variant.color,
  }));

  return {
    appliedDiscount,
    lineItems,
    lineItemsForEvent,
    subtotalCents,
  };
}

async function createStripeCheckoutSession({
  orderId,
  origin,
  lineItems,
  appliedDiscount,
  customerEmail,
}: {
  orderId: string;
  origin: string;
  lineItems: Array<{
    price_data: {
      currency: string;
      product_data: {
        name: string;
        description?: string;
        metadata: Record<string, string>;
      };
      unit_amount: number;
    };
    quantity: number;
  }>;
  appliedDiscount: Awaited<ReturnType<typeof validateDiscountCode>> | null;
  customerEmail?: string;
}): Promise<{ url: string }> {
  const stripeCouponId = appliedDiscount
    ? await ensureStripeCouponForDiscount(appliedDiscount)
    : null;

  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
    success_url: `${origin}/orders/confirmation?ord=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout`,
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    metadata: {
      orderId,
      // Tags the session with the app that created it so the shared Stripe
      // webhook can ignore sessions belonging to the other deployment.
      appOrigin: APP_ORIGIN,
      discountCode: appliedDiscount?.code ?? '',
      discountAmountCents: appliedDiscount ? String(appliedDiscount.discountCents) : '',
    },
    shipping_address_collection: {
      allowed_countries: ['US', 'CA'],
    },
    billing_address_collection: 'auto',
    phone_number_collection: { enabled: true },
  });

  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL');
  }

  return { url: session.url };
}

function newOrderId(): string {
  return `ord_${Math.random().toString(36).slice(2, 10)}`;
}
