import { CheckoutClient } from '@/components/CheckoutClient';
import { listPublicProducts } from '@/lib/store-db';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const products = await listPublicProducts();
  // The badge tracks the actual key in use, so flipping to live keys clears
  // the TEST MODE label with no code change.
  const stripeTestMode = (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test');
  return <CheckoutClient products={products} stripeTestMode={stripeTestMode} />;
}
