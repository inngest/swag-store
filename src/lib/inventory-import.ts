import { PRODUCTS, type Product, type ProductSize, type ProductVariant } from './catalog';
import { fetchInventorySheetRows } from './sheets';
import {
  completeInventoryImportRun,
  createInventoryImportRun,
  ensureStoreReady,
  upsertProduct,
} from './store-db';

export type InventoryImportRow = Record<string, string>;

export type InventoryImportReview = {
  ok: boolean;
  summary: string;
  issues: Array<{
    severity: 'info' | 'warning' | 'error';
    message: string;
    row?: number;
  }>;
  missingVariants: Array<{
    product: string;
    size?: string;
    color?: string;
  }>;
};

export async function importInventorySheet({
  actorEmail,
}: {
  actorEmail: string;
}): Promise<{
  importRunId: number;
  products: number;
  variants: number;
}> {
  const rows = await fetchInventorySheetRows();
  return importInventoryRows({
    actorEmail,
    source: process.env.INVENTORY_SHEET_ID ?? process.env.ORDERS_SHEET_ID ?? 'google-sheet',
    rows,
    review: deterministicReview(rows),
  });
}

export async function importInventoryRows({
  actorEmail,
  source,
  rows,
  review,
}: {
  actorEmail: string;
  source: string;
  rows: InventoryImportRow[];
  review?: InventoryImportReview;
}): Promise<{
  importRunId: number;
  products: number;
  variants: number;
}> {
  await ensureStoreReady();
  const importRunId = await createInventoryImportRun({ source, actorEmail });

  try {
    const products = new Map(PRODUCTS.map((product) => [product.id, cloneProduct(product)]));
    const matchedVariants = collectMatchedVariants(rows);
    const deterministic = deterministicReview(rows, matchedVariants);
    const blockingIssues = [...deterministic.issues, ...(review?.issues ?? [])].filter(
      (issue) => issue.severity === 'error',
    );

    if (blockingIssues.length > 0) {
      throw new Error(blockingIssues.map((issue) => issue.message).join(' '));
    }

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
      llmReview: review ?? null,
      deterministicReview: deterministic,
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
      summary: { rows: rows.length, llmReview: review ?? null },
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export function parseInventoryDocument(text: string): InventoryImportRow[] {
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalizedText) return [];

  const delimiter = detectDelimiter(normalizedText);
  const table = parseDelimited(normalizedText, delimiter);
  const [rawHeaders, ...rawRows] = table;
  const headers = (rawHeaders ?? []).map((header) => normalizeHeader(header));
  const sizeColumnIndexes = headers
    .map((header, index) => ({ header, index, size: sizeFromHeader(header) }))
    .filter((entry): entry is { header: string; index: number; size: ProductSize | 'ONE_SIZE' } => Boolean(entry.size));

  const rows: InventoryImportRow[] = [];
  for (const rawRow of rawRows) {
    if (rawRow.every((value) => !String(value ?? '').trim())) continue;
    const base: InventoryImportRow = {};
    headers.forEach((header, index) => {
      if (!header || sizeColumnIndexes.some((entry) => entry.index === index)) return;
      base[header] = String(rawRow[index] ?? '').trim();
    });

    if (sizeColumnIndexes.length > 0) {
      const baseProduct = findBaseProduct(base);
      const singleOneSizeVariant =
        baseProduct?.variants.length === 1 && !baseProduct.variants[0]?.size;
      if (singleOneSizeVariant) {
        const firstStock = sizeColumnIndexes
          .map((entry) => String(rawRow[entry.index] ?? '').trim())
          .find(Boolean);
        if (firstStock) rows.push({ ...base, size: '', stock: firstStock });
        continue;
      }

      for (const entry of sizeColumnIndexes) {
        const value = String(rawRow[entry.index] ?? '').trim();
        if (!value) continue;
        rows.push({
          ...base,
          size: entry.size === 'ONE_SIZE' ? '' : entry.size,
          stock: value,
        });
      }
      continue;
    }

    rows.push(base);
  }

  return rows;
}

export function deterministicReview(
  rows: InventoryImportRow[],
  matchedVariants = collectMatchedVariants(rows),
): InventoryImportReview {
  const issues: InventoryImportReview['issues'] = [];
  const missingVariants: InventoryImportReview['missingVariants'] = [];

  if (rows.length === 0) {
    issues.push({ severity: 'error', message: 'No inventory rows were found in the uploaded file.' });
  }

  rows.forEach((row, index) => {
    const base = findBaseProduct(row);
    if (!base) {
      issues.push({
        severity: 'error',
        row: index + 1,
        message: `Row ${index + 1} does not match a known store product.`,
      });
      return;
    }

    const stock = parseInteger(firstValue(row, ['stock', 'quantity', 'qty', 'on_hand', 'inventory']));
    if (stock === null) {
      issues.push({
        severity: 'error',
        row: index + 1,
        message: `Row ${index + 1} for ${base.name} is missing a numeric quantity.`,
      });
    }
  });

  for (const product of PRODUCTS) {
    for (const variant of product.variants) {
      if (matchedVariants.has(variant.id)) continue;
      missingVariants.push({
        product: product.name,
        size: variant.size,
        color: variant.color,
      });
    }
  }

  if (missingVariants.length > 0) {
    issues.push({
      severity: 'error',
      message: `Missing required catalog counts: ${missingVariants
        .map((variant) => `${variant.product}${variant.size ? ` ${variant.size}` : ''}${variant.color ? ` ${variant.color}` : ''}`)
        .join(', ')}.`,
    });
  }

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    summary: `${rows.length} row${rows.length === 1 ? '' : 's'} parsed; ${missingVariants.length} required variant${missingVariants.length === 1 ? '' : 's'} missing.`,
    issues,
    missingVariants,
  };
}

