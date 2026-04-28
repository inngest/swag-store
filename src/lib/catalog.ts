// ─── Inngest Swag Store — Static Catalog ───────────────────────────────────
// This is the single source of truth for all products.
// In production, this would come from a CMS or database.
// For the livestream, it's intentionally a flat JSON stub.

export type ProductSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
export type ProductColor = {
  name: string;
  hex: string;
  label: string;
};

export type ProductVariant = {
  id: string;
  size?: ProductSize;
  color?: string;
  stock: number;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  type: string; // e.g., "T-Shirt", "Hoodie"
  sku: string; // public SKU code, e.g., "INN-TEE-01"
  tagline: string;
  blurb: string; // 1-line product card hook
  description: string;
  fabric: string;
  fit: string;
  cornerTag: string; // editorial corner label, e.g., "01 / TEE"
  cover: 'dark' | 'citrus' | 'light';
  price: number; // in cents
  category: 'apparel' | 'accessories';
  image: string;
  imagePlaceholder: string; // CSS gradient fallback
  colors?: ProductColor[];
  sizes?: ProductSize[];
  variants: ProductVariant[];
  featured: boolean;
  tags: string[];
};

export type CartItem = {
  productId: string;
  variantId: string;
  quantity: number;
  size?: string;
  color?: string;
};

// ─── Fulfillment workflow steps (matches Inngest function) ──────────────────
export type FulfillmentStatus = 'pending' | 'running' | 'complete' | 'failed';

export type WorkflowStep = {
  id: string;
  name: string;
  description: string;
  status: FulfillmentStatus;
  completedAt?: string;
  duration?: number; // ms
};

// LIVESTREAM: Three steps. The plugin will scaffold the matching Inngest function.
export const FULFILLMENT_STEPS: WorkflowStep[] = [
  {
    id: 'payment-capture',
    name: 'step.run("capture-payment")',
    description: 'Capture Stripe payment and verify funds',
    status: 'pending',
  },
  {
    id: 'inventory-reserve',
    name: 'step.run("reserve-inventory")',
    description: 'Reserve SKUs and decrement stock',
    status: 'pending',
  },
  {
    id: 'confirmation-email',
    name: 'step.run("send-confirmation")',
    description: 'Send order confirmation email',
    status: 'pending',
  },
];

