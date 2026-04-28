import { OrderStatusClient } from '@/components/OrderStatusClient';

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <OrderStatusClient orderId={orderId} />;
}
