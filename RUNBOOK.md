# Swag Store Operator Runbook

For the person running the store day to day (Riley). No code knowledge required for sections 1–5.

**Last updated:** 2026-06-09 (post-QA handover prep)

---

## 1. The places

| What | Where | Notes |
|---|---|---|
| Store (production) | https://swag-store-production.up.railway.app | What customers see. (`swag.inngest.com` DNS is not set up yet — see DEV-401.) |
| Admin dashboard | https://swag-store-production.up.railway.app/admin | Sign in with your @inngest.com Google account (Clerk). Access is allowlisted: sterling, rileydurham, lauren, mel, tony, dan (all @inngest.com) |
| QA copy (for testing) | https://swag-store-qa.vercel.app | Same code, isolated database + Inngest sandbox. Break this one, not prod. |
| Order workflow engine | Inngest dashboard (production env) | Every order runs through the `fulfill-order` function; status changes run through `update-order-status` |
| Payments | Stripe dashboard (Inngest account) | **Currently TEST MODE** — see section 6 |
| Hosting | Railway project `prolific-courtesy`, service `swag-store` | App + Postgres. Logs live here |
| Bug tracker | Linear project **Swag** (DevRel team) | File issues there; QA findings from 2026-06-09 are DEV-388…DEV-400 |

## 2. When an order comes in (the core loop)

Every order lives in exactly one of three states: **pending → fulfilled → shipped**.

1. **It arrives.** Customer checks out → the `fulfill-order` workflow captures payment, reserves inventory, records the order as **pending**. It appears in `/admin` (live tracker + Pending queue). You don't have to do anything for this part.
2. **Pack it.** When you've physically packed the order, open `/admin`, find it in **Pending**, mark it **Fulfilled**.
3. **Ship it.** When it's handed to the carrier, mark it **Shipped** and paste the **tracking number**. The customer's order page shows status + tracking.
4. Use the **notes** field for anything future-you needs ("waiting on XL restock", "customer asked to combine orders").

Never skip states, and never edit order rows in the database directly.

## 3. Coupons (comp codes for meetups, etc.)

- Create codes in `/admin` → **Discounts**. 100%-off codes are the standard way swag goes out to meetup attendees and community folks.
- **Every code is single-use** (one code = one checkout). For a meetup, mint a batch — one code per expected redemption — and hand them out individually. There is no "shared room code" today (see DEV-397 if you want that changed).
- Codes have **no expiry**. If a 100% code leaks, deactivate it in the admin. (Also DEV-397.)
- Codes only appear in the Stripe dashboard after their first use, by design (lazy creation, DEV-396). The admin Discounts tab is the source of truth, not Stripe.
- Codes can also be minted programmatically via `/api/ai/discount-codes` with an API token (see section 5).

## 4. Inventory

- **Receiving a shipment:** `/admin` → Inventory → receive-shipment flow (+N per variant). This writes an audit record (who/when/before/after).
- **Counting / correcting:** use the audit-count flow to set absolute numbers. Also audited.
- **Low stock:** when a variant drops to the threshold (5), a Slack alert fires (`notify-low-inventory`).
- **Full reset** (`POST /api/inventory/reset`) reseeds everything from the code-side catalog. This is a developer escape hatch, not an operator tool. Don't.
- Orders reserve inventory automatically; you never decrement stock for an order by hand.

## 4b. Product images

- `/admin` → Products → edit a product → **UPLOAD** button under the image field. Pick a PNG/JPG/WebP (max 4MB), upload, then hit SAVE to persist. The old text field still works for pasting an https image URL.
- Agents can set images too: `/api/ai/products` and the MCP `upsert_product` tool accept `imageSourceUrl` (an https link the server fetches) or `imageBase64`.
- Uploaded images are stored in the database and served from `/api/product-images/…` — no separate hosting to manage.

## 4c. Importing new products

The canonical path for adding products to the store:

1. **Riley** fills out the **"Swag Store Upload"** tab in the swag tracking Google Sheet (one row per product: Name, SKU, SLUG, TYPE, PRICE, CATEGORY, COVER, IMAGE PLACEHOLDER, TAGLINE, CARD BLURB, FABRIC, FIT, CORNER TAG, TAGS, DESCRIPTION, COLORS, SIZES) and drops product images in the shared Drive folder. Image **filenames must match the COVER column** exactly (PNG/JPG/WebP, max 4MB).
2. **Sterling/MARVIN** exports the sheet tab to a TSV/CSV, downloads the images to a local directory, and runs the importer:
   ```
   node scripts/import-products-from-sheet.mjs \
     --base-url <store url> --token <API token> \
     --csv <sheet export> --images <image dir>
   ```
   The script upserts each row via `/api/ai/products` (idempotent — rerun after fixing the sheet and it updates in place), prints a per-product result table, and flags rows with missing images or missing sheet fields. Use `--dry-run` to preview payloads.
3. **Stock arrives separately.** Imported variants start at stock 0; when the physical shipment lands, use the receive-shipment flow in `/admin` → Inventory (audited). The script's `--stock-overrides` flag exists only for one-off stock migrations.

## 5. API tokens (for automations/agents)

`/admin` → **API Tokens** — generate revocable tokens for `/api/ai/products`, `/api/ai/discount-codes`, `/api/ai/orders`, and `/api/mcp`. The token is shown once at creation. Revoke from the same screen; revocation is immediate.

## 6. Things to know / current limitations

- **Stripe is in TEST mode in production** (DEV-400). Card checkouts don't move real money. Until that decision is made, treat the store as comp-code-driven. Test card for demos: `4242 4242 4242 4242`, any future expiry, any CVC.
- A failed order workflow (e.g. two people race for the last unit) lands in Pending flagged **NEEDS ATTENTION** with the failure reason in notes, and the payment is auto-refunded (post DEV-388 fix). If you see one: check inventory for the item, contact the customer, and either re-place or confirm the refund.
- The orders Google Sheet is a legacy fallback; Postgres (via `/admin`) is the source of truth.

## 7. When something looks broken

1. **Order stuck / didn't appear:** Inngest dashboard → `fulfill-order` runs → find the run by time. Failed steps show the error.
2. **Status change didn't stick:** Inngest dashboard → `update-order-status` runs.
3. **Site down / 500s:** Railway → `prolific-courtesy` → `swag-store` → deploy + runtime logs. `/api/health` should return `{"ok":true}`.
4. **Checkout errors with a discount code:** check the code's state in `/admin` → Discounts first (used? deactivated?).
5. Escalate: Sterling (sterling@inngest.com), or file in Linear project **Swag** with the order id, timestamp, and what you saw.

## 8. QA / regression (for whoever maintains the code)

- Test plan: `TEST-PLAN.md` (this repo). QA pass results 2026-06-09: 40/46 pass, findings in Linear DEV-388…DEV-400.
- Admin E2E suite: `scripts/admin-e2e.mjs` (Playwright; see README for invocation). Safe to run against a non-empty store (post DEV-394 fix).
- Isolated QA environment: Railway `prolific-courtesy` → `qa` environment has its own Postgres for test runs. Local setup: README "Local setup" + `.env.local.example`.
