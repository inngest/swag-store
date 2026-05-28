import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { fulfillOrder } from '@/inngest/functions/fulfill-order';
import { importInventory } from '@/inngest/functions/import-inventory';
import { updateOrderStatusFunction } from '@/inngest/functions/update-order-status';

// ─── Inngest API Route ────────────────────────────────────────────────────
// This is the single endpoint that Inngest Cloud calls to execute functions.
// During the livestream, run: npx inngest-cli@latest dev
// to connect your local server to Inngest Cloud.

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [fulfillOrder, importInventory, updateOrderStatusFunction],
});
