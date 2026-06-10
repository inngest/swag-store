import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { PRODUCTS, PRODUCT_SIZE_ORDER, type Product, type ProductColor, type ProductSize } from './catalog';
import { CheckoutInputError } from './checkout-errors';
import { getPool, hasDatabaseUrl } from './db';
import type { OrderDetail, OrderRow } from './sheets';
import {
  appendOrder as appendSheetOrder,
  fetchOrder as fetchSheetOrder,
  fetchPublicOrders as fetchSheetPublicOrders,
} from './sheets';

export const ORDER_STATUSES = ['pending', 'fulfilled', 'shipped'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type DiscountCodeType = 'amount_off' | 'percent_off';

export function isOrderStatus(value: unknown): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}

export type StoreLineItem = {
  description: string | null;
  quantity: number | null;
  amountTotal: number | null;
  productId?: string;
  productName?: string;
  sku?: string;
  variantId?: string;
  size?: string;
  color?: string;
};

export type InventoryReservation = {
  sku: string;
  name: string;
  variantId: string;
  size: string;
  color: string;
  quantity: number;
  stockAfter: number | null;
  reservedAt: string;
};

export type AdminInventoryRow = {
  productId: string;
  productName: string;
  slug: string;
  type: string;
  sku: string;
  image: string;
  variantId: string;
  size: string;
  color: string;
  stock: number;
  initialStock: number;
  updatedAt: string;
};

export type InventoryAdjustmentMode = 'receive_shipment' | 'audit_count' | 'manual_correction';

export type InventoryAdjustmentInput = {
  variantId?: string;
  productId?: string;
  sku?: string;
  size?: string;
  color?: string;
  quantity?: number;
  stock?: number;
  note?: string;
};

export type InventoryAdjustmentPreview = {
  ok: boolean;
  mode: InventoryAdjustmentMode;
  source: string;
  reason: string;
  items: Array<{
    variantId: string;
    productId: string;
    productName: string;
    sku: string;
    size: string;
    color: string;
    previousStock: number;
    quantityChange: number;
    newStock: number;
    note: string;
  }>;
  issues: Array<{
    severity: 'warning' | 'error';
    message: string;
    item?: number;
  }>;
};

export type InventoryAdjustmentRecord = InventoryAdjustmentPreview['items'][number] & {
  id: number;
  batchId: string;
  mode: InventoryAdjustmentMode;
  source: string;
  reason: string;
  actorEmail: string;
  createdAt: string;
};

export type LowStockInventoryRow = AdminInventoryRow & {
  threshold: number;
};

export type AdminOrder = {
  orderId: string;
  createdAt: string;
  email: string;
  name: string;
  items: string;
  totalCents: number;
  currency: string;
  discountCode: string;
  discountAmountCents: number;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  phone: string;
  status: OrderStatus;
  tracking: string;
  notes: string;
};

