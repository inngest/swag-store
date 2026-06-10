import {
  PRODUCT_SIZE_ORDER,
  type Product,
  type ProductColor,
  type ProductSize,
  type ProductVariant,
} from './catalog';

export type ProductUpsertInput = {
  id?: string;
  slug?: string;
  name: string;
  type: string;
  sku: string;
  tagline?: string;
  blurb?: string;
  description?: string;
  fabric?: string;
  fit?: string;
  cornerTag?: string;
  cover: Product['cover'];
  priceDollars: string;
  category: Product['category'];
  image?: string;
  imageSourceUrl?: string;
  imageBase64?: string;
  imageContentType?: string;
  imagePlaceholder?: string;
  colors?: Array<{ name: string; hex?: string; label?: string }>;
  sizes?: Array<ProductSize | string>;
  variants?: Array<{ id?: string; size?: ProductSize | string; color?: string; stock: number }>;
  tags?: string[];
  colorsText?: string;
  sizesText?: string;
  variantsText?: string;
  featured?: boolean;
  tagsText?: string;
};

export const productUpsertInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'type', 'sku', 'cover', 'priceDollars', 'category'],
  properties: {
    id: {
      type: 'string',
      description: 'Stable product id. If omitted, generated from name as prod_<slug>.',
    },
    slug: {
      type: 'string',
      description: 'Public URL slug. If omitted, generated from name.',
    },
    name: { type: 'string', description: 'Product display name.' },
    type: { type: 'string', description: 'Human category label, e.g. T-Shirt, Hoodie, Socks.' },
    sku: { type: 'string', description: 'Public product SKU, e.g. INN-AAI-TEE.' },
    tagline: { type: 'string' },
    blurb: { type: 'string', description: 'Short product-card description.' },
    description: { type: 'string', description: 'Long product detail copy.' },
    fabric: { type: 'string' },
    fit: { type: 'string' },
    cornerTag: { type: 'string', description: 'Small editorial product tag, e.g. 01 / TEE.' },
    cover: { type: 'string', enum: ['light', 'dark', 'citrus'] },
    priceDollars: {
      type: 'string',
      description: 'Dollar price as a string, e.g. "28" or "28.00". Stored as cents.',
    },
    category: { type: 'string', enum: ['apparel', 'accessories'] },
    image: {
      type: 'string',
      description: 'Local path like /products/shirt.png or an https image URL.',
    },
    imageSourceUrl: {
      type: 'string',
      description:
        'Optional https URL of a product image for the server to fetch and store. Must resolve to image/png, image/jpeg, or image/webp at 4MB or smaller (SVG is rejected). When provided, the stored copy is served from /api/product-images/<id> and overrides image. Provide imageSourceUrl or imageBase64, not both.',
    },
    imageBase64: {
      type: 'string',
      description:
        'Optional base64-encoded image bytes to upload inline. Requires imageContentType. Same validation as imageSourceUrl: png/jpeg/webp only, 4MB max, bytes must match the declared type. When provided, the stored copy is served from /api/product-images/<id> and overrides image.',
    },
    imageContentType: {
      type: 'string',
      enum: ['image/png', 'image/jpeg', 'image/webp'],
      description: 'Content type of imageBase64. Required when imageBase64 is provided.',
    },
    imagePlaceholder: {
      type: 'string',
      description: 'CSS background fallback, usually a linear-gradient(...).',
    },
    colorsText: {
      type: 'string',
      description: 'Optional legacy newline-separated CSV: colorName,hex,label. Example: grey,#B8B5AE,Heather Grey',
    },
    colors: {
      type: 'array',
      description: 'Preferred structured color input. Use this instead of colorsText when available.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Machine color name, e.g. grey.' },
          hex: { type: 'string', description: 'Optional hex value. Defaults to #F2F2F2.' },
          label: { type: 'string', description: 'Optional shopper-facing label. Defaults to name.' },
        },
      },
    },
    sizesText: {
      type: 'string',
      description: 'Optional legacy comma-separated sizes. Valid order is XS,S,M,L,XL,XXL,XXXL.',
    },
    sizes: {
      type: 'array',
      description: 'Preferred structured size input. Valid sizes are XS, S, M, L, XL, XXL, XXXL.',
      items: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] },
    },
    variantsText: {
      type: 'string',
      description:
        'Legacy newline-separated CSV variants. Preferred format: variant_id,size,color,stock. For one-size items leave size blank, e.g. var_socks_one,,citrus,58. Provide variants or variantsText.',
    },
    variants: {
      type: 'array',
      minItems: 1,
      description:
        'Preferred structured variant input. Provide at least one variant. IDs may be omitted and will be generated from product id, size, and color.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['stock'],
        properties: {
          id: { type: 'string', description: 'Optional stable variant id.' },
          size: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] },
          color: { type: 'string' },
          stock: { type: 'integer', minimum: 0 },
        },
      },
    },
    featured: { type: 'boolean' },
    tags: {
      type: 'array',
      description: 'Preferred structured tags input. Use this instead of tagsText when available.',
      items: { type: 'string' },
    },
    tagsText: {
      type: 'string',
      description: 'Optional legacy comma-separated tags, e.g. office-stock, launch.',
    },
  },
} as const;

