import { Inngest } from 'inngest';

// ─── Inngest client ────────────────────────────────────────────────────────
// This is the single Inngest client for the store.
// All events and functions reference this client.

export const inngest = new Inngest({
  id: 'inngest-swag-store',
  // In production, set INNGEST_EVENT_KEY env var
});