function findBaseProduct(row: Record<string, string>): Product | undefined {
  const productId = firstValue(row, ['product_id', 'id']);
  const slug = firstValue(row, ['slug', 'product_slug']);
  const sku = firstValue(row, ['sku', 'product_sku']);
  const name = firstValue(row, ['name', 'product', 'product_name', 'item', 'item_name']);

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
  const size = normalizeSize(firstValue(row, ['size', 'size_label']));
  const color = firstValue(row, ['color', 'colour']);

  const existing = findMatchingVariant(product, variantId, size, color);
  if (existing) return existing;

  const next: ProductVariant = {
    id:
      variantId ||
      `${product.id}-${normalize(size || 'one')}-${normalize(color || 'default')}`.replace(/_+/g, '-'),
    size: size || undefined,
    color: color || undefined,
    stock: 0,
  };
  product.variants.push(next);
  if (next.size && !product.sizes?.includes(next.size)) {
    product.sizes = [...(product.sizes ?? []), next.size];
  }
  return next;
}

function findMatchingCatalogVariant(product: Product, row: InventoryImportRow): ProductVariant | undefined {
  const variantId = firstValue(row, ['variant_id', 'variant']);
  const size = normalizeSize(firstValue(row, ['size', 'size_label']));
  const color = firstValue(row, ['color', 'colour']);
  return findMatchingVariant(product, variantId, size, color);
}

function findMatchingVariant(
  product: Product,
  variantId: string,
  size: ProductSize | '',
  color: string,
): ProductVariant | undefined {
  return product.variants.find((variant) => {
    if (variantId && variant.id.toLowerCase() === variantId.toLowerCase()) return true;
    if (!size && !color && product.variants.length === 1) return true;
    if (size && !color && normalize(variant.size) === normalize(size)) return true;
    return normalize(variant.size) === normalize(size) && normalize(variant.color) === normalize(color);
  });
}

function collectMatchedVariants(rows: InventoryImportRow[]): Set<string> {
  const matched = new Set<string>();
  for (const row of rows) {
    const product = findBaseProduct(row);
    if (!product) continue;
    const variant = findMatchingCatalogVariant(product, row);
    if (variant) matched.add(variant.id);
  }
  return matched;
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

function detectDelimiter(text: string): ',' | '\t' | ';' {
  const firstLine = text.split('\n')[0] ?? '';
  const counts = {
    ',': (firstLine.match(/,/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
    ';': (firstLine.match(/;/g) ?? []).length,
  };
  if (counts['\t'] >= counts[','] && counts['\t'] >= counts[';']) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
}

function parseDelimited(text: string, delimiter: ',' | '\t' | ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if (!inQuotes && char === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  rows.push(row);
  return rows.filter((entry) => entry.some((value) => value.trim()));
}

function normalizeHeader(header: string): string {
  return normalize(header);
}

function sizeFromHeader(header: string): ProductSize | 'ONE_SIZE' | null {
  const normalized = normalize(header);
  if (normalized === 'one_size' || normalized === 'onesize' || normalized === 'one') return 'ONE_SIZE';
  const upper = normalized.toUpperCase();
  return isProductSize(upper) ? upper : null;
}

function normalizeSize(value: string): ProductSize | '' {
  const normalized = normalize(value);
  if (!normalized || normalized === 'one' || normalized === 'one_size' || normalized === 'onesize') return '';
  const upper = normalized.toUpperCase();
  return isProductSize(upper) ? upper : '';
}

function isProductSize(value: string): value is ProductSize {
  return ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].includes(value);
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