export function normalizeProductInput(input: ProductUpsertInput): Product {
  const name = input.name.trim();
  const sku = input.sku.trim().toUpperCase();
  if (!name) throw new Error('Product name is required.');
  if (!sku) throw new Error('Product SKU is required.');

  const slug = slugify(input.slug || name);
  const id = slugify(input.id || `prod_${slug}`, '_');
  const priceDollars = Number(input.priceDollars);
  if (!Number.isFinite(priceDollars) || priceDollars < 0) {
    throw new Error('Price must be a positive dollar amount.');
  }

  const variants = input.variants?.length
    ? parseStructuredVariants(input.variants, id)
    : parseVariants(input.variantsText ?? '', id);
  if (variants.length === 0) throw new Error('Add at least one product variant.');

  const variantSizes = variants
    .map((variant) => variant.size)
    .filter((size): size is ProductSize => Boolean(size));
  const explicitSizes = input.sizes?.length ? parseStructuredSizes(input.sizes) : parseSizes(input.sizesText);
  const sizes = sortSizes(explicitSizes.length ? explicitSizes : Array.from(new Set(variantSizes)));

  return {
    id,
    slug,
    name,
    type: input.type.trim() || 'Swag',
    sku,
    tagline: input.tagline?.trim() ?? '',
    blurb: input.blurb?.trim() ?? '',
    description: input.description?.trim() ?? '',
    fabric: input.fabric?.trim() ?? '',
    fit: input.fit?.trim() ?? '',
    cornerTag: input.cornerTag?.trim() || 'SWAG',
    cover: input.cover === 'dark' || input.cover === 'citrus' ? input.cover : 'light',
    price: Math.round(priceDollars * 100),
    category: input.category === 'accessories' ? 'accessories' : 'apparel',
    image: input.image?.trim() ?? '',
    imagePlaceholder: input.imagePlaceholder?.trim() || 'linear-gradient(135deg, #F2F2F2 0%, #B8B5AE 100%)',
    colors: input.colors?.length ? parseStructuredColors(input.colors) : parseColors(input.colorsText),
    sizes: sizes.length ? sizes : undefined,
    variants,
    featured: Boolean(input.featured),
    tags: input.tags?.length ? cleanStringList(input.tags) : parseCsv(input.tagsText),
  };
}

