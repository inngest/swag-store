import Stripe from 'stripe';

let cached: Stripe | null = null;

// Lazy-init so missing env vars don't break Next.js build-time page data
// collection. The actual API call only fails at request time, where we can
// surface a useful error.
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  cached = new Stripe(key);
  return cached;
}
