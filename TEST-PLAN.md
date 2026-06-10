# Swag Store E2E Test Plan

**Goal:** Verify the store is ready to hand to Riley O'Toole for day-to-day operation: inventory intake, coupon issuance, checkout, and the full order lifecycle (pending → fulfilled → shipped).

**Date:** 2026-06-09
**Owner:** Sterling (via MARVIN QA passes)

---

## Environments

| Environment | App | Stripe | Database | Use |
|---|---|---|---|---|
| Local QA | `localhost:3000` (dev server, `ADMIN_E2E_BYPASS=1`) | Test mode (same keys as prod) | Railway `prolific-courtesy` / `qa` env Postgres (isolated) | All automated passes |
| Production | swag.inngest.com | **Test mode** (`sk_test_…`) | Railway `production` Postgres | Manual smoke only. Do not run automated tests against prod DB. |

> **Standing finding:** production runs on Stripe **test-mode** keys and test-mode Clerk. If the store is ever meant to take real money, keys must be swapped and the webhook endpoint re-created in live mode. If comp-code-only is the intended model, document that in the runbook.

## Personas

1. **Dev advocate (Sterling):** creates discount codes (including 100%-off) for meetups, checks out with their own code, expects $0 charge and a normal order record.
2. **Customer:** browses, carts, pays with card, watches their order page update live.
3. **Operator (Riley):** watches `/admin`, takes orders from `pending` → `fulfilled` → `shipped` (+ tracking number), receives inventory shipments, runs audits, issues coupons.

---

## Suite 1 — Storefront & Catalog
- [ ] 1.1 Home page renders product grid from Postgres catalog (not Sheets fallback)
- [ ] 1.2 Product detail pages show variants (size/color) with correct stock-driven availability
- [ ] 1.3 Out-of-stock variants are not purchasable
- [ ] 1.4 Cart: add, update quantity, remove, persists across reload
- [ ] 1.5 `/api/health` returns ok

## Suite 2 — Paid Checkout (test card)
- [ ] 2.1 Checkout session created with correct line items + amounts
- [ ] 2.2 Pay with `4242 4242 4242 4242` → redirect to order page
- [ ] 2.3 Stripe webhook received → `store/order.placed` event sent
- [ ] 2.4 `fulfill-order` runs all steps green (capture-payment, reserve-inventory, send-confirmation, record-order)
- [ ] 2.5 Order row in Postgres `orders` with `status='pending'`, correct totals, line items, shipping, PII present
- [ ] 2.6 Customer order page (`/orders/[id]`) shows live step progress (realtime)
- [ ] 2.7 `/admin` live tracker shows the order appear in real time

## Suite 3 — Discount Codes (the dev-advocate flow)
- [ ] 3.1 Admin can create a **100% off** code via `/admin` UI (e.g. `MEETUP-SF-TEST`)
- [ ] 3.2 Code is created in Stripe (coupon + promotion code) AND in `discount_codes` table
- [ ] 3.3 Checkout with 100% code → **$0 total** completes successfully (Stripe allows $0 session OR app handles free-order path)
- [ ] 3.4 $0 order still flows: webhook → fulfill-order → `pending` row, inventory reserved
- [ ] 3.5 `discount_redemptions` row recorded with order id + amount
- [ ] 3.6 Partial discount (e.g. 20%) computes correct totals
- [ ] 3.7 Max-redemption limit enforced (code with limit 1 fails on second use)
- [ ] 3.8 Expired code rejected at checkout
- [ ] 3.9 Invalid/garbage code rejected gracefully
- [ ] 3.10 Codes creatable via API (`/api/ai/discount-codes`) with bearer token

## Suite 4 — Fulfillment Lifecycle (Riley's process)
- [ ] 4.1 New order visible in `/admin` orders list with status `pending`
- [ ] 4.2 Mark `fulfilled` → `admin/order.status_update.requested` event → `update-order-status` function runs → DB updated
- [ ] 4.3 Mark `shipped` with tracking number → tracking stored, status `shipped`
- [ ] 4.4 Status changes reflected on the customer's order page
- [ ] 4.5 Notes field persists
- [ ] 4.6 Invalid transition input (garbage status) rejected
- [ ] 4.7 Order list filters/sorts work (whatever the UI exposes)

## Suite 5 — Inventory
- [ ] 5.1 Order reserves inventory: variant stock decrements by quantity
- [ ] 5.2 Oversell guard: order quantity > stock fails cleanly (no negative stock)
- [ ] 5.3 Low-stock threshold crossing fires `notify-low-inventory` (Slack webhook may be unset locally — function should still succeed/skip gracefully)
- [ ] 5.4 Receive shipment adjustment (+N) via admin updates stock and writes `inventory_adjustments` audit row
- [ ] 5.5 Audit count (set absolute) works and records actor
- [ ] 5.6 `POST /api/inventory/reset` reseeds from catalog (secret-protected, 401 without secret)
- [ ] 5.7 Inventory document import (`/admin` → Imports) round-trips a sample doc

## Suite 6 — AuthZ & API surface
- [ ] 6.1 `/admin` requires Clerk auth + allowlist email in prod mode (bypass only works in dev)
- [ ] 6.2 `/api/ai/*` endpoints 401 without bearer token, work with `SWAG_STORE_API_TOKEN`
- [ ] 6.3 DB-backed API tokens (created in /admin → API Tokens) authenticate and revoke
- [ ] 6.4 `/api/mcp` responds to MCP handshake with valid token
- [ ] 6.5 Stripe webhook rejects bad signature

## Suite 7 — Repeatability & Durability
- [ ] 7.1 Run the full cycle (paid order → fulfill → ship) **3× consecutively**, no flakes
- [ ] 7.2 Run the 100%-coupon cycle **3× consecutively**
- [ ] 7.3 Duplicate webhook delivery does not double-reserve inventory or double-record order (event id dedupe)
- [ ] 7.4 Two concurrent orders for the same variant don't oversell
- [ ] 7.5 `scripts/admin-e2e.mjs` passes clean

---

## Severity rubric
- **P0** — blocks checkout, loses orders, corrupts inventory, auth bypass in prod
- **P1** — core operator flow broken (status updates, coupon creation), wrong money math
- **P2** — degraded UX, missing validation, flaky realtime
- **P3** — polish, copy, nice-to-have

## Exit criteria
All P0/P1 fixed and re-verified by a fresh QA pass; Suites 2, 3, 4 green 3× in a row; runbook (RUNBOOK.md) written for Riley.
