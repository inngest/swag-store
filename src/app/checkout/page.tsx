import { CheckoutClient } from '@/components/CheckoutClient';
import { listPublicProducts } from '@/lib/store-db';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const products = await listPublicProducts();
  return <CheckoutClient products={products} />;
}
