import { NonRetriableError } from 'inngest';
import { inngest } from '../client';
import { adminChannel, orderChannel } from '../channels';
import { isOrderStatus, updateOrderStatus, type OrderStatus } from '@/lib/store-db';

export const updateOrderStatusFunction = inngest.createFunction(
  {
    id: 'update-order-status',
    name: 'Update Order Status',
    retries: 2,
    triggers: [{ event: 'admin/order.status_update.requested' }],
  },
  async ({ event, step }) => {
    const data = event.data as {
      orderId: string;
      status: OrderStatus;
      tracking?: string;
      notes?: string;
      actorEmail?: string;
    };

    if (!isOrderStatus(data.status)) {
      throw new NonRetriableError(`Invalid order status: ${String(data.status)}`);
    }

    await step.run('update-order-status', async () => {
      await updateOrderStatus({
        orderId: data.orderId,
        status: data.status,
        tracking: data.tracking,
        notes: data.notes,
      });
    });

    await step.realtime.publish('emit-admin-status-update', adminChannel.order, {
      orderId: data.orderId,
      step: data.status,
      status: 'complete',
      ts: Date.now(),
    });

    await step.realtime.publish(
      'emit-order-status-update',
      orderChannel(data.orderId).status,
      {
        status: data.status,
        tracking: data.tracking,
        ts: Date.now(),
      },
    );

    return {
      orderId: data.orderId,
      status: data.status,
      actorEmail: data.actorEmail,
    };
  },
);