export type AdminDiscountCode = {
  code: string;
  label: string;
  type: DiscountCodeType;
  amountOffCents: number | null;
  percentOff: number | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  active: boolean;
  stripeCouponId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AppliedDiscount = {
  code: string;
  label: string;
  type: DiscountCodeType;
  discountCents: number;
  amountOffCents: number | null;
  percentOff: number | null;
};

export type InventoryImportRun = {
  id: number;
  source: string;
  status: 'running' | 'complete' | 'failed';
  startedAt: string;
  completedAt: string | null;
  actorEmail: string;
  summary: Record<string, unknown>;
  error: string;
};

export type AdminApiToken = {
  id: number;
  name: string;
  tokenPrefix: string;
  actorEmail: string;
  active: boolean;
  lastUsedAt: string | null;
  createdBy: string;
  createdAt: string;
  revokedAt: string | null;
};

export type GeneratedApiToken = {
  token: string;
  apiToken: AdminApiToken;
};

export type ApiTokenActor = {
  email: string;
};

function sizeOrderSql(column: string): string {
  return `case upper(${column})
    when 'XS' then 1
    when 'S' then 2
    when 'M' then 3
    when 'L' then 4
    when 'XL' then 5
    when 'XXL' then 6
    when 'XXXL' then 7
    else 99
  end`;
}

let readyPromise: Promise<void> | null = null;

export function isStoreDatabaseEnabled(): boolean {
  return hasDatabaseUrl();
}

export async function ensureStoreReady(): Promise<void> {
  if (!isStoreDatabaseEnabled()) return;
  readyPromise ??= (async () => {
    await ensureStoreSchema();
    await seedStaticCatalog();
  })();
  await readyPromise;
}

async function ensureStoreSchema(): Promise<void> {
  await getPool().query(`
    create table if not exists products (
      id text primary key,
      slug text not null unique,
      name text not null,
      type text not null,
      sku text not null,
      tagline text not null default '',
      blurb text not null default '',
      description text not null default '',
      fabric text not null default '',
      fit text not null default '',
      corner_tag text not null default '',
      cover text not null default 'light',
      price_cents integer not null default 0,
      category text not null default 'apparel',
      image text not null default '',
      image_placeholder text not null default '',
      colors jsonb not null default '[]'::jsonb,
      sizes jsonb not null default '[]'::jsonb,
      featured boolean not null default false,
      tags jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default now()
    );

    create table if not exists product_variants (
      id text primary key,
      product_id text not null references products(id) on delete cascade,
      size text not null default '',
      color text not null default '',
      initial_stock integer not null default 0,
      stock integer not null default 0,
      updated_at timestamptz not null default now()
    );

    create table if not exists orders (
      order_id text primary key,
      created_at timestamptz not null,
      customer_email text not null default '',
      customer_name text not null default '',
      customer_phone text not null default '',
      items text not null default '',
      total_cents integer not null default 0,
      currency text not null default 'USD',
      ship_address text not null default '',
      ship_city text not null default '',
      ship_state text not null default '',
      ship_zip text not null default '',
      ship_country text not null default '',
      status text not null default 'pending',
      tracking text not null default '',
      notes text not null default '',
      stripe_session_id text,
      discount_code text not null default '',
      discount_amount_cents integer not null default 0,
      updated_at timestamptz not null default now()
    );

    alter table orders add column if not exists discount_code text not null default '';
    alter table orders add column if not exists discount_amount_cents integer not null default 0;

    update orders set status = 'pending' where status not in ('pending', 'fulfilled', 'shipped');
    alter table orders drop constraint if exists orders_status_check;
    alter table orders add constraint orders_status_check check (status in ('pending', 'fulfilled', 'shipped'));

    create table if not exists order_items (
      id bigserial primary key,
      order_id text not null references orders(order_id) on delete cascade,
      product_id text,
      variant_id text,
      sku text not null default '',
      name text not null,
      size text not null default '',
      color text not null default '',
      quantity integer not null,
      amount_total integer
    );

    create table if not exists inventory_import_runs (
      id bigserial primary key,
      source text not null,
      status text not null default 'running',
      started_at timestamptz not null default now(),
      completed_at timestamptz,
      actor_email text not null default '',
      summary jsonb not null default '{}'::jsonb,
      error text not null default ''
    );

    create table if not exists inventory_adjustments (
      id bigserial primary key,
      batch_id text not null,
      created_at timestamptz not null default now(),
      actor_email text not null default '',
      source text not null default '',
      reason text not null default '',
      mode text not null,
      product_id text not null default '',
      product_name text not null default '',
      sku text not null default '',
      variant_id text not null default '',
      size text not null default '',
      color text not null default '',
      previous_stock integer not null,
      quantity_change integer not null,
      new_stock integer not null,
      note text not null default '',
      constraint inventory_adjustments_mode_check check (mode in ('receive_shipment', 'audit_count', 'manual_correction'))
    );

    create index if not exists inventory_adjustments_batch_idx on inventory_adjustments (batch_id);
    create index if not exists inventory_adjustments_variant_idx on inventory_adjustments (variant_id, created_at desc);

    create table if not exists low_stock_notifications (
      variant_id text primary key,
      threshold integer not null,
      last_stock integer not null,
      last_notified_at timestamptz not null default now(),
      resolved_at timestamptz
    );

    create table if not exists discount_codes (
      code text primary key,
      label text not null default '',
      type text not null,
      amount_off_cents integer,
      percent_off numeric(5, 2),
      max_redemptions integer not null default 1,
      times_redeemed integer not null default 0,
      active boolean not null default true,
      stripe_coupon_id text not null default '',
      created_by text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint discount_codes_type_check check (type in ('amount_off', 'percent_off')),
      constraint discount_codes_amount_check check (
        (type = 'amount_off' and amount_off_cents is not null and amount_off_cents > 0 and percent_off is null)
        or
        (type = 'percent_off' and percent_off is not null and percent_off > 0 and percent_off <= 100 and amount_off_cents is null)
      ),
      constraint discount_codes_max_redemptions_check check (max_redemptions = 1),
      constraint discount_codes_times_redeemed_check check (times_redeemed >= 0)
    );

    alter table discount_codes add column if not exists created_by text not null default '';

    update discount_codes set max_redemptions = 1 where max_redemptions is null or max_redemptions <> 1;
    alter table discount_codes alter column max_redemptions set default 1;
    alter table discount_codes alter column max_redemptions set not null;
    alter table discount_codes drop constraint if exists discount_codes_max_redemptions_check;
    alter table discount_codes add constraint discount_codes_max_redemptions_check check (max_redemptions = 1);

    create table if not exists discount_redemptions (
      stripe_session_id text primary key,
      code text not null unique references discount_codes(code),
      order_id text not null,
      amount_cents integer not null default 0,
      created_at timestamptz not null default now()
    );

    create unique index if not exists discount_redemptions_code_unique on discount_redemptions (code);

    create table if not exists product_images (
      id text primary key,
      product_id text not null default '',
      content_type text not null,
      bytes bytea not null,
      size_bytes integer not null,
      actor_email text not null default '',
      created_at timestamptz not null default now()
    );

    create index if not exists product_images_product_idx on product_images (product_id);

    create table if not exists api_tokens (
      id bigserial primary key,
      name text not null,
      token_hash text not null unique,
      token_prefix text not null,
      actor_email text not null,
      active boolean not null default true,
      last_used_at timestamptz,
      created_by text not null default '',
      created_at timestamptz not null default now(),
      revoked_at timestamptz
    );

    create index if not exists api_tokens_active_idx on api_tokens (active);
  `);
}

async function seedStaticCatalog(): Promise<void> {
  for (const product of PRODUCTS) {
    await upsertProduct(product, { preserveVariantStock: true });
  }
}

export async function listPublicProducts(): Promise<Product[]> {
  if (!isStoreDatabaseEnabled()) return PRODUCTS;
  await ensureStoreReady();

  const [productsRes, variantsRes] = await Promise.all([
    getPool().query('select * from products order by id'),
    getPool().query(
      `select *
       from product_variants
       order by product_id, ${sizeOrderSql('size')}, color, id`,
    ),
  ]);

  const variantsByProduct = new Map<string, Product['variants']>();
  for (const row of variantsRes.rows) {
    const productId = String(row.product_id);
    const variants = variantsByProduct.get(productId) ?? [];
    variants.push({
      id: String(row.id),
      size: stringOrUndefined(row.size) as ProductSize | undefined,
      color: stringOrUndefined(row.color),
      stock: Number(row.stock ?? 0),
    });
    variantsByProduct.set(productId, variants);
  }

  return productsRes.rows.map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    type: String(row.type),
    sku: String(row.sku),
    tagline: String(row.tagline ?? ''),
    blurb: String(row.blurb ?? ''),
    description: String(row.description ?? ''),
    fabric: String(row.fabric ?? ''),
    fit: String(row.fit ?? ''),
    cornerTag: String(row.corner_tag ?? ''),
    cover: row.cover === 'dark' || row.cover === 'citrus' ? row.cover : 'light',
    price: Number(row.price_cents ?? 0),
    category: row.category === 'accessories' ? 'accessories' : 'apparel',
    image: String(row.image ?? ''),
    imagePlaceholder: String(row.image_placeholder ?? ''),
    colors: parseJsonArray<ProductColor>(row.colors),
    sizes: sortProductSizes(parseJsonArray<ProductSize>(row.sizes)),
    variants: variantsByProduct.get(String(row.id)) ?? [],
    featured: Boolean(row.featured),
    tags: parseJsonArray<string>(row.tags) ?? [],
  }));
}

export async function getPublicProduct(slug: string): Promise<Product | undefined> {
  const products = await listPublicProducts();
  return products.find((product) => product.slug === slug);
}

export async function listAdminProducts(): Promise<Product[]> {
  const products = await listPublicProducts();
  return products.sort((a, b) => a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku));
}

export async function listAdminInventory(): Promise<AdminInventoryRow[]> {
  if (!isStoreDatabaseEnabled()) {
    return PRODUCTS.flatMap((product) =>
      product.variants.map((variant) => ({
        productId: product.id,
        productName: product.name,
        slug: product.slug,
        type: product.type,
        sku: product.sku,
        image: product.image,
        variantId: variant.id,
        size: variant.size ?? '',
        color: variant.color ?? '',
        stock: variant.stock,
        initialStock: variant.stock,
        updatedAt: new Date(0).toISOString(),
      })),
    ).sort(compareInventoryRows);
  }

  await ensureStoreReady();
  const res = await getPool().query(
    `select p.id as product_id, p.name as product_name, p.slug, p.type, p.sku,
            p.image, v.id as variant_id, v.size, v.color, v.stock,
            v.initial_stock, v.updated_at
     from product_variants v
     join products p on p.id = v.product_id
     order by p.name, ${sizeOrderSql('v.size')}, v.color, v.id`,
  );

  return res.rows.map((row) => ({
    productId: String(row.product_id),
    productName: String(row.product_name),
    slug: String(row.slug),
    type: String(row.type),
    sku: String(row.sku),
    image: String(row.image ?? ''),
    variantId: String(row.variant_id),
    size: String(row.size ?? ''),
    color: String(row.color ?? ''),
    stock: Number(row.stock ?? 0),
    initialStock: Number(row.initial_stock ?? 0),
    updatedAt: new Date(row.updated_at).toISOString(),
  })).sort(compareInventoryRows);
}

