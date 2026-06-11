#!/usr/bin/env node
/**
 * Import products into the swag store from Riley's "Swag Store Upload" sheet export.
 *
 * The sheet itself is fetched OUTSIDE this script (gws CLI / manual export) and saved
 * as a CSV or TSV file. Product images are downloaded to a local directory with
 * filenames matching the COVER column. This script maps rows to POST /api/ai/products
 * payloads and upserts them (the API is idempotent on product id).
 *
 * Usage:
 *   node scripts/import-products-from-sheet.mjs \
 *     --base-url http://localhost:3000 \
 *     --token <SWAG_STORE_API_TOKEN or admin API token> \
 *     --csv /tmp/swag-import/products.tsv \
 *     --images /tmp/swag-import \
 *     [--stock-overrides /tmp/swag-import/stock.json]   # { "<variantId>": <stock>, ... }
 *     [--dry-run]                                       # print payloads, no POSTs
 *
 * Expected columns (header row required, order-insensitive, case-insensitive):
 *   Name | SKU | SLUG | TYPE | PRICE | CATEGORY | COVER | IMAGE PATH / URL |
 *   IMAGE PLACEHOLDER | TAGLINE | CARD BLURB | FABRIC | FIT | CORNER TAG |
 *   TAGS | DESCRIPTION | COLORS | SIZES
 *
 * Mapping notes:
 *   - TYPE column (apparel/accessories) -> API `category`
 *   - CATEGORY column (shirts/socks/"shirts / limited") -> API `type` display label
 *   - COVER column is the source image FILENAME inside --images; missing files are
 *     reported and the product is imported without an image (placeholder shows).
 *   - IMAGE PATH / URL column is ignored (uploads are served from /api/product-images).
 *   - Per-variant stock defaults to 0; shipments arrive via the audited /admin
 *     receive-shipment flow. Use --stock-overrides only for migrations.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--base-url': args.baseUrl = argv[++i]; break;
      case '--token': args.token = argv[++i]; break;
      case '--csv': args.csv = argv[++i]; break;
      case '--images': args.images = argv[++i]; break;
      case '--stock-overrides': args.stockOverrides = argv[++i]; break;
      case '--dry-run': args.dryRun = true; break;
      default:
        console.error(`Unknown argument: ${flag}`);
        process.exit(2);
    }
  }
  const missing = ['baseUrl', 'token', 'csv'].filter((k) => !args[k]);
  if (missing.length) {
    console.error(`Missing required args: ${missing.map((m) => `--${m.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`).join(', ')}`);
    console.error('Usage: node scripts/import-products-from-sheet.mjs --base-url <url> --token <token> --csv <path> [--images <dir>] [--stock-overrides <json>] [--dry-run]');
    process.exit(2);
  }
  return args;
}

// ---------------------------------------------------------------------------
// CSV / TSV parsing
// ---------------------------------------------------------------------------

function parseDelimited(text) {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const delim = firstLine.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === '' && delim === ',') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Field mappers
// ---------------------------------------------------------------------------

const SIZE_NORMALIZE = { '2XL': 'XXL', '3XL': 'XXXL', 'XXL': 'XXL', 'XXXL': 'XXXL', 'XS': 'XS', 'S': 'S', 'M': 'M', 'L': 'L', 'XL': 'XL' };

function parsePrice(raw) {
  const cleaned = String(raw ?? '').replace(/[$,\s]/g, '');
  if (!cleaned || !Number.isFinite(Number(cleaned))) {
    throw new Error(`Unparseable PRICE: "${raw}"`);
  }
  return Number(cleaned).toFixed(2);
}

function mapTypeDisplay(sheetCategory) {
  const value = String(sheetCategory ?? '').toLowerCase();
  if (value.includes('limited')) return 'Limited Tee';
  if (value.includes('sock')) return 'Socks';
  if (value.includes('shirt')) return 'Tee';
  return sheetCategory?.trim() || 'Swag';
}

function parseColors(raw) {
  // "#FFFFFF (White), #FF4D1C (Orange)" -> [{ hex, name, label }]
  const colors = [];
  for (const part of String(raw ?? '').split(',')) {
    const match = part.trim().match(/^(#[0-9a-fA-F]{3,8})\s*\(([^)]+)\)$/);
    if (match) {
      const label = match[2].trim();
      colors.push({ hex: match[1], name: label.split(/\s+/)[0].toLowerCase(), label });
    } else if (part.trim()) {
      const label = part.trim();
      colors.push({ name: label.split(/\s+/)[0].toLowerCase(), label });
    }
  }
  return colors;
}

function parseSizes(raw) {
  // "S, M, L, XL, 2XL" -> { sizes: [...], oneSize: false } | "ONE SIZE" -> { sizes: [], oneSize: true }
  const value = String(raw ?? '').trim();
  if (!value) return { sizes: [], oneSize: false };
  if (/^one\s*size/i.test(value)) return { sizes: [], oneSize: true };
  const sizes = [];
  for (const part of value.split(',')) {
    const token = part.trim().toUpperCase();
    if (!token) continue;
    const normalized = SIZE_NORMALIZE[token];
    if (!normalized) throw new Error(`Unknown size "${part.trim()}" in SIZES column`);
    if (!sizes.includes(normalized)) sizes.push(normalized);
  }
  return { sizes, oneSize: false };
}

const IMAGE_CONTENT_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function buildPayload(record, { imagesDir, stockOverrides }) {
  const warnings = [];
  const slug = record['slug']?.trim();
  const name = record['name']?.trim();
  if (!name || !slug) throw new Error('Row is missing Name or SLUG');

  const { sizes, oneSize } = parseSizes(record['sizes']);
  const colors = parseColors(record['colors']);
  const firstColorName = colors[0]?.name;

  // Variants: one per size, or a single one-size variant. Stock defaults to 0.
  let variantSpecs;
  if (sizes.length) {
    variantSpecs = sizes.map((size) => ({ id: `var_${slug}-${size.toLowerCase()}`, size }));
  } else {
    if (!oneSize) warnings.push('No SIZES in sheet; created a single default (one-size) variant');
    variantSpecs = [{ id: `var_${slug}-one` }];
  }
  const variants = variantSpecs.map((spec) => ({
    ...spec,
    ...(firstColorName ? { color: firstColorName } : {}),
    stock: stockOverrides[spec.id] ?? 0,
  }));

  const payload = {
    id: `prod_${slug.replace(/-/g, '_')}`,
    slug,
    name,
    sku: record['sku']?.trim() ?? '',
    type: mapTypeDisplay(record['category']),
    category: record['type']?.trim().toLowerCase() === 'accessories' ? 'accessories' : 'apparel',
    priceDollars: parsePrice(record['price']),
    cover: 'light',
    tagline: record['tagline']?.trim() ?? '',
    blurb: record['card blurb']?.trim() ?? '',
    description: record['description']?.trim() ?? '',
    fabric: record['fabric']?.trim() ?? '',
    fit: record['fit']?.trim() ?? '',
    cornerTag: record['corner tag']?.trim() || 'SWAG',
    variants,
  };

  if (sizes.length) payload.sizes = sizes;
  if (colors.length) payload.colors = colors;

  const placeholderHex = record['image placeholder']?.trim();
  if (placeholderHex) {
    payload.imagePlaceholder = `linear-gradient(135deg, ${placeholderHex} 0%, #2a2a2a 100%)`;
  } else {
    warnings.push('No IMAGE PLACEHOLDER hex; server default gradient will be used');
  }

  const tags = String(record['tags'] ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  if (tags.length) payload.tags = tags;

  // COVER column = source image filename inside --images dir.
  const coverFile = record['cover']?.trim();
  let imageStatus = 'none (no COVER filename in sheet)';
  if (coverFile) {
    const contentType = IMAGE_CONTENT_TYPES[extname(coverFile).toLowerCase()];
    const imagePath = imagesDir ? join(imagesDir, coverFile) : null;
    if (!contentType) {
      warnings.push(`Unsupported image extension on "${coverFile}"; imported without image`);
      imageStatus = `MISSING (${coverFile}: unsupported type)`;
    } else if (imagePath && existsSync(imagePath)) {
      payload.imageBase64 = readFileSync(imagePath).toString('base64');
      payload.imageContentType = contentType;
      imageStatus = coverFile;
    } else {
      warnings.push(`Image file "${coverFile}" not found in images dir; imported without image (placeholder shows)`);
      imageStatus = `MISSING (${coverFile})`;
    }
  }

  return { payload, warnings, imageStatus };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const stockOverrides = args.stockOverrides ? JSON.parse(readFileSync(args.stockOverrides, 'utf8')) : {};

  const rows = parseDelimited(readFileSync(args.csv, 'utf8'));
  if (rows.length < 2) {
    console.error('CSV needs a header row plus at least one product row.');
    process.exit(2);
  }
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const records = rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, i) => { record[header] = row[i] ?? ''; });
    return record;
  });

  const baseUrl = args.baseUrl.replace(/\/$/, '');
  const results = [];
  let failed = 0;

  for (const record of records) {
    const label = record['name']?.trim() || record['slug']?.trim() || '(unnamed row)';
    try {
      const { payload, warnings, imageStatus } = buildPayload(record, {
        imagesDir: args.images,
        stockOverrides,
      });
      if (args.dryRun) {
        const { imageBase64, ...rest } = payload;
        console.log(JSON.stringify({ ...rest, imageBase64: imageBase64 ? `<${imageBase64.length} chars>` : undefined }, null, 2));
        results.push({ label, id: payload.id, status: 'DRY RUN', image: imageStatus, warnings });
        continue;
      }
      const res = await fetch(`${baseUrl}/api/ai/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${args.token}` },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      results.push({
        label,
        id: body.product?.id ?? payload.id,
        status: 'OK',
        image: imageStatus,
        variants: body.product?.variants?.length ?? payload.variants.length,
        warnings,
      });
    } catch (err) {
      failed++;
      results.push({ label, id: '-', status: `FAILED: ${err.message}`, image: '-', warnings: [] });
    }
  }

  // Result table
  const pad = (s, n) => String(s ?? '').padEnd(n);
  console.log('\n' + pad('PRODUCT', 34) + pad('ID', 30) + pad('STATUS', 10) + pad('VARIANTS', 10) + 'IMAGE');
  console.log('-'.repeat(110));
  for (const r of results) {
    console.log(pad(r.label, 34) + pad(r.id, 30) + pad(r.status, 10) + pad(r.variants ?? '-', 10) + r.image);
    for (const w of r.warnings) console.log('    ! ' + w);
  }
  console.log(`\n${results.length - failed}/${results.length} products imported${args.dryRun ? ' (dry run)' : ''}.`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
