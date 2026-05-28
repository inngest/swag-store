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

## AI/API/MCP access

Set `SWAG_STORE_API_TOKEN` and call automation endpoints with:

```bash
Authorization: Bearer $SWAG_STORE_API_TOKEN
```

Admins can also generate revocable API tokens from `/admin` under **API Tokens**. Dashboard-generated tokens are stored hashed, shown once, and work for both REST and MCP access.

- `GET /api/ai/products` lists product and variant IDs.
- `POST /api/ai/discount-codes` generates a single-use `sales_credit` ($100) or `devrel_comp` (100%) code.
- `POST /api/ai/orders` submits an order. Fully discounted orders are placed directly through Inngest; paid orders return a Stripe Checkout URL.
- `POST /api/mcp` exposes the same capabilities as MCP tools: `list_products`, `generate_discount_code`, and `submit_order`.

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

Agents should call `list_products` before ordering, use `generate_discount_code` for single-use $100 sales credits or 100% devrel comp codes, then call `submit_order` only after the user has provided or approved the exact items plus customer and shipping details.

## Project layout

| Path | Purpose |
|------|---------|
| `src/app/api/checkout/route.ts` | Creates Stripe Checkout Sessions |
| `src/app/api/webhooks/stripe/route.ts` | Validates Stripe signatures, fires `store/order.placed` |
| `src/app/api/inngest/route.ts` | Inngest serve handler |
| `src/inngest/client.ts` | Inngest client + encryption middleware |
| `src/inngest/channels.ts` | Realtime channels (`order:{id}`, `admin`) |
| `src/inngest/functions/fulfill-order.ts` | The durable workflow — 4 steps |
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

The site deploys to Vercel. Configure these env vars in the Vercel dashboard:

- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (from Inngest Cloud — leave `INNGEST_DEV` unset)
- `INNGEST_ENCRYPTION_KEY` (32-byte base64; same key across environments)
- `GOOGLE_SERVICE_ACCOUNT_JSON` (base64 of the SA key JSON)
- `ORDERS_SHEET_ID`, `ORDERS_SHEET_NAME`
- `NEXT_PUBLIC_APP_URL` (e.g. `https://swag.inngest.com`)

Stripe webhook destination (production): `https://swag.inngest.com/api/webhooks/stripe`. Get the production `whsec_` from Stripe Dashboard → Developers → Webhooks.

## License

MIT — see [LICENSE](./LICENSE). Forks, copies, and adaptations welcome. If you build something cool with this pattern, we'd love to hear about it.
