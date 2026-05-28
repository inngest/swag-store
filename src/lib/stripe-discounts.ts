import type Stripe from 'stripe';
import type { AppliedDiscount } from './store-db';
import { setDiscountStripeCouponId } from './store-db';
import { getStripe } from './stripe';

export async function ensureStripeCouponForDiscount(discount: AppliedDiscount): Promise<string> {
  const couponId = stripeCouponId(discount);
  const stripe = getStripe();

  try {
    await stripe.coupons.retrieve(couponId);
    await setDiscountStripeCouponId({ code: discount.code, stripeCouponId: couponId });
    return couponId;
  } catch (err) {
    if (!isStripeNotFound(err)) throw err;
  }

  const params: Stripe.CouponCreateParams = {
    id: couponId,
    duration: 'once',
    max_redemptions: 1,
    name: discount.label || discount.code,
    metadata: {
      source: 'swag-store',
      discountCode: discount.code,
      discountType: discount.type,
    },
  };

  if (discount.type === 'amount_off') {
    params.amount_off = discount.amountOffCents ?? discount.discountCents;
    params.currency = 'usd';
  } else {
    params.percent_off = discount.percentOff ?? 100;
  }

  try {
    await stripe.coupons.create(params);
  } catch (err) {
    if (!isStripeAlreadyExists(err)) throw err;
  }

  await setDiscountStripeCouponId({ code: discount.code, stripeCouponId: couponId });
  return couponId;
}

function stripeCouponId(discount: AppliedDiscount): string {
  const value =
    discount.type === 'amount_off'
      ? `amount-${discount.amountOffCents ?? discount.discountCents}`
      : `percent-${String(discount.percentOff ?? 100).replace('.', '_')}`;
  return `swag_${discount.code.toLowerCase()}_${value}`;
}

function isStripeNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'statusCode' in err && err.statusCode === 404;
}

function isStripeAlreadyExists(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'resource_already_exists'
  );
}
