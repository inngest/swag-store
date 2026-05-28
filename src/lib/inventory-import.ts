import { PRODUCTS, type Product, type ProductVariant } from './catalog';
import { fetchInventorySheetRows } from './sheets';
import {
  completeInventoryImportRun,
  createInventoryImportRun,
  ensureStoreReady,
  upsertProduct,
} from './store-db';

export async function importInventorySheet({
  actorEmail,
}: {
  actorEmail: string;
}): Promise<{
  importRunId: number;
  products: number;
  variants: number;
}> {
  await ensureStoreReady();
  const importRunId = await createInventoryImportRun({
    source: process.env.INVENTORY_SHEET_ID ?? process.env.ORDERS_SHEET_ID ?? 'google-sheet',
    actorEmail,
  });

  try {
    const rows = await fetchInventorySheetRows();
    const products = new Map(PRODUCTS.map((product) => [product.id, cloneProduct(product)]));

    for (const row of rows) {
      const base = findBaseProduct(row);
      if (!base) continue;

      const product = products.get(base.id) ?? cloneProduct(base);
      const image = firstValue(row, ['image', 'photo', 'photo_url', 'image_url', 'product_photo']);
      const name = firstValue(row, ['name', 'product', 'product_name', 'item']);
      const price = parsePrice(firstValue(row, ['price_cents', 'price']));

      if (image) product.image = image;
      if (name) product.name = name;
      if (price !== null) product.price = price;

      const variant = findOrCreateVariant(product, row);
      const stock = parseInteger(firstValue(row, ['stock', 'quantity', 'qty', 'on_hand', 'inventory']));
      if (stock !== null) variant.stock = stock;

      products.set(product.id, product);
    }

    let variantCount = 0;
    for (const product of products.values()) {
      variantCount += product.variants.length;
      await upsertProduct(product, { preserveVariantStock: false });
    }

    const summary = {
      rows: rows.length,
      products: products.size,
      variants: variantCount,
    };
    await completeInventoryImportRun({
      id: importRunId,
      status: 'complete',
      summary,
    });

    return {
      importRunId,
      products: products.size,
      variants: variantCount,
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

function findBaseProduct(row: Record<string, string>): Product | undefined {
  const productId = firstValue(row, ['product_id', 'id']);
  const slug = firstValue(row, ['slug', 'product_slug']);
  const sku = firstValue(row, ['sku', 'product_sku']);
  const name = firstValue(row, ['name', 'product', 'product_name', 'item']);

  return PRODUCTS.find((product) => {
    return (
      (productId && product.id.toLowerCase() === productId.toLowerCase()) ||
      (slug && product.slug.toLowerCase() === slug.toLowerCase()) ||
      (sku && product.sku.toLowerCase() === sku.toLowerCase()) ||
      (name && product.name.toLowerCase() === name.toLowerCase())
    );
  });
}

function findOrCreateVariant(product: Product, row: Record<string, string>): ProductVariant {
  const variantId = firstValue(row, ['variant_id', 'variant']);
  const size = firstValue(row, ['size']);
  const color = firstValue(row, ['color', 'colour']);

  const existing = product.variants.find((variant) => {
    if (variantId && variant.id.toLowerCase() === variantId.toLowerCase()) return true;
    return (
      normalize(variant.size) === normalize(size) &&
      normalize(variant.color) === normalize(color)
    );
  });
  if (existing) return existing;

  const next: ProductVariant = {
    id:
      variantId ||
      `${product.id}-${normalize(size || 'one')}-${normalize(color || 'default')}`.replace(/_+/g, '-'),
    size: size ? (size.toUpperCase() as ProductVariant['size']) : undefined,
    color: color || undefined,
    stock: 0,
  };
  product.variants.push(next);
  if (next.size && !product.sizes?.includes(next.size)) {
    product.sizes = [...(product.sizes ?? []), next.size];
  }
  return next;
}

function cloneProduct(product: Product): Product {
  return {
    ...product,
    colors: product.colors?.map((color) => ({ ...color })),
    sizes: product.sizes ? [...product.sizes] : undefined,
    variants: product.variants.map((variant) => ({ ...variant })),
    tags: [...product.tags],
  };
}

function firstValue(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value) return value;
  }
  return '';
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseInteger(value: string): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value.replace(/,/g, ''), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function parsePrice(value: string): number | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/[$,]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Number.isInteger(parsed) && parsed > 100 ? parsed : Math.round(parsed * 100);
}
