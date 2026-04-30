import { cookies } from 'next/headers';
import { OrderStatusClient } from '@/components/OrderStatusClient';

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const cookieStore = await cookies();
  const unlocked = cookieStore.get(`order_unlock_${orderId}`)?.value === '1';
  // Default is masked. Only the customer who completed checkout (and got the
  // unlock cookie set on the confirmation page) sees full PII.
  return <OrderStatusClient orderId={orderId} publicView={!unlocked} />;
}
