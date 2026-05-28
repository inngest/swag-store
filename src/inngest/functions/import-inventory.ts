import { inngest } from '../client';
import { adminChannel } from '../channels';
import { importInventorySheet } from '@/lib/inventory-import';

export const importInventory = inngest.createFunction(
  {
    id: 'import-inventory',
    name: 'Import Inventory',
    retries: 2,
    triggers: [{ event: 'admin/inventory.import.requested' }],
  },
  async ({ event, step }) => {
    const data = event.data as {
      actorEmail?: string;
    };

    await step.realtime.publish('emit-import-running', adminChannel.import, {
      status: 'running',
      message: 'Importing Riley inventory sheet',
      ts: Date.now(),
    });

    try {
      const result = await step.run('import-google-sheet', async () => {
        return importInventorySheet({ actorEmail: data.actorEmail ?? '' });
      });

      await step.realtime.publish('emit-import-complete', adminChannel.import, {
        importRunId: result.importRunId,
        status: 'complete',
        message: `Imported ${result.variants} variants`,
        ts: Date.now(),
      });

      return result;
    } catch (err) {
      await step.realtime.publish('emit-import-failed', adminChannel.import, {
        status: 'failed',
        message: err instanceof Error ? err.message : String(err),
        ts: Date.now(),
      });
      throw err;
    }
  },
);
