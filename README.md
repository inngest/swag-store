# Inngest Swag Store

Official store for Inngest merchandise. Built durably — every order flows through an Inngest function you can watch run in real time.

Live at [swag.inngest.com](https://swag.inngest.com).

## What this is

A small Next.js e-commerce site that demonstrates Inngest in production. Stripe handles payments. Inngest handles the durable order workflow. Google Sheets is the fulfillment surface. Realtime publishes power a public live order tracker at `/admin`.

## Architecture

```
Stripe Checkout → POST /api/webhooks/stripe → inngest.send("store/order.placed")
                                                            ↓
                              fulfill-order Inngest function (4 durable steps):
                                ├─ step.run("capture-payment")
                                ├─ step.run("reserve-inventory")
                                ├─ step.run("send-confirmation")
                                └─ step.run("record-to-sheet")  ← appends to Google Sheet

Each step publishes to two Realtime channels:
  - order:{orderId}  → the customer's /orders/[orderId] page
  - admin            → the public /admin live tracker
```

PII (email, name, phone, shipping) flows through `event.data.encrypted` and is encrypted at rest in Inngest's storage via `@inngest/middleware-encryption`. Step outputs and realtime payloads are PII-free.

## Local setup

You need:

- Node 20+
- A Stripe test-mode account
- Stripe CLI installed (`brew install stripe/stripe-cli/stripe`)
- A Google Cloud project with Sheets API enabled, plus a service account
- A Google Sheet with the canonical column schema (run `node scripts/setup-orders-sheet.mjs <spreadsheet-id>` after sharing the sheet with the service account)

### 1. Install + env

```bash
npm install
cp .env.local.example .env.local
# fill in real values
```

### 2. Three terminals

```bash
# Terminal 1 — Next.js dev server
npm run dev

# Terminal 2 — Inngest dev server
npx inngest-cli@latest dev

# Terminal 3 — Stripe webhook forwarding
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# copy the printed whsec_... into STRIPE_WEBHOOK_SECRET in .env.local
```

Visit [http://localhost:3000](http://localhost:3000) to browse, [http://localhost:8288](http://localhost:8288) for the Inngest dashboard, [http://localhost:3000/admin](http://localhost:3000/admin) for the live order tracker.

### Admin E2E

`scripts/admin-e2e.mjs` runs the admin dashboard workflow suite with Playwright. It creates clearly-prefixed temporary rows for products, orders, discount codes, API tokens, and imports, then removes them at the end.

```bash
# Terminal 1 — Inngest dev server
npx inngest-cli@latest dev

# Terminal 2 — Next.js with local-only admin bypass
ADMIN_E2E_BYPASS=1 \
ADMIN_E2E_EMAIL=sterling@inngest.com \
INNGEST_DEV=1 \
npm run dev

# Terminal 3 — run the E2E pass
ADMIN_E2E_BYPASS=1 \
ADMIN_E2E_EMAIL=sterling@inngest.com \
ADMIN_E2E_BASE_URL=http://localhost:3000 \
node scripts/admin-e2e.mjs
```

The bypass is ignored when `NODE_ENV=production`.

### MCP E2E

`scripts/mcp-e2e.mjs` drives the JSON-RPC MCP server at `/api/mcp`. It verifies tool discovery, product preview, structured product create/update, source inventory listing, shipment receiving, inventory audit counts, inventory audit trail reads, discount generation, order preview, direct fully-discounted ordering through Inngest, event swag ordering, typed error recovery, duplicate discount rejection, and DB cleanup. Paid Stripe checkout is attempted when `STRIPE_SECRET_KEY` is available; otherwise that step is reported as skipped.

```bash
# Terminal 1 — isolated Inngest dev server for this app
npx inngest-cli@latest dev --port 8290 --sdk-url http://localhost:3000/api/inngest

# Terminal 2 — Next.js pointed at that Inngest dev server
INNGEST_DEV=http://localhost:8290 npm run dev

# Terminal 3 — run the MCP workflow pass
MCP_E2E_BASE_URL=http://localhost:3000 npm run e2e:mcp
```

## AI/API/MCP access

Set `SWAG_STORE_API_TOKEN` and call automation endpoints with:

```bash
Authorization: Bearer $SWAG_STORE_API_TOKEN
```

Admins can also generate revocable API tokens from `/admin` under **API Tokens**. Dashboard-generated tokens are stored hashed, shown once, and work for both REST and MCP access.

Agent auth discovery follows the WorkOS `auth.md` pattern:

- `GET /auth.md` returns human-readable auth instructions for agents.
- `GET /.well-known/oauth-protected-resource` returns Protected Resource Metadata.
- `GET /.well-known/oauth-authorization-server` returns authorization server metadata with an `agent_auth` block.
- Unauthorized `POST /api/mcp` responses include `WWW-Authenticate: Bearer resource_metadata="..."`.

This app currently uses admin-issued bearer credentials instead of public self-service token minting. Create or revoke agent tokens from `/admin` under **API Tokens**.

- `GET /api/ai/products` lists product and variant IDs and returns the agent API spec.
- `POST /api/ai/products` creates or updates a product, including image, price, name, copy, colors, sizes, and variants.
- `POST /api/ai/discount-codes` generates a single-use `sales_credit` ($100) or `devrel_comp` (100%) code.
- `POST /api/ai/orders` submits an order. Fully discounted orders are placed directly through Inngest; paid orders return a Stripe Checkout URL.
- `POST /api/mcp` exposes the same capabilities as MCP tools: `get_api_spec`, `list_products`, `list_inventory`, `preview_inventory_update`, `apply_inventory_update`, `preview_inventory_document`, `list_inventory_audits`, `preview_product`, `upsert_product`, `generate_discount_code`, `preview_order`, `preview_event_order`, `create_event_order`, and `submit_order`.

Example MCP client config:

```json
{
  "mcpServers": {
    "inngest-swag-store": {
      "type": "http",
      "url": "https://swag.inngest.com/api/mcp",
      "headers": {
        "Authorization": "Bearer ${SWAG_STORE_API_TOKEN}"
      }
    }
  }
}
```

Agents should call `get_api_spec` when they need the exact product creation/update schema, workflow recipes, idempotency notes, or typed error list. Product changes should go through `preview_product` before `upsert_product`, using structured `colors`, `sizes`, `variants`, and `tags` when possible. Inventory management should use `list_inventory` as the source-of-record stock view. New shipments should use `preview_inventory_document` for messy CSV/email/manifest text or `preview_inventory_update` for structured rows, then `apply_inventory_update` after approval. Physical audits should use the same preview/apply flow with `mode: "audit_count"`, and `list_inventory_audits` explains the adjustment ledger. Event swag orders should go through `list_inventory`, `preview_event_order`, and `create_event_order`; that final tool creates a 100% single-use comp code and submits the zero-dollar order through Inngest so inventory is reserved. General orders should go through `list_products`, `preview_order`, and then `submit_order` only after the user has provided or approved the exact cart, discount, customer, and shipping details. MCP errors include `error.data.type`, `retryable`, and `userAction` so clients can recover without guessing.

## Project layout

| Path | Purpose |
|------|---------|
| `src/app/api/checkout/route.ts` | Creates Stripe Checkout Sessions |
| `src/app/api/webhooks/stripe/route.ts` | Validates Stripe signatures, fires `store/order.placed` |
| `src/app/api/inngest/route.ts` | Inngest serve handler |
| `src/inngest/client.ts` | Inngest client + encryption middleware |
| `src/inngest/channels.ts` | Realtime channels (`order:{id}`, `admin`) |
| `src/inngest/functions/fulfill-order.ts` | The durable workflow — 4 steps |
| `src/inngest/functions/import-inventory-document.ts` | Durable CSV/text inventory import with LLM review |
| `src/inngest/functions/notify-low-inventory.ts` | Durable low-stock Slack alert workflow |
| `src/lib/sheets.ts` | Google Sheets read/write helpers |
| `src/lib/catalog.ts` | Static product catalog |
| `src/components/OrderStatusClient.tsx` | Customer-facing order page |
| `src/components/AdminClient.tsx` | Public live order tracker |

## Privacy model

- Order page (`/orders/[id]`) defaults to **masked** PII (email + total).
- Customer arriving from Stripe redirect → confirmation page calls `unlockOrderViewing` server action → cookie set → full data on subsequent visits to that order.
- Anyone else (admin INSPECT, shared link) → masked.

Cookie is httpOnly + 30-day, scoped per order ID. Stripe `session_id` verified server-side before issuing.

## Deploying

The site deploys to Railway. `railway.json` uses Railpack, `npm run build`, `npm run start`, and a `/api/health` healthcheck.

Recommended Railway setup:

1. Create or link a Railway project from this repo.
2. Add a PostgreSQL database in the same project.
3. Add `DATABASE_URL` to the app service as a reference to the Postgres service.
4. Configure these app variables:

- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (from Inngest Cloud — leave `INNGEST_DEV` unset)
- `INNGEST_ENCRYPTION_KEY` (32-byte base64; same key across environments)
- `GOOGLE_SERVICE_ACCOUNT_JSON` (base64 of the SA key JSON)
- `ORDERS_SHEET_ID`, `ORDERS_SHEET_NAME`
- `OPENAI_API_KEY`, `INVENTORY_IMPORT_MODEL` (for `/admin → Imports` LLM validation)
- `NEXT_PUBLIC_APP_URL` (e.g. `https://swag.inngest.com`)
- `SWAG_STORE_API_TOKEN`, `SWAG_STORE_API_ACTOR_EMAIL`
- `SWAG_STORE_RESET_SECRET`
- `LOW_STOCK_SLACK_WEBHOOK_URL` (test with a webhook routed to Sterling first; later replace with a channel webhook)
- `LOW_STOCK_SLACK_MENTION` (optional Slack user mention, e.g. `<@U12345678>`)
- `LOW_STOCK_THRESHOLD` (defaults to `5`, alerts at or below the threshold)

After the first deploy, seed Railway Postgres from the Notion-backed catalog:

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/inventory/reset" \
  -H "content-type: application/json" \
  -H "x-swag-store-reset-secret: $SWAG_STORE_RESET_SECRET" \
  -d '{"actorEmail":"ops@inngest.com"}'
```

Stripe webhook destination (production): `https://swag.inngest.com/api/webhooks/stripe`. Get the production `whsec_` from Stripe Dashboard → Developers → Webhooks.

## License

MIT — see [LICENSE](./LICENSE). Forks, copies, and adaptations welcome. If you build something cool with this pattern, we'd love to hear about it.