function parseVariants(text: string, productId: string): ProductVariant[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(',').map((part) => part.trim());
      const [idOrSize, sizeOrColor, colorOrStock, maybeStock] = parts;
      const hasExplicitId = parts.length >= 4;
      const id = hasExplicitId ? idOrSize : '';
      const rawSize = hasExplicitId ? sizeOrColor : idOrSize;
      const color = hasExplicitId ? colorOrStock : sizeOrColor;
      const rawStock = hasExplicitId ? maybeStock : colorOrStock;
      const size = parseSize(rawSize);
      const stock = Number.parseInt(String(rawStock ?? '').replace(/,/g, ''), 10);

      if (!Number.isFinite(stock) || stock < 0) {
        throw new Error(`Variant line ${index + 1} needs a non-negative stock count.`);
      }

      return {
        id: id || `${productId}-${slugify(size || 'one', '-')}-${slugify(color || 'default', '-')}`,
        size: size || undefined,
        color: color || undefined,
        stock,
      };
    });
}

function parseStructuredVariants(
  variants: NonNullable<ProductUpsertInput['variants']>,
  productId: string,
): ProductVariant[] {
  return variants.map((variant, index) => {
    const size = parseOptionalStructuredSize(variant.size, `Variant ${index + 1}`);
    const color = variant.color?.trim() || undefined;
    const stock = Number(variant.stock);

    if (!Number.isSafeInteger(stock) || stock < 0) {
      throw new Error(`Variant ${index + 1} needs a non-negative integer stock count.`);
    }

    return {
      id: variant.id?.trim() || `${productId}-${slugify(size || 'one', '-')}-${slugify(color || 'default', '-')}`,
      size: size || undefined,
      color,
      stock,
    };
  });
}

function parseColors(text: string | undefined): ProductColor[] | undefined {
  const colors = (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, hex, label] = line.split(',').map((part) => part.trim());
      return { name, hex: hex || '#F2F2F2', label: label || name };
    })
    .filter((color) => color.name);

  return colors.length ? colors : undefined;
}

function parseStructuredColors(colors: NonNullable<ProductUpsertInput['colors']>): ProductColor[] | undefined {
  const parsed = colors
    .map((color) => {
      const name = color.name.trim();
      return {
        name,
        hex: color.hex?.trim() || '#F2F2F2',
        label: color.label?.trim() || name,
      };
    })
    .filter((color) => color.name);

  return parsed.length ? parsed : undefined;
}

function parseSizes(text: string | undefined): ProductSize[] {
  return Array.from(new Set(parseCsv(text).map(parseSize).filter((size): size is ProductSize => Boolean(size))));
}

function parseStructuredSizes(values: NonNullable<ProductUpsertInput['sizes']>): ProductSize[] {
  return Array.from(new Set(values.map((value, index) => parseRequiredStructuredSize(value, `Size ${index + 1}`))));
}

function parseCsv(text: string | undefined): string[] {
  return (text ?? '')
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanStringList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function parseSize(value: string | undefined): ProductSize | '' {
  const upper = String(value ?? '').trim().toUpperCase();
  return PRODUCT_SIZE_ORDER.includes(upper as ProductSize) ? (upper as ProductSize) : '';
}

function parseRequiredStructuredSize(value: string | undefined, label: string): ProductSize {
  const size = parseSize(value);
  if (!size) throw new Error(`${label} must be one of ${PRODUCT_SIZE_ORDER.join(', ')}.`);
  return size;
}

function parseOptionalStructuredSize(value: string | undefined, label: string): ProductSize | '' {
  if (!String(value ?? '').trim()) return '';
  return parseRequiredStructuredSize(value, label);
}

function sortSizes(sizes: ProductSize[]): ProductSize[] {
  return [...sizes].sort((a, b) => PRODUCT_SIZE_ORDER.indexOf(a) - PRODUCT_SIZE_ORDER.indexOf(b));
}

function slugify(value: string, separator = '-'): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`${escapeRegExp(separator)}+`, 'g'), separator)
    .replace(new RegExp(`^${escapeRegExp(separator)}|${escapeRegExp(separator)}$`, 'g'), '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
