import { inngest } from '@/inngest/client';
import { getCheckoutSubtotalCents, normalizeCheckoutItems, type CheckoutCartItem } from './checkout';
import { runSwagCodeAgent, type SwagCodeAgentKind } from './discount-code-agent';
import { getStripe } from './stripe';
import { ensureStripeCouponForDiscount } from './stripe-discounts';
import {
  listPublicProducts,
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

export async function generateSwagCodeForActor(input: {
  actorEmail: string;
  recipient?: string;
  purpose?: string;
  kind: SwagCodeAgentKind;
}): Promise<AdminDiscountCode> {
  return runSwagCodeAgent(input);
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
  if (!customerEmail || !customerName || !shipping?.line1 || !shipping.city || !shipping.state || !shipping.postalCode) {
    throw new Error('Direct API order submission requires customer email, customer/shipping name, and a full shipping address.');
  }

  await inngest.send({
    id: `api-order-placed-${orderId}`,
    name: 'store/order.placed',
    data: {
      orderId,
      stripeSessionId: `api_${orderId}`,
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
