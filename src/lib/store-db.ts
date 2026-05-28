import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { PRODUCTS, type Product, type ProductColor, type ProductSize } from './catalog';
import { getPool, hasDatabaseUrl } from './db';
import type { OrderDetail, OrderRow } from './sheets';
import {
  appendOrder as appendSheetOrder,
  fetchOrder as fetchSheetOrder,
  fetchPublicOrders as fetchSheetPublicOrders,
} from './sheets';

export type OrderStatus = 'pending' | 'fulfilled' | 'shipped';
export type DiscountCodeType = 'amount_off' | 'percent_off';

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
  size: string;
  color: string;
  quantity: number;
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
    getPool().query('select * from product_variants order by id'),
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
    sizes: parseJsonArray<ProductSize>(row.sizes),
    variants: variantsByProduct.get(String(row.id)) ?? [],
    featured: Boolean(row.featured),
    tags: parseJsonArray<string>(row.tags) ?? [],
  }));
}

export async function getPublicProduct(slug: string): Promise<Product | undefined> {
  const products = await listPublicProducts();
  return products.find((product) => product.slug === slug);
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
    );
  }

  await ensureStoreReady();
  const res = await getPool().query(
    `select p.id as product_id, p.name as product_name, p.slug, p.type, p.sku,
            p.image, v.id as variant_id, v.size, v.color, v.stock,
            v.initial_stock, v.updated_at
     from product_variants v
     join products p on p.id = v.product_id
     order by p.name, v.size, v.color`,
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
  }));
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
    if (!row) throw new Error(`Product variant not found: ${item.variantId}`);
    const stock = Number(row.stock ?? 0);
    if (stock < item.quantity) {
      throw new Error(`${row.name} has only ${stock} left in stock.`);
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
      size: item.size ?? '',
      color: item.color ?? '',
      quantity: item.quantity ?? 1,
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

      await client.query(
        `update product_variants
         set stock = stock - $1, updated_at = now()
         where id = $2`,
        [quantity, variant.id],
      );

      reservations.push({
        sku: variant.sku,
        name: item.productName ?? item.description ?? variant.name,
        size: item.size ?? variant.size ?? '',
        color: item.color ?? variant.color ?? '',
        quantity,
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
       active, stripe_coupon_id, created_at, updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, '', now(), now())
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
    ],
  );
}

export async function generateSingleUseDiscountCode(input: {
  prefix?: string;
  label?: string;
  type: DiscountCodeType;
  amountOffCents?: number | null;
  percentOff?: number | null;
}): Promise<AdminDiscountCode> {
  requireStoreDatabase();
  await ensureStoreReady();

  const prefix = normalizeDiscountCode(input.prefix || 'SWAG').slice(0, 16);
  const label = String(input.label ?? '').trim();
  const amountOffCents =
    input.type === 'amount_off' ? Math.max(1, Math.floor(Number(input.amountOffCents ?? 0))) : null;
  const percentOff = input.type === 'percent_off' ? Number(input.percentOff ?? 0) : null;

  validateDiscountConfig({ code: prefix, type: input.type, amountOffCents, percentOff });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `${prefix}-${randomCodeSuffix()}`;
    const res = await getPool().query(
      `insert into discount_codes (
         code, label, type, amount_off_cents, percent_off, max_redemptions,
         active, stripe_coupon_id, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, 1, true, '', now(), now())
       on conflict (code) do nothing
       returning *`,
      [code, label, input.type, amountOffCents, percentOff],
    );

    if (res.rows[0]) return rowToAdminDiscountCode(res.rows[0]);
  }

  throw new Error('Could not generate a unique discount code.');
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
