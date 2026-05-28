import { inngest } from '../client';
import { adminChannel } from '../channels';
import { updateOrderStatus, type OrderStatus } from '@/lib/store-db';

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

    return {
      orderId: data.orderId,
      status: data.status,
      actorEmail: data.actorEmail,
    };
  },
);
