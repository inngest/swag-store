# Inngest Swag Store — Livestream Build Handoff
**Apr 29, 2026 — Built with Inngest Claude Code Plugin**

---

## What Was Pre-Built

This repo is the reference implementation. The livestream demonstrates the plugin building it from the PRD. Everything here is what the plugin should produce.

---

## Project Location

```
~/projects/inngest-swag-store/
```

Run locally:
```bash
cd ~/projects/inngest-swag-store
npm run dev
# Open http://localhost:3000
```

Run with Inngest dev server:
```bash
# Terminal 1
npm run dev

# Terminal 2
npx inngest-cli@latest dev
# Connects to http://localhost:3000/api/inngest
```

---

## Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 16 (App Router) | TypeScript, Tailwind, src/ dir |
| UI | shadcn/ui + custom | Badge, Card, Sheet, Separator installed |
| Styling | CSS custom properties + inline styles | Brand tokens via CSS vars, no Tailwind utilities needed for brand fidelity |
| Payments | Stripe Checkout (hosted) | No card UI designed — redirect to Stripe |
| Workflows | Inngest v4 | `fulfill-order` function, 5 steps |
| State | React context (CartProvider) | Client-side only, no persistence |
| Data | Static catalog (`src/lib/catalog.ts`) | 4 SKUs, stub variants |

---

## Pages & Routes

| Route | Type | Description |
|-------|------|-------------|
| `/` | Static | Hero + full catalog grid |
| `/products/[slug]` | SSG (4 pages) | Product detail with size/color selector |
| `/checkout` | Client | Order review + Stripe redirect loading state |
| `/orders/[orderId]` | Dynamic | **Inngest moneyshot** — real-time workflow status |
| `/orders/confirmation` | Static | Post-Stripe redirect confirmation |
| `/admin` | Client | Internal order list with live status (demo) |
| `/api/inngest` | API | Inngest function handler (GET/POST/PUT) |
| `/api/checkout` | API | Creates Stripe Checkout Session |
| `/api/webhooks/stripe` | API | Receives Stripe webhook, fires Inngest event |

---

## Inngest Function

**File:** `src/inngest/functions/fulfill-order.ts`

**Event:** `store/order.placed`

**Steps (in order):**
1. `step.run("capture-payment")` — Stripe payment intent capture
2. `step.run("reserve-inventory")` — Decrement stock per SKU
3. `step.run("submit-to-fulfillment")` — POST to fulfillment provider
4. `step.run("generate-shipping-label")` — Get tracking from provider
5. `step.run("send-confirmation")` — Confirmation email via Resend/SendGrid

**Key talking point for livestream:**
> "If step 3 fails and retries, steps 1 and 2 don't re-run. Stripe doesn't get charged twice, inventory doesn't go negative twice. That's durable execution."

---

## Catalog (Static SKUs)

| Product | Slug | Price | Sizes | Colors |
|---------|------|-------|-------|--------|
| Durably Yours T-shirt | `durably-yours-tee` | $35.00 | XS-XXL | Quantum Black, Citrine Cream |
| Inngest Hoodie | `inngest-hoodie` | $65.00 | S-XXL | Quantum Black |
| Step Function Sticker Pack | `step-function-sticker-pack` | $12.00 | — | — |
| Inngest Enamel Pin | `enamel-pin` | $15.00 | — | — |

**Source file:** `src/lib/catalog.ts` — edit this to add products during the livestream.

---

## Design System Quick Reference

**Background:** `#1A161C` (Nebula)
**Text:** `#EFE9D6` (Citrine)
**Accent:** `#FF7300` (Citrus Glow)
**Secondary bg:** `#362C40` (Quantum)
**Success:** `#59A569` (Matcha)

**Font (dev proxy):** Space Grotesk + Space Mono
**Font (production):** ABC Whyte Inktrap (H1) + ABC Whyte (H2/body) + ABC Whyte Mono (labels)
**Border radius:** `0px` everywhere — sharp corners
**Border default:** `rgba(239,233,214,0.12)`

Full reference: `DESIGN-SYSTEM.md`

---

## Environment Variables Needed (production)

```env
# .env.local
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## Livestream Build Order (suggested)

1. **Show the design** — open `http://localhost:3000`, walk all pages (5 min)
2. **Explain the catalog** — open `src/lib/catalog.ts`, show static SKUs (2 min)
3. **Show the Inngest function** — open `fulfill-order.ts`, explain step memoization (5 min)
4. **Demo the workflow** — go to `/orders/any-id`, watch steps animate (3 min)
5. **Show the admin** — go to `/admin`, watch orders advance in real time (2 min)
6. **Live-add a product** — add a 5th SKU to `catalog.ts` with plugin help (5 min)
7. **Connect real Stripe** — swap mock checkout for real Stripe session (10 min)
8. **Connect real Inngest** — `npx inngest-cli dev`, fire a real event (5 min)

---

## What's Stubbed / Not Real (by design)

| Feature | Status | Notes |
|---------|--------|-------|
| Product images | Gradient placeholders | Replace with real photos |
| Stripe checkout | Mock redirect | Wire up `STRIPE_SECRET_KEY` |
| Stripe webhooks | Stub parsing | Add `stripe.webhooks.constructEvent()` |
| Email sending | `console.log` | Add Resend or SendGrid |
| Order persistence | None | Add a DB (Turso/Neon/Supabase) |
| Inventory stock | In-memory only | Add a DB |
| Auth/accounts | None | Intentionally omitted |
| Order status polling | Demo timer | Wire to Inngest run status API |

---

## Open Questions / Known Issues

1. **ABC Whyte font:** Space Grotesk is a reasonable grotesque proxy but lacks the Inktrap joints that give the brand H1s their character. The livestream should call this out — purchase and swap post-launch.

2. **Order status polling:** The current `/orders/[id]` page uses a client-side timer to simulate step advancement. For the real demo, use [Inngest Realtime](https://www.inngest.com/docs/guides/realtime) or poll `GET /api/run-status?runId=xxx` which calls the Inngest API.

3. **Product images:** Gradient placeholders are intentional for the demo — they look good. If you want real product images, generate them with Gemini or Midjourney before the stream.

4. **No persistence:** Every page refresh resets cart state. For the livestream this is fine — just don't refresh during demo. Post-stream, add localStorage or a proper session store.

5. **Admin page** is public (no auth). For any real deployment, gate this behind an auth check.
