import { randomBytes } from 'node:crypto';
import { getPool } from './db';
import { ensureStoreReady, isStoreDatabaseEnabled } from './store-db';

export const PRODUCT_IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ProductImageContentType = (typeof PRODUCT_IMAGE_CONTENT_TYPES)[number];

export const PRODUCT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const SOURCE_URL_TIMEOUT_MS = 10_000;
const SOURCE_URL_MAX_REDIRECTS = 5;

export type SavedProductImage = {
  id: string;
  url: string;
};

export type StoredProductImage = {
  contentType: ProductImageContentType;
  bytes: Buffer;
};

export type ProductImageInput = {
  imageSourceUrl?: string;
  imageBase64?: string;
  imageContentType?: string;
};

export function productImageUrl(id: string): string {
  return `/api/product-images/${id}`;
}

export async function saveProductImage({
  productId,
  contentType,
  buffer,
  actorEmail,
}: {
  productId: string;
  contentType: string;
  buffer: Buffer;
  actorEmail: string;
}): Promise<SavedProductImage> {
  requireProductImageDatabase();
  const validatedType = validateProductImage(contentType, buffer);

  await ensureStoreReady();
  const id = `img_${randomBytes(9).toString('hex')}`;
  await getPool().query(
    `insert into product_images (id, product_id, content_type, bytes, size_bytes, actor_email)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, productId, validatedType, buffer, buffer.byteLength, actorEmail],
  );

  return { id, url: productImageUrl(id) };
}

export async function getProductImage(id: string): Promise<StoredProductImage | null> {
  if (!isStoreDatabaseEnabled()) return null;
  await ensureStoreReady();

  const res = await getPool().query('select content_type, bytes from product_images where id = $1', [id]);
  const row = res.rows[0];
  if (!row) return null;

  return {
    contentType: row.content_type as ProductImageContentType,
    bytes: Buffer.from(row.bytes),
  };
}

/**
 * Resolves the optional agent-facing image inputs (imageSourceUrl or imageBase64 +
 * imageContentType) into a stored product image. Returns the /api/product-images/<id>
 * url, or null when neither input is provided.
 */
export async function resolveProductImageInput({
  productId,
  actorEmail,
  input,
}: {
  productId: string;
  actorEmail: string;
  input: ProductImageInput;
}): Promise<string | null> {
  const sourceUrl = input.imageSourceUrl?.trim();
  const base64 = input.imageBase64?.trim();

  if (sourceUrl && base64) {
    throw new Error('Provide imageSourceUrl or imageBase64, not both.');
  }

  if (sourceUrl) {
    const { contentType, buffer } = await fetchImageFromSourceUrl(sourceUrl);
    const saved = await saveProductImage({ productId, contentType, buffer, actorEmail });
    return saved.url;
  }

  if (base64) {
    const contentType = input.imageContentType?.trim().toLowerCase() ?? '';
    if (!contentType) {
      throw new Error('imageContentType is required when imageBase64 is provided.');
    }
    const buffer = decodeBase64Image(base64);
    const saved = await saveProductImage({ productId, contentType, buffer, actorEmail });
    return saved.url;
  }

  return null;
}

async function fetchImageFromSourceUrl(sourceUrl: string): Promise<{ contentType: string; buffer: Buffer }> {
  let url = parseHttpsUrl(sourceUrl, 'imageSourceUrl');

  for (let redirects = 0; redirects <= SOURCE_URL_MAX_REDIRECTS; redirects += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(SOURCE_URL_TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'failed';
      throw new Error(`Image fetch ${reason} for ${url.href}. imageSourceUrl must be a reachable https image.`);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Image fetch redirect from ${url.href} is missing a location header.`);
      url = parseHttpsUrl(new URL(location, url).href, 'imageSourceUrl redirect target');
      continue;
    }

    if (!response.ok) {
      throw new Error(`Image fetch failed for ${url.href} with status ${response.status}.`);
    }

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const buffer = Buffer.from(await response.arrayBuffer());
    return { contentType, buffer };
  }

  throw new Error(`Image fetch for ${sourceUrl} followed too many redirects.`);
}

function parseHttpsUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid https URL.`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${label} must use https, got ${url.protocol.replace(':', '')}.`);
  }
  return url;
}

function decodeBase64Image(value: string): Buffer {
  const cleaned = value.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  if (!cleaned || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    throw new Error('imageBase64 must be valid base64-encoded image data.');
  }
  return Buffer.from(cleaned, 'base64');
}

function validateProductImage(contentType: string, buffer: Buffer): ProductImageContentType {
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  if (!PRODUCT_IMAGE_CONTENT_TYPES.includes(normalized as ProductImageContentType)) {
    throw new Error(
      `Image content type must be one of ${PRODUCT_IMAGE_CONTENT_TYPES.join(', ')}, got ${normalized || 'unknown'}. SVG is not allowed.`,
    );
  }

  if (buffer.byteLength === 0) {
    throw new Error('Image data is empty.');
  }
  if (buffer.byteLength > PRODUCT_IMAGE_MAX_BYTES) {
    const sizeMb = (buffer.byteLength / (1024 * 1024)).toFixed(1);
    throw new Error(`Image must be 4MB or smaller, got ${sizeMb}MB.`);
  }

  const validated = normalized as ProductImageContentType;
  if (!magicBytesMatch(validated, buffer)) {
    throw new Error(`Image data does not look like ${validated}. The bytes must match the declared content type.`);
  }

  return validated;
}

function magicBytesMatch(contentType: ProductImageContentType, buffer: Buffer): boolean {
  if (contentType === 'image/png') {
    return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (contentType === 'image/jpeg') {
    return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
  }
  // image/webp: RIFF....WEBP
  return (
    startsWithBytes(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    buffer.length >= 12 &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

function requireProductImageDatabase(): void {
  if (!isStoreDatabaseEnabled()) {
    throw new Error('DATABASE_URL is required for product image uploads.');
  }
}