// ─── Product catalog ────────────────────────────────────────────────────────
export const PRODUCTS: Product[] = [
  {
    id: 'prod_durably-yours-tee',
    slug: 'durably-yours-tee',
    name: 'Durably Yours',
    type: 'T-Shirt',
    sku: 'INN-TEE-01',
    tagline: 'The T-shirt that never drops a step.',
    blurb: 'Heavyweight cotton tee. Front: Inngest mark. Back: workflow diagram printed in Citrus Glow.',
    description:
      'A 6.1 oz combed cotton tee, garment-dyed for that lived-in feel after the first wash. The back print is a real Inngest workflow — not decorative, not invented — captured from a production run on Apr 12. Made in Los Angeles.',
    fabric: '100% combed cotton, 6.1oz',
    fit: 'Boxy, true to size',
    cornerTag: '01 / TEE',
    cover: 'dark',
    price: 2800,
    category: 'apparel',
    image: '/products/shirt-grey.png',
    imagePlaceholder: 'linear-gradient(135deg, #B8B5AE 0%, #6B6862 100%)',
    colors: [
      { name: 'grey', hex: '#B8B5AE', label: 'Heather Grey' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    variants: [
      { id: 'var_tee-grey-xs', size: 'XS', color: 'grey', stock: 8 },
      { id: 'var_tee-grey-s', size: 'S', color: 'grey', stock: 12 },
      { id: 'var_tee-grey-m', size: 'M', color: 'grey', stock: 24 },
      { id: 'var_tee-grey-l', size: 'L', color: 'grey', stock: 18 },
      { id: 'var_tee-grey-xl', size: 'XL', color: 'grey', stock: 10 },
      { id: 'var_tee-grey-xxl', size: 'XXL', color: 'grey', stock: 6 },
    ],
    featured: true,
    tags: ['bestseller', 'new'],
  },
  {
    id: 'prod_inngest-hoodie',
    slug: 'inngest-hoodie',
    name: 'Inngest Hoodie',
    type: 'Hoodie',
    sku: 'INN-HOOD-01',
    tagline: 'Citrus Glow on Quantum. Retry-proof warmth.',
    blurb: 'Heavyweight 14oz fleece. Embroidered mark, screen-printed mono lockup at hem.',
    description:
      'A 14 oz brushed-back fleece hoodie with embroidered chest mark and a mono-spaced step.run() lockup printed along the hem. Heavy enough to feel like outerwear; soft enough to live in. Pre-shrunk.',
    fabric: '80% cotton / 20% poly fleece, 14oz',
    fit: 'Relaxed, size up for oversized',
    cornerTag: '02 / HOOD',
    cover: 'citrus',
    price: 5800,
    category: 'apparel',
    image: '/products/hoodie-orange.png',
    imagePlaceholder: 'linear-gradient(135deg, #FF7300 0%, #362C40 60%, #1A161C 100%)',
    colors: [
      { name: 'citrus', hex: '#FF7300', label: 'Citrus Glow' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    variants: [
      { id: 'var_hoodie-s', size: 'S', color: 'citrus', stock: 6 },
      { id: 'var_hoodie-m', size: 'M', color: 'citrus', stock: 14 },
      { id: 'var_hoodie-l', size: 'L', color: 'citrus', stock: 11 },
      { id: 'var_hoodie-xl', size: 'XL', color: 'citrus', stock: 8 },
      { id: 'var_hoodie-xxl', size: 'XXL', color: 'citrus', stock: 4 },
    ],
    featured: true,
    tags: ['featured'],
  },
  {
    id: 'prod_step-function-sticker-pack',
    slug: 'step-function-sticker-pack',
    name: 'Step Function',
    type: 'Sticker Pack',
    sku: 'INN-STK-01',
    tagline: '8 stickers. 0 dropped steps.',
    blurb: 'Eight die-cut vinyl stickers. Logos, marks, and one easter egg.',
    description:
      'Eight matte-vinyl die-cut stickers, weatherproof and dishwasher-safe. Includes the wordmark, the M-mark in three colorways, two workflow glyphs, a step.run() bumper, and one secret design we will not describe here.',
    fabric: 'Matte vinyl, 3M adhesive',
    fit: '8 stickers, ~3in each',
    cornerTag: '03 / STK',
    cover: 'light',
    price: 1200,
    category: 'accessories',
    image: '/products/stickers-cream.png',
    imagePlaceholder: 'linear-gradient(135deg, #FF7300 0%, #CBB26A 50%, #EEECE6 100%)',
    variants: [
      { id: 'var_stickers-one', stock: 150 },
    ],
    featured: false,
    tags: ['new', 'popular'],
  },
  {
    id: 'prod_inngest-hat',
    slug: 'inngest-hat',
    name: 'Inngest Hat',
    type: 'Hat',
    sku: 'INN-HAT-01',
    tagline: 'Eon Moss. Embroidered mark.',
    blurb: 'Six-panel structured cap. Embroidered mark, low-profile fit.',
    description:
      'Six-panel structured cap in Eon Moss. Embroidered Inngest mark on the front panel, brass slide-buckle adjustable strap, low-profile crown. The hat for the engineer who keeps the build green.',
    fabric: '100% washed cotton twill',
    fit: 'One size, adjustable',
    cornerTag: '04 / HAT',
    cover: 'light',
    price: 2400,
    category: 'accessories',
    image: '/products/hat-moss.png',
    imagePlaceholder: 'linear-gradient(135deg, #006250 0%, #1A161C 100%)',
    colors: [
      { name: 'eon-moss', hex: '#006250', label: 'Eon Moss' },
    ],
    variants: [
      { id: 'var_hat-one', color: 'eon-moss', stock: 60 },
    ],
    featured: false,
    tags: ['limited'],
  },
];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function getVariant(product: Product, size?: string, color?: string): ProductVariant | undefined {
  return product.variants.find(
    (v) => (!size || v.size === size) && (!color || v.color === color)
  );
}
