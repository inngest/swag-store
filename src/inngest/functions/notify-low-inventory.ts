import { inngest } from '../client';
import { originTrigger } from '@/lib/app-origin';
import {
  listLowStockInventory,
  recordLowStockNotificationCandidates,
} from '@/lib/store-db';
import { sendLowStockSlackMessage } from '@/lib/slack';

export const notifyLowInventory = inngest.createFunction(
  {
    id: 'notify-low-inventory',
    name: 'Notify Low Inventory',
    retries: 3,
    triggers: [
      originTrigger('store/inventory.changed'),
      { cron: 'TZ=America/Los_Angeles 0 9 * * *' },
    ],
  },
  async ({ event, step }) => {
    const data = event.data as {
      source?: string;
      reason?: string;
      orderId?: string;
      importRunId?: number;
      batchId?: string;
      actorEmail?: string;
    };
    const threshold = lowStockThreshold();
    const source = [
      event.name === 'store/inventory.changed' ? data.source ?? 'inventory-change' : 'daily-check',
      data.reason,
      data.orderId && `order:${data.orderId}`,
      data.importRunId && `import:${data.importRunId}`,
      data.batchId && `batch:${data.batchId}`,
      data.actorEmail && `actor:${data.actorEmail}`,
    ].filter(Boolean).join(' · ');

    const lowStockRows = await step.run('list-low-stock-inventory', async () => {
      return listLowStockInventory(threshold);
    });

    if (lowStockRows.length === 0) {
      await step.run('resolve-low-stock-notifications', async () => {
        return recordLowStockNotificationCandidates({ threshold, rows: [] });
      });
      return { status: 'ok', threshold, lowStockCount: 0, notified: 0 };
    }

    const rowsToNotify = await step.run('dedupe-low-stock-notifications', async () => {
      return recordLowStockNotificationCandidates({ threshold, rows: lowStockRows });
    });

    if (rowsToNotify.length === 0) {
      return { status: 'ok', threshold, lowStockCount: lowStockRows.length, notified: 0 };
    }

    const slack = await step.run('send-slack-low-stock-notification', async () => {
      return sendLowStockSlackMessage({
        rows: rowsToNotify,
        threshold,
        source,
      });
    });

    return {
      status: 'ok',
      threshold,
      lowStockCount: lowStockRows.length,
      notified: rowsToNotify.length,
      slack,
    };
  },
);

function lowStockThreshold(): number {
  const threshold = Number(process.env.LOW_STOCK_THRESHOLD ?? 5);
  return Number.isSafeInteger(threshold) && threshold >= 0 ? threshold : 5;
}

