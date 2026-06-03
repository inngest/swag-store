import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { fulfillOrder } from '@/inngest/functions/fulfill-order';
import { importInventoryDocument } from '@/inngest/functions/import-inventory-document';
import { importInventory } from '@/inngest/functions/import-inventory';
import { updateOrderStatusFunction } from '@/inngest/functions/update-order-status';
import { notifyLowInventory } from '@/inngest/functions/notify-low-inventory';

// ─── Inngest API Route ────────────────────────────────────────────────────
// This is the single endpoint that Inngest Cloud calls to execute functions.
// During the livestream, run: npx inngest-cli@latest dev
// to connect your local server to Inngest Cloud.

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [fulfillOrder, importInventory, importInventoryDocument, updateOrderStatusFunction, notifyLowInventory],
});
