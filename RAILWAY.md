# Railway Deployment

The production swag store uses the same Railway pattern as `swag-store-demo`:

- Railpack build from `railway.json`
- standalone Next.js output
- Railway Postgres via `DATABASE_URL`
- `/api/health` as the deployment healthcheck

## Required Setup

1. Create or link a Railway project from this repo.
2. Add a PostgreSQL database to the project.
3. Add `DATABASE_URL` to the app service as a reference variable from Postgres.
4. Add the app variables from `.env.local.example`.
5. Deploy the app service.
6. Seed inventory with `POST /api/inventory/reset`.

## Inventory Seed

Current orderable inventory is seeded from `src/lib/catalog.ts`, which mirrors the Notion Swag Inventory page as of 2026-05-28:

- Anti Anti Infra Co. T-shirts: S 20, M 24, L 21, XL 23, XXL 11, XXXL 7
- Step.run socks: 58

The Notion event inventory marked "do not touch" is intentionally excluded.

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/inventory/reset" \
  -H "content-type: application/json" \
  -H "x-swag-store-reset-secret: $SWAG_STORE_RESET_SECRET" \
  -d '{"actorEmail":"ops@inngest.com"}'
```

## Required Variables

```txt
DATABASE_URL=
NEXT_PUBLIC_APP_URL=
SWAG_STORE_RESET_SECRET=
SWAG_STORE_API_TOKEN=
SWAG_STORE_API_ACTOR_EMAIL=

STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
INNGEST_ENCRYPTION_KEY=

OPENAI_API_KEY=
INVENTORY_IMPORT_MODEL=gpt-4.1-mini

GOOGLE_SERVICE_ACCOUNT_JSON=
ORDERS_SHEET_ID=
ORDERS_SHEET_NAME=
```

`OPENAI_API_KEY` powers the Inngest document import validator in `/admin → Imports`.
Without it, imports still run deterministic CSV checks and record a warning that
LLM review was skipped.

For local dev, keep `INNGEST_DEV=1`. Do not set `INNGEST_DEV` in Railway.