export async function listLowStockInventory(threshold: number): Promise<LowStockInventoryRow[]> {
  const normalizedThreshold = normalizeLowStockThreshold(threshold);
  const inventory = await listAdminInventory();
  return inventory
    .filter((row) => row.stock <= normalizedThreshold)
    .map((row) => ({ ...row, threshold: normalizedThreshold }));
}

export async function recordLowStockNotificationCandidates({
  threshold,
  rows,
}: {
  threshold: number;
  rows: LowStockInventoryRow[];
}): Promise<LowStockInventoryRow[]> {
  if (!isStoreDatabaseEnabled()) return rows;
  await ensureStoreReady();

  const normalizedThreshold = normalizeLowStockThreshold(threshold);
  const currentLowVariantIds = rows.map((row) => row.variantId);
  const client = await getPool().connect();
  const notifyRows: LowStockInventoryRow[] = [];

  try {
    await client.query('begin');
    if (currentLowVariantIds.length > 0) {
      await client.query(
        `update low_stock_notifications
         set resolved_at = now()
         where resolved_at is null
           and not (variant_id = any($1::text[]))`,
        [currentLowVariantIds],
      );
    } else {
      await client.query(
        `update low_stock_notifications
         set resolved_at = now()
         where resolved_at is null`,
      );
    }

    for (const row of rows) {
      const existing = await client.query(
        `select threshold, last_stock, resolved_at
         from low_stock_notifications
         where variant_id = $1
         for update`,
        [row.variantId],
      );
      const current = existing.rows[0];
      const shouldNotify =
        !current ||
        current.resolved_at ||
        Number(current.threshold) !== normalizedThreshold ||
        row.stock < Number(current.last_stock);

      await client.query(
        `insert into low_stock_notifications (variant_id, threshold, last_stock, last_notified_at, resolved_at)
         values ($1, $2, $3, now(), null)
         on conflict (variant_id) do update set
           threshold = excluded.threshold,
           last_stock = excluded.last_stock,
           last_notified_at = case
             when $4::boolean then now()
             else low_stock_notifications.last_notified_at
           end,
           resolved_at = null`,
        [row.variantId, normalizedThreshold, row.stock, shouldNotify],
      );

      if (shouldNotify) notifyRows.push(row);
    }

    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  return notifyRows;
}

export async function updateInventoryVariant({
  variantId,
  stock,
  image,
}: {
  variantId: string;
  stock: number;
  image?: string;
}): Promise<void> {
  requireStoreDatabase();
  await ensureStoreReady();
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const variant = await client.query(
      `update product_variants
       set stock = $1, updated_at = now()
       where id = $2
       returning product_id`,
      [Math.max(0, Math.floor(stock)), variantId],
    );
    const productId = variant.rows[0]?.product_id;
    if (!productId) throw new Error(`Variant not found: ${variantId}`);

    if (image !== undefined) {
      await client.query(
        `update products set image = $1, updated_at = now() where id = $2`,
        [image.trim(), productId],
      );
    }

    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function previewInventoryAdjustment({
  mode,
  source = '',
  reason = '',
  items,
}: {
  mode: InventoryAdjustmentMode;
  source?: string;
  reason?: string;
  items: InventoryAdjustmentInput[];
}): Promise<InventoryAdjustmentPreview> {
  validateInventoryAdjustmentMode(mode);
  const currentInventory = await listAdminInventory();
  const issues: InventoryAdjustmentPreview['issues'] = [];
  const previewItems: InventoryAdjustmentPreview['items'] = [];

  if (!Array.isArray(items) || items.length === 0) {
    issues.push({ severity: 'error', message: 'At least one inventory adjustment item is required.' });
  }

  items.forEach((item, index) => {
    const row = findInventoryAdjustmentRow(currentInventory, item);
    if (!row) {
      issues.push({
        severity: 'error',
        item: index + 1,
        message: `Item ${index + 1} did not match a current inventory variant.`,
      });
      return;
    }

    const quantityChange = inventoryQuantityChange(mode, item, row.stock);
    if (quantityChange === null) {
      issues.push({
        severity: 'error',
        item: index + 1,
        message: inventoryQuantityError(mode, index + 1),
      });
      return;
    }

    const newStock = row.stock + quantityChange;
    if (newStock < 0) {
      issues.push({
        severity: 'error',
        item: index + 1,
        message: `Item ${index + 1} would set stock below zero for ${row.productName} ${row.size} ${row.color}.`,
      });
      return;
    }

    previewItems.push({
      variantId: row.variantId,
      productId: row.productId,
      productName: row.productName,
      sku: row.sku,
      size: row.size,
      color: row.color,
      previousStock: row.stock,
      quantityChange,
      newStock,
      note: String(item.note ?? '').trim(),
    });
  });

  if (new Set(previewItems.map((item) => item.variantId)).size !== previewItems.length) {
    issues.push({
      severity: 'error',
      message: 'Each inventory adjustment may include a variant only once. Combine duplicate rows first.',
    });
  }

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    mode,
    source: source.trim(),
    reason: reason.trim(),
    items: previewItems,
    issues,
  };
}

export async function applyInventoryAdjustment({
  actorEmail,
  mode,
  source = '',
  reason = '',
  items,
}: {
  actorEmail: string;
  mode: InventoryAdjustmentMode;
  source?: string;
  reason?: string;
  items: InventoryAdjustmentInput[];
}): Promise<{
  batchId: string;
  adjustments: InventoryAdjustmentRecord[];
}> {
  requireStoreDatabase();
  await ensureStoreReady();
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error('reason is required for inventory adjustments.');

  const preview = await previewInventoryAdjustment({ mode, source, reason, items });
  if (!preview.ok) {
    throw new Error(preview.issues.map((issue) => issue.message).join(' '));
  }

  const batchId = `inv_${Date.now().toString(36)}_${randomCodeSuffix().toLowerCase()}`;
  const client = await getPool().connect();
  const records: InventoryAdjustmentRecord[] = [];

  try {
    await client.query('begin');
    for (const item of preview.items) {
      const locked = await client.query(
        `select stock
         from product_variants
         where id = $1
         for update`,
        [item.variantId],
      );
      const currentStock = Number(locked.rows[0]?.stock ?? NaN);
      if (!Number.isSafeInteger(currentStock)) {
        throw new Error(`Variant not found while applying adjustment: ${item.variantId}`);
      }

      const newStock = currentStock + item.quantityChange;
      if (newStock < 0) {
        throw new Error(`Adjustment would set stock below zero for ${item.productName}.`);
      }

      await client.query(
        `update product_variants
         set stock = $1, updated_at = now()
         where id = $2`,
        [newStock, item.variantId],
      );

      const inserted = await client.query(
        `insert into inventory_adjustments (
           batch_id, actor_email, source, reason, mode, product_id, product_name,
           sku, variant_id, size, color, previous_stock, quantity_change, new_stock, note
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         returning *`,
        [
          batchId,
          actorEmail,
          source.trim(),
          trimmedReason,
          mode,
          item.productId,
          item.productName,
          item.sku,
          item.variantId,
          item.size,
          item.color,
          currentStock,
          item.quantityChange,
          newStock,
          item.note,
        ],
      );
      records.push(rowToInventoryAdjustmentRecord(inserted.rows[0]));
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  return { batchId, adjustments: records };
}

export async function listInventoryAdjustments({
  limit = 50,
}: {
  limit?: number;
} = {}): Promise<InventoryAdjustmentRecord[]> {
  if (!isStoreDatabaseEnabled()) return [];
  await ensureStoreReady();
  const res = await getPool().query(
    `select *
     from inventory_adjustments
     order by created_at desc, id desc
     limit $1`,
    [Math.max(1, Math.min(200, Math.floor(limit)))],
  );
  return res.rows.map(rowToInventoryAdjustmentRecord);
}

export async function validateCartAvailability(
  items: Array<{ productId: string; variantId: string; quantity: number }>,
): Promise<void> {
  if (!isStoreDatabaseEnabled()) return;
  await ensureStoreReady();
  for (const item of items) {
    const res = await getPool().query(
      `select p.name, v.stock
       from product_variants v
       join products p on p.id = v.product_id
       where v.id = $1 and p.id = $2
       limit 1`,
      [item.variantId, item.productId],
    );
    const row = res.rows[0];
    if (!row) throw new CheckoutInputError(`Product variant not found: ${item.variantId}`);
    const stock = Number(row.stock ?? 0);
    if (stock < item.quantity) {
      throw new CheckoutInputError(`${row.name} has only ${stock} left in stock.`);
    }
  }
}

export async function reserveInventory({
  lineItems,
}: {
  orderId: string;
  lineItems: StoreLineItem[];
}): Promise<{ reservations: InventoryReservation[]; count: number }> {
  if (!isStoreDatabaseEnabled()) {
    const reservations = (lineItems ?? []).map((item) => ({
      sku: item.sku ?? item.productId ?? 'unknown',
      name: item.productName ?? item.description ?? 'unknown',
      variantId: item.variantId ?? '',
      size: item.size ?? '',
      color: item.color ?? '',
      quantity: item.quantity ?? 1,
      stockAfter: null,
      reservedAt: new Date().toISOString(),
    }));
    return { reservations, count: reservations.length };
  }

  await ensureStoreReady();
  const client = await getPool().connect();
  const reservedAt = new Date().toISOString();
  const reservations: InventoryReservation[] = [];
  try {
    await client.query('begin');
    for (const item of lineItems ?? []) {
      const quantity = item.quantity ?? 1;
      const variant = await findVariantForUpdate(client, item);
      if (!variant) {
        throw new Error(`No inventory variant found for ${item.productName ?? item.description ?? 'item'}`);
      }
      if (variant.stock < quantity) {
        throw new Error(
          `Insufficient inventory for ${variant.sku}; requested ${quantity}, available ${variant.stock}`,
        );
      }

      const updated = await client.query(
        `update product_variants
         set stock = stock - $1, updated_at = now()
         where id = $2
         returning stock`,
        [quantity, variant.id],
      );

      reservations.push({
        sku: variant.sku,
        name: item.productName ?? item.description ?? variant.name,
        variantId: variant.id,
        size: item.size ?? variant.size ?? '',
        color: item.color ?? variant.color ?? '',
        quantity,
        stockAfter: Number(updated.rows[0]?.stock ?? 0),
        reservedAt,
      });
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  return { reservations, count: reservations.length };
}

export async function recordPendingOrder({
  row,
  lineItems,
  stripeSessionId,
}: {
  row: OrderRow;
  lineItems: StoreLineItem[];
  stripeSessionId?: string;
}): Promise<{ recordedAt: string }> {
  if (!isStoreDatabaseEnabled()) {
    await appendSheetOrder(row);
    return { recordedAt: new Date().toISOString() };
  }

  await ensureStoreReady();
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into orders (
        order_id, created_at, customer_email, customer_name, customer_phone,
        items, total_cents, currency, ship_address, ship_city, ship_state,
        ship_zip, ship_country, status, tracking, notes, stripe_session_id,
        discount_code, discount_amount_cents, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14, $15, $16, $17, $18, now())
      on conflict (order_id) do update set
        customer_email = excluded.customer_email,
        customer_name = excluded.customer_name,
        customer_phone = excluded.customer_phone,
        items = excluded.items,
        total_cents = excluded.total_cents,
        currency = excluded.currency,
        ship_address = excluded.ship_address,
        ship_city = excluded.ship_city,
        ship_state = excluded.ship_state,
        ship_zip = excluded.ship_zip,
        ship_country = excluded.ship_country,
        stripe_session_id = excluded.stripe_session_id,
        discount_code = excluded.discount_code,
        discount_amount_cents = excluded.discount_amount_cents,
        updated_at = now()`,
      [
        row.orderId,
        row.createdAt,
        row.email,
        row.name,
        row.phone,
        row.items,
        row.totalCents,
        row.currency,
        row.shipAddress,
        row.shipCity,
        row.shipState,
        row.shipZip,
        row.shipCountry,
        row.tracking,
        row.notes,
        stripeSessionId ?? null,
        row.discountCode ?? '',
        row.discountAmountCents ?? 0,
      ],
    );

    await client.query('delete from order_items where order_id = $1', [row.orderId]);
    for (const item of lineItems ?? []) {
      await client.query(
        `insert into order_items (
          order_id, product_id, variant_id, sku, name, size, color, quantity, amount_total
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.orderId,
          item.productId ?? null,
          item.variantId ?? null,
          item.sku ?? '',
          item.productName ?? item.description ?? 'item',
          item.size ?? '',
          item.color ?? '',
          item.quantity ?? 1,
          item.amountTotal ?? null,
        ],
      );
    }

    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  return { recordedAt: new Date().toISOString() };
}

export async function updateOrderStatus({
  orderId,
  status,
  tracking,
  notes,
}: {
  orderId: string;
  status: OrderStatus;
  tracking?: string;
  notes?: string;
}): Promise<void> {
  if (!isOrderStatus(status)) {
    throw new Error(`Invalid order status: ${String(status)}`);
  }
  requireStoreDatabase();
  await ensureStoreReady();
  const res = await getPool().query(
    `update orders
     set status = $1,
         tracking = coalesce($2, tracking),
         notes = coalesce($3, notes),
         updated_at = now()
     where order_id = $4`,
    [status, tracking ?? null, notes ?? null, orderId],
  );
  if (res.rowCount === 0) throw new Error(`Order not found: ${orderId}`);
}

export async function fetchPublicOrders(limit = 50): Promise<
  Array<{ orderId: string; createdAt: string; items: string; status: string; tracking: string }>
> {
  if (!isStoreDatabaseEnabled()) return fetchSheetPublicOrders(limit);
  await ensureStoreReady();
  const res = await getPool().query(
    `select order_id, created_at, items, status, tracking
     from orders
     order by created_at desc
     limit $1`,
    [limit],
  );
  return res.rows.map((row) => ({
    orderId: String(row.order_id),
    createdAt: new Date(row.created_at).toISOString(),
    items: String(row.items ?? ''),
    status: String(row.status ?? ''),
    tracking: String(row.tracking ?? ''),
  }));
}

export async function fetchOrder(orderId: string): Promise<OrderDetail | null> {
  if (!isStoreDatabaseEnabled()) return fetchSheetOrder(orderId);
  await ensureStoreReady();
  const res = await getPool().query(
    `select order_id, created_at, customer_email, customer_name, items,
            total_cents, currency, status, tracking
     from orders
     where order_id = $1
     limit 1`,
    [orderId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    orderId: String(row.order_id),
    createdAt: new Date(row.created_at).toISOString(),
    email: String(row.customer_email ?? ''),
    name: String(row.customer_name ?? ''),
    items: String(row.items ?? ''),
    totalCents: Number(row.total_cents ?? 0),
    currency: String(row.currency ?? 'USD'),
    status: String(row.status ?? ''),
    tracking: String(row.tracking ?? ''),
  };
}

export async function listAdminOrders(): Promise<AdminOrder[]> {
  if (!isStoreDatabaseEnabled()) return [];

  await ensureStoreReady();
  const res = await getPool().query(
    `select *
     from orders
     order by created_at desc
     limit 200`,
  );
  return res.rows.map((row) => ({
    orderId: String(row.order_id),
    createdAt: new Date(row.created_at).toISOString(),
    email: String(row.customer_email ?? ''),
    name: String(row.customer_name ?? ''),
    items: String(row.items ?? ''),
    totalCents: Number(row.total_cents ?? 0),
    currency: String(row.currency ?? 'USD'),
    discountCode: String(row.discount_code ?? ''),
    discountAmountCents: Number(row.discount_amount_cents ?? 0),
    shipAddress: String(row.ship_address ?? ''),
    shipCity: String(row.ship_city ?? ''),
    shipState: String(row.ship_state ?? ''),
    shipZip: String(row.ship_zip ?? ''),
    shipCountry: String(row.ship_country ?? ''),
    phone: String(row.customer_phone ?? ''),
    status: normalizeOrderStatus(row.status),
    tracking: String(row.tracking ?? ''),
    notes: String(row.notes ?? ''),
  }));
}

export async function listAdminDiscountCodes(): Promise<AdminDiscountCode[]> {
  if (!isStoreDatabaseEnabled()) return [];

  await ensureStoreReady();
  const res = await getPool().query(
    `select *
     from discount_codes
     order by created_at desc`,
  );

  return res.rows.map(rowToAdminDiscountCode);
}

export async function upsertDiscountCode(input: {
  code: string;
  label?: string;
  type: DiscountCodeType;
  amountOffCents?: number | null;
  percentOff?: number | null;
  maxRedemptions?: number | null;
  active?: boolean;
  createdBy?: string;
}): Promise<void> {
  requireStoreDatabase();
  await ensureStoreReady();

  const code = normalizeDiscountCode(input.code);
  const label = String(input.label ?? '').trim();
  let amountOffCents: number | null = null;
  let percentOff: number | null = null;

  if (input.type === 'amount_off') {
    amountOffCents = Math.max(1, Math.floor(Number(input.amountOffCents ?? 0)));
  } else {
    percentOff = Number(input.percentOff ?? 0);
  }

  validateDiscountConfig({ code, type: input.type, amountOffCents, percentOff });

  await getPool().query(
    `insert into discount_codes (
       code, label, type, amount_off_cents, percent_off, max_redemptions,
       active, stripe_coupon_id, created_by, created_at, updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, '', $8, now(), now())
     on conflict (code) do update set
       label = excluded.label,
       type = excluded.type,
       amount_off_cents = excluded.amount_off_cents,
       percent_off = excluded.percent_off,
       max_redemptions = excluded.max_redemptions,
       active = excluded.active,
       stripe_coupon_id = '',
       updated_at = now()`,
    [
      code,
      label,
      input.type,
      amountOffCents,
      percentOff,
      1,
      input.active ?? true,
      String(input.createdBy ?? '').trim(),
    ],
  );
}

export const MAX_DISCOUNT_CODE_BATCH = 100;

export async function generateSingleUseDiscountCode(input: {
  prefix?: string;
  label?: string;
  type: DiscountCodeType;
  amountOffCents?: number | null;
  percentOff?: number | null;
  createdBy?: string;
}): Promise<AdminDiscountCode> {
  const [code] = await generateSingleUseDiscountCodes({ ...input, count: 1 });
  return code;
}

export async function generateSingleUseDiscountCodes(input: {
  prefix?: string;
  label?: string;
  type: DiscountCodeType;
  amountOffCents?: number | null;
  percentOff?: number | null;
  count?: number;
  createdBy?: string;
}): Promise<AdminDiscountCode[]> {
  requireStoreDatabase();
  await ensureStoreReady();

  const count = Math.floor(Number(input.count ?? 1));
  if (!Number.isFinite(count) || count < 1 || count > MAX_DISCOUNT_CODE_BATCH) {
    throw new Error(`Batch count must be between 1 and ${MAX_DISCOUNT_CODE_BATCH}.`);
  }

  const prefix = normalizeDiscountCodePrefix(input.prefix || 'SWAG');
  const label = String(input.label ?? '').trim();
  const createdBy = String(input.createdBy ?? '').trim();
  const amountOffCents =
    input.type === 'amount_off' ? Math.max(1, Math.floor(Number(input.amountOffCents ?? 0))) : null;
  const percentOff = input.type === 'percent_off' ? Number(input.percentOff ?? 0) : null;

  validateDiscountConfig({ code: prefix, type: input.type, amountOffCents, percentOff });

  const generated: AdminDiscountCode[] = [];
  while (generated.length < count) {
    let inserted: AdminDiscountCode | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = `${prefix}-${randomCodeSuffix()}`;
      const res = await getPool().query(
        `insert into discount_codes (
           code, label, type, amount_off_cents, percent_off, max_redemptions,
           active, stripe_coupon_id, created_by, created_at, updated_at
         )
         values ($1, $2, $3, $4, $5, 1, true, '', $6, now(), now())
         on conflict (code) do nothing
         returning *`,
        [code, label, input.type, amountOffCents, percentOff, createdBy],
      );

      if (res.rows[0]) {
        inserted = rowToAdminDiscountCode(res.rows[0]);
        break;
      }
    }

    if (!inserted) throw new Error('Could not generate a unique discount code.');
    generated.push(inserted);
  }

  return generated;
}

export async function updateDiscountCodeActive({
  code,
  active,
}: {
  code: string;
  active: boolean;
}): Promise<void> {
  requireStoreDatabase();
  await ensureStoreReady();
  const res = await getPool().query(
    `update discount_codes
     set active = $1, updated_at = now()
     where code = $2`,
    [active, normalizeDiscountCode(code)],
  );
  if (res.rowCount === 0) throw new Error(`Discount code not found: ${code}`);
}

export async function validateDiscountCode({
  code,
  subtotalCents,
}: {
  code: string;
  subtotalCents: number;
}): Promise<AppliedDiscount> {
  if (!isStoreDatabaseEnabled()) {
    throw new Error('Discount codes require DATABASE_URL.');
  }

  await ensureStoreReady();
  const normalizedCode = normalizeDiscountCode(code);
  const res = await getPool().query(
    `select *
     from discount_codes
     where code = $1
     limit 1`,
    [normalizedCode],
  );
  const row = res.rows[0];
  if (!row) throw new Error('Discount code not found.');

  const discount = rowToAdminDiscountCode(row);
  if (!discount.active) throw new Error('Discount code is inactive.');
  if (discount.maxRedemptions !== null && discount.timesRedeemed >= discount.maxRedemptions) {
    throw new Error('Discount code has already been redeemed.');
  }

  const subtotal = Math.max(0, Math.floor(subtotalCents));
  const discountCents =
    discount.type === 'amount_off'
      ? Math.min(discount.amountOffCents ?? 0, subtotal)
      : Math.min(Math.round(subtotal * ((discount.percentOff ?? 0) / 100)), subtotal);

  if (discountCents <= 0) {
    throw new Error('Discount code does not apply to this cart.');
  }

  return {
    code: discount.code,
    label: discount.label,
    type: discount.type,
    discountCents,
    amountOffCents: discount.amountOffCents,
    percentOff: discount.percentOff,
  };
}

export async function setDiscountStripeCouponId({
  code,
  stripeCouponId,
}: {
  code: string;
  stripeCouponId: string;
}): Promise<void> {
  if (!isStoreDatabaseEnabled()) return;
  await ensureStoreReady();
  await getPool().query(
    `update discount_codes
     set stripe_coupon_id = $1, updated_at = now()
     where code = $2`,
    [stripeCouponId, normalizeDiscountCode(code)],
  );
}

export async function recordDiscountRedemption({
  code,
  orderId,
  stripeSessionId,
  amountCents,
}: {
  code: string;
  orderId: string;
  stripeSessionId: string;
  amountCents: number;
}): Promise<{ redeemed: boolean }> {
  if (!isStoreDatabaseEnabled()) return { redeemed: false };
  await ensureStoreReady();

  const client = await getPool().connect();
  try {
    await client.query('begin');
    const inserted = await client.query(
      `insert into discount_redemptions (stripe_session_id, code, order_id, amount_cents)
       values ($1, $2, $3, $4)
       on conflict do nothing
       returning stripe_session_id`,
      [
        stripeSessionId,
        normalizeDiscountCode(code),
        orderId,
        Math.max(0, Math.floor(amountCents)),
      ],
    );

    if ((inserted.rowCount ?? 0) > 0) {
      await client.query(
        `update discount_codes
         set times_redeemed = times_redeemed + 1, updated_at = now()
         where code = $1`,
        [normalizeDiscountCode(code)],
      );
      await client.query('commit');
      return { redeemed: true };
    }

    const existingSession = await client.query(
      `select 1 from discount_redemptions where stripe_session_id = $1 limit 1`,
      [stripeSessionId],
    );
    if (existingSession.rows[0]) {
      await client.query('commit');
      return { redeemed: false };
    }

    throw new Error(`Discount code ${normalizeDiscountCode(code)} has already been redeemed.`);
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function listAdminApiTokens(): Promise<AdminApiToken[]> {
  if (!isStoreDatabaseEnabled()) return [];

  await ensureStoreReady();
  const res = await getPool().query(
    `select id, name, token_prefix, actor_email, active, last_used_at, created_by, created_at, revoked_at
     from api_tokens
     order by created_at desc
     limit 50`,
  );

  return res.rows.map(rowToAdminApiToken);
}

export async function generateApiToken({
  name,
  actorEmail,
  createdBy,
}: {
  name: string;
  actorEmail: string;
  createdBy: string;
}): Promise<GeneratedApiToken> {
  requireStoreDatabase();
  await ensureStoreReady();

  const cleanName = String(name ?? '').trim();
  if (!cleanName) throw new Error('API token name is required.');

  const cleanActorEmail = String(actorEmail ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanActorEmail)) {
    throw new Error('API token actor email is required.');
  }

  const token = `swag_${randomBytes(32).toString('base64url')}`;
  const tokenPrefix = `${token.slice(0, 12)}...`;
  const res = await getPool().query(
    `insert into api_tokens (name, token_hash, token_prefix, actor_email, active, created_by)
     values ($1, $2, $3, $4, true, $5)
     returning id, name, token_prefix, actor_email, active, last_used_at, created_by, created_at, revoked_at`,
    [cleanName, hashApiToken(token), tokenPrefix, cleanActorEmail, String(createdBy ?? '').trim()],
  );

  return {
    token,
    apiToken: rowToAdminApiToken(res.rows[0]),
  };
}

export async function updateApiToken({
  id,
  name,
  actorEmail,
}: {
  id: number;
  name: string;
  actorEmail: string;
}): Promise<void> {
  requireStoreDatabase();
  await ensureStoreReady();

  const cleanId = Math.floor(Number(id));
  if (!Number.isSafeInteger(cleanId) || cleanId <= 0) throw new Error('API token id is required.');

  const cleanName = String(name ?? '').trim();
  if (!cleanName) throw new Error('API token name is required.');

  const cleanActorEmail = String(actorEmail ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanActorEmail)) {
    throw new Error('API token actor email is required.');
  }

  const res = await getPool().query(
    `update api_tokens
     set name = $1, actor_email = $2
     where id = $3 and active = true`,
    [cleanName, cleanActorEmail, cleanId],
  );
  if (res.rowCount === 0) throw new Error('API token not found or already revoked.');
}

export async function revokeApiToken(id: number): Promise<void> {
  requireStoreDatabase();
  await ensureStoreReady();
  const res = await getPool().query(
    `update api_tokens
     set active = false, revoked_at = now()
     where id = $1 and active = true`,
    [id],
  );
  if (res.rowCount === 0) throw new Error('API token not found or already revoked.');
}

export async function findApiActorByToken(token: string): Promise<ApiTokenActor | null> {
  if (!isStoreDatabaseEnabled()) return null;

  await ensureStoreReady();
  const tokenHash = hashApiToken(token);
  const res = await getPool().query(
    `update api_tokens
     set last_used_at = now()
     where token_hash = $1 and active = true
     returning actor_email`,
    [tokenHash],
  );

  const row = res.rows[0];
  if (!row) return null;
  return { email: String(row.actor_email) };
}

export async function createInventoryImportRun({
  source,
  actorEmail,
}: {
  source: string;
  actorEmail: string;
}): Promise<number> {
  requireStoreDatabase();
  await ensureStoreReady();
  const res = await getPool().query(
    `insert into inventory_import_runs (source, actor_email)
     values ($1, $2)
     returning id`,
    [source, actorEmail],
  );
  return Number(res.rows[0].id);
}

export async function completeInventoryImportRun({
  id,
  status,
  summary,
  error = '',
}: {
  id: number;
  status: 'complete' | 'failed';
  summary: Record<string, unknown>;
  error?: string;
}): Promise<void> {
  requireStoreDatabase();
  await getPool().query(
    `update inventory_import_runs
     set status = $1, completed_at = now(), summary = $2, error = $3
     where id = $4`,
    [status, JSON.stringify(summary), error, id],
  );
}

export async function listInventoryImportRuns(): Promise<InventoryImportRun[]> {
  if (!isStoreDatabaseEnabled()) return [];

  await ensureStoreReady();
  const res = await getPool().query(
    `select *
     from inventory_import_runs
     order by started_at desc
     limit 20`,
  );
  return res.rows.map((row) => ({
    id: Number(row.id),
    source: String(row.source),
    status: row.status === 'complete' || row.status === 'failed' ? row.status : 'running',
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    actorEmail: String(row.actor_email ?? ''),
    summary: typeof row.summary === 'object' && row.summary ? row.summary : {},
    error: String(row.error ?? ''),
  }));
}

export async function resetStoreInventoryFromCatalog({
  actorEmail,
  source = 'notion-swag-inventory',
}: {
  actorEmail: string;
  source?: string;
}): Promise<{
  importRunId: number;
  products: number;
  variants: number;
  source: string;
}> {
  requireStoreDatabase();
  await ensureStoreReady();

  const importRunId = await createInventoryImportRun({ source, actorEmail });
  const productIds = PRODUCTS.map((product) => product.id);
  const variantIds = PRODUCTS.flatMap((product) => product.variants.map((variant) => variant.id));

  try {
    for (const product of PRODUCTS) {
      await upsertProduct(product, { preserveVariantStock: false });
    }

    await getPool().query(
      'delete from product_variants where not (id = any($1::text[]))',
      [variantIds],
    );
    await getPool().query(
      'delete from products where not (id = any($1::text[]))',
      [productIds],
    );

    const summary = {
      products: productIds.length,
      variants: variantIds.length,
      source,
    };
    await completeInventoryImportRun({
      id: importRunId,
      status: 'complete',
      summary,
    });

    return {
      importRunId,
      products: productIds.length,
      variants: variantIds.length,
      source,
    };
  } catch (err) {
    await completeInventoryImportRun({
      id: importRunId,
      status: 'failed',
      summary: {},
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function upsertProduct(
  product: Product,
  options: { preserveVariantStock?: boolean } = {},
): Promise<void> {
  await ensureStoreSchema();
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into products (
        id, slug, name, type, sku, tagline, blurb, description, fabric, fit,
        corner_tag, cover, price_cents, category, image, image_placeholder,
        colors, sizes, featured, tags, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now())
      on conflict (id) do update set
        slug = excluded.slug,
        name = excluded.name,
        type = excluded.type,
        sku = excluded.sku,
        tagline = excluded.tagline,
        blurb = excluded.blurb,
        description = excluded.description,
        fabric = excluded.fabric,
        fit = excluded.fit,
        corner_tag = excluded.corner_tag,
        cover = excluded.cover,
        price_cents = excluded.price_cents,
        category = excluded.category,
        image = excluded.image,
        image_placeholder = excluded.image_placeholder,
        colors = excluded.colors,
        sizes = excluded.sizes,
        featured = excluded.featured,
        tags = excluded.tags,
        updated_at = now()`,
      [
        product.id,
        product.slug,
        product.name,
        product.type,
        product.sku,
        product.tagline,
        product.blurb,
        product.description,
        product.fabric,
        product.fit,
        product.cornerTag,
        product.cover,
        product.price,
        product.category,
        product.image,
        product.imagePlaceholder,
        JSON.stringify(product.colors ?? []),
        JSON.stringify(product.sizes ?? []),
        product.featured,
        JSON.stringify(product.tags),
      ],
    );

    for (const variant of product.variants) {
      if (options.preserveVariantStock) {
        await client.query(
          `insert into product_variants (id, product_id, size, color, initial_stock, stock, updated_at)
           values ($1, $2, $3, $4, $5, $5, now())
           on conflict (id) do update set
             product_id = excluded.product_id,
             size = excluded.size,
             color = excluded.color,
             initial_stock = excluded.initial_stock,
             updated_at = now()`,
          [
            variant.id,
            product.id,
            variant.size ?? '',
            variant.color ?? '',
            variant.stock,
          ],
        );
      } else {
        await client.query(
          `insert into product_variants (id, product_id, size, color, initial_stock, stock, updated_at)
           values ($1, $2, $3, $4, $5, $5, now())
           on conflict (id) do update set
             product_id = excluded.product_id,
             size = excluded.size,
             color = excluded.color,
             initial_stock = excluded.initial_stock,
             stock = excluded.stock,
             updated_at = now()`,
          [
            variant.id,
            product.id,
            variant.size ?? '',
            variant.color ?? '',
            variant.stock,
          ],
        );
      }
    }

    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function upsertAdminProduct(product: Product): Promise<void> {
  requireStoreDatabase();
  await upsertProduct(product, { preserveVariantStock: false });
  await getPool().query(
    'delete from product_variants where product_id = $1 and not (id = any($2::text[]))',
    [product.id, product.variants.map((variant) => variant.id)],
  );
}

async function findVariantForUpdate(
  client: PoolClient,
  item: StoreLineItem,
): Promise<{
  id: string;
  sku: string;
  name: string;
  size: string;
  color: string;
  stock: number;
} | null> {
  const res = await client.query(
    `select v.id, p.sku, p.name, v.size, v.color, v.stock
     from product_variants v
     join products p on p.id = v.product_id
     where ($1::text is not null and v.id = $1)
        or ($1::text is null and $2::text is not null and p.sku = $2)
     order by v.id
     limit 1
     for update of v`,
    [item.variantId ?? null, item.sku ?? null],
  );

  const row = res.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    sku: String(row.sku),
    name: String(row.name),
    size: String(row.size ?? ''),
    color: String(row.color ?? ''),
    stock: Number(row.stock ?? 0),
  };
}

function findInventoryAdjustmentRow(
  rows: AdminInventoryRow[],
  item: InventoryAdjustmentInput,
): AdminInventoryRow | undefined {
  const variantId = item.variantId?.trim().toLowerCase();
  if (variantId) return rows.find((row) => row.variantId.toLowerCase() === variantId);

  const productId = item.productId?.trim().toLowerCase();
  const sku = item.sku?.trim().toLowerCase();
  const size = normalizeInventoryToken(item.size);
  const color = normalizeInventoryToken(item.color);
  const candidates = rows.filter((row) => {
    if (productId && row.productId.toLowerCase() !== productId) return false;
    if (sku && row.sku.toLowerCase() !== sku) return false;
    if (size && normalizeInventoryToken(row.size) !== size) return false;
    if (color && normalizeInventoryToken(row.color) !== color) return false;
    return Boolean(productId || sku);
  });

  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1 && !size && !color) {
    const singleVariantProduct = new Set(candidates.map((row) => row.productId)).size === 1;
    return singleVariantProduct && candidates.length === 1 ? candidates[0] : undefined;
  }
  return undefined;
}

function inventoryQuantityChange(
  mode: InventoryAdjustmentMode,
  item: InventoryAdjustmentInput,
  currentStock: number,
): number | null {
  if (mode === 'audit_count') {
    const stock = Number(item.stock ?? item.quantity);
    if (!Number.isSafeInteger(stock) || stock < 0) return null;
    return stock - currentStock;
  }

  const quantity = Number(item.quantity);
  if (!Number.isSafeInteger(quantity)) return null;
  if (mode === 'receive_shipment') return quantity > 0 ? quantity : null;
  return quantity === 0 ? null : quantity;
}

function inventoryQuantityError(mode: InventoryAdjustmentMode, itemNumber: number): string {
  if (mode === 'audit_count') {
    return `Item ${itemNumber} needs a non-negative integer stock count for audit_count.`;
  }
  if (mode === 'receive_shipment') {
    return `Item ${itemNumber} needs a positive integer quantity for receive_shipment.`;
  }
  return `Item ${itemNumber} needs a non-zero integer quantity for manual_correction.`;
}

function validateInventoryAdjustmentMode(mode: InventoryAdjustmentMode): void {
  if (mode !== 'receive_shipment' && mode !== 'audit_count' && mode !== 'manual_correction') {
    throw new Error('mode must be receive_shipment, audit_count, or manual_correction.');
  }
}

function normalizeInventoryToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function rowToInventoryAdjustmentRecord(row: Record<string, unknown>): InventoryAdjustmentRecord {
  return {
    id: Number(row.id),
    batchId: String(row.batch_id ?? ''),
    mode: row.mode === 'audit_count' || row.mode === 'manual_correction' ? row.mode : 'receive_shipment',
    source: String(row.source ?? ''),
    reason: String(row.reason ?? ''),
    actorEmail: String(row.actor_email ?? ''),
    createdAt: new Date(row.created_at as string | number | Date).toISOString(),
    variantId: String(row.variant_id ?? ''),
    productId: String(row.product_id ?? ''),
    productName: String(row.product_name ?? ''),
    sku: String(row.sku ?? ''),
    size: String(row.size ?? ''),
    color: String(row.color ?? ''),
    previousStock: Number(row.previous_stock ?? 0),
    quantityChange: Number(row.quantity_change ?? 0),
    newStock: Number(row.new_stock ?? 0),
    note: String(row.note ?? ''),
  };
}

function parseJsonArray<T>(value: unknown): T[] | undefined {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function sortProductSizes(sizes: ProductSize[] | undefined): ProductSize[] | undefined {
  if (!sizes) return undefined;
  return [...sizes].sort((a, b) => sizeOrderRank(a) - sizeOrderRank(b));
}

function compareInventoryRows(a: AdminInventoryRow, b: AdminInventoryRow): number {
  return (
    a.productName.localeCompare(b.productName) ||
    sizeOrderRank(a.size) - sizeOrderRank(b.size) ||
    a.color.localeCompare(b.color) ||
    a.variantId.localeCompare(b.variantId)
  );
}

function sizeOrderRank(size: string | undefined): number {
  const index = PRODUCT_SIZE_ORDER.indexOf(String(size ?? '').toUpperCase() as ProductSize);
  return index === -1 ? 99 : index + 1;
}

function normalizeLowStockThreshold(value: number): number {
  const threshold = Number(value);
  return Number.isSafeInteger(threshold) && threshold >= 0 ? threshold : 5;
}

function stringOrUndefined(value: unknown): string | undefined {
  const text = String(value ?? '');
  return text ? text : undefined;
}

function normalizeOrderStatus(value: unknown): OrderStatus {
  return value === 'fulfilled' || value === 'shipped' ? value : 'pending';
}

function rowToAdminDiscountCode(row: Record<string, unknown>): AdminDiscountCode {
  return {
    code: String(row.code ?? ''),
    label: String(row.label ?? ''),
    type: row.type === 'percent_off' ? 'percent_off' : 'amount_off',
    amountOffCents: row.amount_off_cents === null ? null : Number(row.amount_off_cents ?? 0),
    percentOff: row.percent_off === null ? null : Number(row.percent_off ?? 0),
    maxRedemptions: row.max_redemptions === null ? null : Number(row.max_redemptions ?? 0),
    timesRedeemed: Number(row.times_redeemed ?? 0),
    active: Boolean(row.active),
    stripeCouponId: String(row.stripe_coupon_id ?? ''),
    createdBy: String(row.created_by ?? ''),
    createdAt: new Date(row.created_at as string | number | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | number | Date).toISOString(),
  };
}

function rowToAdminApiToken(row: Record<string, unknown>): AdminApiToken {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    tokenPrefix: String(row.token_prefix ?? ''),
    actorEmail: String(row.actor_email ?? ''),
    active: Boolean(row.active),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at as string | number | Date).toISOString() : null,
    createdBy: String(row.created_by ?? ''),
    createdAt: new Date(row.created_at as string | number | Date).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string | number | Date).toISOString() : null,
  };
}

function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeDiscountCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(normalized)) {
    throw new Error('Discount codes must be 3-40 characters using letters, numbers, dashes, or underscores.');
  }
  return normalized;
}

function normalizeDiscountCodePrefix(prefix: string): string {
  // Trim whitespace and trailing dashes so 'AIEWF-' === 'AIEWF' before the
  // random suffix is appended, then re-trim after the length cap in case the
  // cut lands on a dash.
  const trimmed = prefix.trim().replace(/[-\s]+$/, '');
  return normalizeDiscountCode(trimmed).slice(0, 16).replace(/-+$/, '');
}

function randomCodeSuffix(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  let suffix = '';
  for (const byte of bytes) {
    suffix += alphabet[byte % alphabet.length];
  }
  return suffix;
}

function validateDiscountConfig({
  code,
  type,
  amountOffCents,
  percentOff,
}: {
  code: string;
  type: DiscountCodeType;
  amountOffCents: number | null;
  percentOff: number | null;
}): void {
  normalizeDiscountCode(code);
  if (type === 'amount_off') {
    if (!amountOffCents || amountOffCents < 1) {
      throw new Error('Amount-off discount codes need a positive dollar amount.');
    }
    return;
  }

  if (!percentOff || percentOff <= 0 || percentOff > 100) {
    throw new Error('Percent-off discount codes need a percentage from 1 to 100.');
  }
}

function requireStoreDatabase(): void {
  if (!isStoreDatabaseEnabled()) {
    throw new Error('DATABASE_URL is required for live admin mutations.');
  }
}
