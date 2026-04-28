# Stream-Day Prep — Inngest Swag Store

**Stream:** Wed Apr 29, 2026 — 45 min
**Goal:** Use the Inngest Claude Code Plugin to wire the durable backend live.

This document is the manifest for what's pre-installed vs. what we build live.

---

## What's pre-installed (the audience does NOT see this happen)

The frontend is done. The durable backend is the demo.

| Pre-installed | Why |
|---------------|-----|
| Next.js 16 app with full UI (catalog, product, cart, checkout, confirmation, order status, admin) | Frontend is AX-irrelevant. Audience cares about durable workflows, not Tailwind. |
| 4 SKUs with real product photos (`public/products/*.png`) | Photos came from Claude Design iteration; not the demo. |
| Inngest official logo SVGs (`public/logotype.svg`, `public/mark.svg`) | Brand assets; not the demo. |
| `inngest` v4 package + `inngest.client` configured | The plugin builds *with* the SDK, not *to install* it. |
| `.env.local` placeholders for Stripe keys | Sterling fills in real values before stream. |
| Inngest dev server runs on `:8288` | One-line bash command at the top of stream. |
| Stripe CLI installed + `stripe login` done | Catastrophic if it fails on stream. |
| All `npm install` complete | No "watch dependencies install" theater. |

---

## What's stubbed (the plugin builds these LIVE)

Three files. Each is a clear stub with a `TODO (livestream Block N)` comment so the plugin has an obvious target.

### Block 1 — Stripe webhook → Inngest event (target: 15 min)
**File:** `src/app/api/webhooks/stripe/route.ts`
**Current state:** Bare POST handler that logs the body and returns 200.
**Plugin will add:** Stripe signature validation + `inngest.send({ name: "store/order.placed", ... })` on `checkout.session.completed`.
**Plugin skill expected:** `inngest-events`

### Block 2 — Durable fulfill-order workflow (target: 15 min)
**File:** `src/inngest/functions/fulfill-order.ts`
**Current state:** Empty function shell with a TODO listing the 3 steps.
**Plugin will add:** Three `step.run()` calls — `capture-payment`, `reserve-inventory`, `send-confirmation`. Each step publishes a Realtime event.
**Plugin skill expected:** `inngest-steps`

### Block 3 — Realtime to /orders/[id] (target: 10 min)
**Files touched:**
- `src/inngest/client.ts` — add `realtimeMiddleware()`
- `src/inngest/channels.ts` (new) — define `orderChannel` with `step` topic
- `src/inngest/functions/fulfill-order.ts` — add `publish()` calls inside each `step.run`
- `src/app/orders/[orderId]/actions.ts` (new) — server action that mints a subscription token
- `src/components/OrderStatusClient.tsx` — replace static state with `useInngestSubscription()`

**Pre-installed:** `@inngest/realtime@^0.4.6` is in `package.json`. No skill firing required for the install.

