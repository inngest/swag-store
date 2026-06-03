// ─── Inngest Swag Store — Static Catalog ───────────────────────────────────
// This is the single source of truth for all products.
// In production, this would come from a CMS or database.
// For the livestream, it's intentionally a flat JSON stub.

export type ProductSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL';
export const PRODUCT_SIZE_ORDER: ProductSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
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
// Seeded from the Notion "Swag Inventory" page on 2026-05-28.
// The Notion page also has event inventory marked "do not touch"; that stock is
// intentionally excluded from the orderable catalog.
export const PRODUCTS: Product[] = [
  {
    id: 'prod_anti-anti-infra-tee',
    slug: 'anti-anti-infra-tee',
    name: 'Anti Anti Infra Co.',
    type: 'T-Shirt',
    sku: 'INN-AAI-TEE',
    tagline: 'Office stock for customers, community, and prospects.',
    blurb: 'Anti Anti Infra Co. tee. Live inventory is backed by Railway Postgres and decremented by Inngest.',
    description:
      'The Anti Anti Infra Co. T-shirt from the office swag shelf. Available sizes are synced from the current Swag Inventory page and reserved by the fulfillment workflow when an order is placed.',
    fabric: 'Cotton jersey',
    fit: 'Unisex, true to size',
    cornerTag: '01 / TEE',
    cover: 'dark',
    price: 2800,
    category: 'apparel',
    image: '/products/shirt-grey.png',
    imagePlaceholder: 'linear-gradient(135deg, #B8B5AE 0%, #6B6862 100%)',
    colors: [
      { name: 'grey', hex: '#B8B5AE', label: 'Heather Grey' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    variants: [
      { id: 'var_aai-tee-grey-s', size: 'S', color: 'grey', stock: 20 },
      { id: 'var_aai-tee-grey-m', size: 'M', color: 'grey', stock: 24 },
      { id: 'var_aai-tee-grey-l', size: 'L', color: 'grey', stock: 21 },
      { id: 'var_aai-tee-grey-xl', size: 'XL', color: 'grey', stock: 23 },
      { id: 'var_aai-tee-grey-xxl', size: 'XXL', color: 'grey', stock: 11 },
      { id: 'var_aai-tee-grey-xxxl', size: 'XXXL', color: 'grey', stock: 7 },
    ],
    featured: true,
    tags: ['office-stock', 'notion-seeded'],
  },
  {
    id: 'prod_step-run-socks',
    slug: 'step-run-socks',
    name: 'Step.run Socks',
    type: 'Socks',
    sku: 'INN-STEP-SOCKS',
    tagline: 'Step.run, but make it wearable.',
    blurb: 'One-size Step.run socks from the office inventory shelf.',
    description:
      'Step.run socks for customers, community, and prospects. This stock count comes from the current Swag Inventory page and is reserved through the same Railway-backed fulfillment flow.',
    fabric: 'Cotton blend knit',
    fit: 'One size',
    cornerTag: '02 / SOCK',
    cover: 'citrus',
    price: 1200,
    category: 'accessories',
    image: '/products/stickers-cream.png',
    imagePlaceholder: 'linear-gradient(135deg, #FF7300 0%, #362C40 60%, #1A161C 100%)',
    colors: [
      { name: 'citrus', hex: '#FF7300', label: 'Citrus Glow' },
    ],
    variants: [
      { id: 'var_step-socks-one', color: 'citrus', stock: 58 },
    ],
    featured: true,
    tags: ['office-stock', 'notion-seeded'],
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