**Confirmed API (from plugin's own docs via `grep_docs realtime`):**

Server (channel + middleware):
```ts
// src/inngest/channels.ts
import { channel, topic } from "@inngest/realtime";
import { z } from "zod";

export const orderChannel = channel((orderId: string) => `order:${orderId}`)
  .addTopic(topic("step").schema(
    z.object({ name: z.string(), status: z.enum(["running","complete","failed"]), output: z.any().optional() })
  ));

// src/inngest/client.ts (add middleware)
import { realtimeMiddleware } from "@inngest/realtime";
export const inngest = new Inngest({
  id: "inngest-swag-store",
  middleware: [realtimeMiddleware()],
});
```

In `fulfill-order.ts`, each `step.run` publishes:
```ts
async ({ event, step, publish }) => {
  const { orderId } = event.data;
  await publish(orderChannel(orderId).step({ name: "capture-payment", status: "running" }));
  const payment = await step.run("capture-payment", async () => { /* ... */ });
  await publish(orderChannel(orderId).step({ name: "capture-payment", status: "complete", output: payment }));
}
```

Client (server action + hook):
```ts
// src/app/orders/[orderId]/actions.ts
"use server";
import { getSubscriptionToken } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { orderChannel } from "@/inngest/channels";

export async function fetchOrderSubscriptionToken(orderId: string) {
  return getSubscriptionToken(inngest, { channel: orderChannel(orderId), topics: ["step"] });
}

// In OrderStatusClient.tsx
"use client";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { fetchOrderSubscriptionToken } from "@/app/orders/[orderId]/actions";

const { data } = useInngestSubscription({
  refreshToken: () => fetchOrderSubscriptionToken(orderId),
});
// data is Array<Realtime.Message> — fold into steps state
```

**Plugin skill expected:** `inngest-middleware` for the `realtimeMiddleware()` registration. The rest may not match a single skill cleanly — that's fine. Worst case, the plugin uses `grep_docs` (via the `inngest-dev` MCP) to find the pattern and writes the code from the docs. We've verified that path: `grep_docs realtime` returns 30+ matches and `read_doc features/realtime/react-hooks.mdx` has the exact pattern above.

**Buffer:** 5 min wrap, Discord alpha plug, Q&A.

---

## Stream-day checklist (run in order)

### T-15 min before going live
1. `cd ~/projects/inngest-swag-store`
2. `git status` — should be clean on the baseline commit
3. Open `.env.local` — confirm `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL` are real values (not `REPLACE_ME`)
4. **Terminal 1:** `npm run dev` — Next.js on `:3000`. Confirm http://localhost:3000 renders the catalog with real product photos.
5. **Terminal 2:** `npx inngest-cli@latest dev` — Inngest dev server on `:8288`. Confirm http://localhost:8288 renders the dashboard.
6. **Terminal 3:** `stripe listen --forward-to localhost:3000/api/webhooks/stripe` — copy the `whsec_...` value into `.env.local` if it changed.
7. Open Claude Code in the repo. Confirm the **Inngest plugin v0.1.0** is loaded — `/plugin` should list 6 Inngest skills.
8. Open Stripe Dashboard test mode in a tab: https://dashboard.stripe.com/acct_1TQxNnIu03N9q0rK/test/apps/installed
9. Open Claude Design tab: https://claude.ai/design/p/019dd004-d502-7562-8427-d7e0e262d7e3?file=Inngest+Swag+Store.html
10. Close all unrelated apps / notifications.

### Stream open (0–5 min)
- Show the catalog rendering at localhost:3000. Click into a product. Add to cart. Show the live `inngest.send()` event preview in the cart drawer.
- Frame: "I designed this with Claude Design and a teammate, and the static frontend is done. What's missing is everything that makes this real — Stripe events into a durable workflow, real-time order tracking. That's what we're building today, with the Inngest plugin."

### Block 1 — 5–20 min
- Open Claude Code with the plugin loaded.
- Prompt with the problem shape, e.g.: *"I have a Stripe webhook handler at `src/app/api/webhooks/stripe/route.ts` that needs to validate the Stripe signature and fire an Inngest event `store/order.placed` when a checkout session completes. The order data should include orderId, stripeSessionId, lineItems, customerEmail."*
- Watch the plugin's `inngest-events` skill scaffold the handler.
- Test: trigger from Stripe CLI: `stripe trigger checkout.session.completed`. Confirm the event lands in the Inngest dev server.

### Block 2 — 20–35 min
- Prompt: *"I need a durable Inngest function `fulfill-order` triggered by `store/order.placed`. Three steps: capture-payment (confirm Stripe PaymentIntent), reserve-inventory (decrement SKU stock), send-confirmation (mock email). Each step should publish a Realtime event on channel `order:{orderId}` with the step name, status, and output."*
- Watch the plugin's `inngest-steps` skill build the function.
- Test: fire a manual event from the Inngest dev server. Watch all three steps run.

### Block 3 — 35–43 min
- Prompt: *"In `src/components/OrderStatusClient.tsx`, subscribe to the Inngest Realtime channel `order:{orderId}`. Each incoming event has `{ step, status, output }`. Update the steps array so the existing UI animates as steps progress."*
- Watch the plugin's `inngest-realtime` skill wire the subscription.
- Test: end-to-end flow — `stripe trigger`, watch `/orders/[id]` animate live.

### Wrap (43–45 min)
- Recap what we built.
- Plug Discord alpha: "The plugin is at [link]. Try it. Friction goes to me."
- "Next stream we add concurrency, retries, and `step.sleep()` for delayed actions."

---

## Knowns / gotchas

- **`@inngest/realtime` is the canonical package** (verified via plugin docs Apr 28). Earlier note about the package being deprecated was wrong. Pre-installed at `^0.4.6`.
- **Citrine hex `#EFE9D6`** in the codebase is technically off — the brand Citrine is `#EFE915`. The current value functions as a warm cream foreground; not worth correcting before stream.
- **5-step → 3-step.** The reference build had 5 steps (capture-payment, reserve-inventory, submit-to-fulfillment, generate-shipping-label, send-confirmation). Baseline cuts to 3. If the plugin tries to scaffold 5, that's an audience question opportunity.
- **`fulfillOrder` not yet registered.** The stub is in `src/inngest/functions/fulfill-order.ts` but check that `src/app/api/inngest/route.ts` includes it in the `serve()` array before stream — should already, but verify.

---

## How to reset between rehearsals

The baseline is committed on git:
```bash
git log --oneline -3
# baseline commit hash should be at the top
git reset --hard <baseline-commit>
```

Or, if zipped:
```bash
rm -rf ~/projects/inngest-swag-store
unzip ~/Desktop/inngest-swag-store-baseline.zip -d ~/projects/
cd ~/projects/inngest-swag-store
npm install   # if node_modules wasn't in the zip
npm run dev
```

---

## Reference branch

`reference/full-build` (git tag) preserves the design-agent's complete implementation — the "after" state. Useful for diffing what the plugin should produce.

```bash
git diff main reference/full-build -- src/inngest/functions/fulfill-order.ts
```
