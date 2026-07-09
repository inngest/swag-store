// ─── Inngest Swag Store — Seed Catalog ─────────────────────────────────────
// This fallback catalog seeds the database and keeps local read-only mode useful.
// Admin edits are stored in Postgres when DATABASE_URL is configured.

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

export const RETIRED_SEED_PRODUCT_IDS = [
  'prod-durable-workflow-hoodie',
  'prod-moss-ops-cap',
  'prod_step-run-socks',
  'prod-workflow-sticker-pack',
];

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
// Seed inventory for demo and local workflows. Event-only stock is intentionally
// excluded from the orderable catalog.
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
    image: '/products/anti-anti-infra-shirt.png',
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
    tags: ['office-stock', 'customer-gifts'],
  },
  {
    id: 'prod_anti-anti-infra-hoodie',
    slug: 'anti-anti-infra-hoodie',
    name: 'Anti Anti Infra Co. Hoodie',
    type: 'Hoodie',
    sku: 'INN-AAI-HOODIE',
    tagline: 'Office stock for customers, community, and prospects.',
    blurb: 'Anti Anti Infra Co. hoodie. Live inventory is backed by Railway Postgres and decremented by Inngest.',
    description:
      'The Anti Anti Infra Co. hoodie from the office swag shelf. Available sizes are synced from the current Swag Inventory page and reserved by the fulfillment workflow when an order is placed.',
    fabric: 'Cotton poly fleece',
    fit: 'Relaxed unisex fit',
    cornerTag: '02 / HOOD',
    cover: 'citrus',
    price: 6400,
    category: 'apparel',
    image: '/products/anti-anti-infra-hoodie.png',
    imagePlaceholder: 'linear-gradient(135deg, #FB6142 0%, #FF9883 58%, #1A161C 100%)',
    colors: [
      { name: 'black', hex: '#1A161C', label: 'Black' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    variants: [
      { id: 'var_aai-hoodie-black-s', size: 'S', color: 'black', stock: 8 },
      { id: 'var_aai-hoodie-black-m', size: 'M', color: 'black', stock: 14 },
      { id: 'var_aai-hoodie-black-l', size: 'L', color: 'black', stock: 16 },
      { id: 'var_aai-hoodie-black-xl', size: 'XL', color: 'black', stock: 11 },
      { id: 'var_aai-hoodie-black-xxl', size: 'XXL', color: 'black', stock: 5 },
    ],
    featured: true,
    tags: ['office-stock', 'customer-gifts'],
  },
  {
    id: 'prod_black-step-run-socks',
    slug: 'black-step-run-socks',
    name: 'Black Step.run Socks',
    type: 'Socks',
    sku: 'INN-STEP-SOCKS-BLK',
    tagline: 'Step.run, but make it wearable.',
    blurb: 'Black Step.run socks from the latest Riley order.',
    description:
      'Black Step.run socks for customers, community, and prospects. The latest Riley order added one pair, and Inngest reserves it automatically during fulfillment.',
    fabric: 'Cotton blend knit',
    fit: 'One size',
    cornerTag: '03 / SOCK',
    cover: 'citrus',
    price: 1200,
    category: 'accessories',
    image: '/products/black-step-run-socks.png',
    imagePlaceholder: 'linear-gradient(135deg, #FF7300 0%, #362C40 60%, #1A161C 100%)',
    colors: [
      { name: 'black', hex: '#171519', label: 'Black Step.run' },
    ],
    variants: [
      { id: 'var_black-step-socks-one', color: 'black', stock: 1 },
    ],
    featured: true,
    tags: ['office-stock', 'developer-gifts'],
  },
  {
    id: 'prod_cream-step-run-socks',
    slug: 'cream-step-run-socks',
    name: 'Cream Step.run Socks',
    type: 'Socks',
    sku: 'INN-STEP-SOCKS-CRM',
    tagline: 'Step.run, but make it wearable.',
    blurb: 'Cream Step.run socks from the latest Riley order.',
    description:
      'Cream Step.run socks for customers, community, and prospects. The latest Riley order added one pair, and Inngest reserves it automatically during fulfillment.',
    fabric: 'Cotton blend knit',
    fit: 'One size',
    cornerTag: '04 / SOCK',
    cover: 'citrus',
    price: 1200,
    category: 'accessories',
    image: '/products/cream-step-run-socks.png',
    imagePlaceholder: 'linear-gradient(135deg, #FF7300 0%, #362C40 60%, #1A161C 100%)',
    colors: [
      { name: 'cream', hex: '#F5F0E8', label: 'Cream Step.run' },
    ],
    variants: [
      { id: 'var_cream-step-socks-one', color: 'cream', stock: 1 },
    ],
    featured: true,
    tags: ['office-stock', 'developer-gifts'],
  },
  {
    id: 'prod_insulated_coffee_mug_12oz',
    slug: 'insulated-coffee-mug-12oz',
    name: 'Insulated Coffee Mug 12 oz',
    type: 'Mug',
    sku: 'INN-MUG-12OZ',
    tagline: 'Small-batch drinkware for the swag store and AIEWF events.',
    blurb: "Black 12 oz insulated coffee mug from Riley's latest swag order.",
    description:
      'A black 12 oz insulated coffee mug with the Inngest mark. Riley ordered 13 for the swag store and AIEWF events.',
    fabric: 'Powder-coated stainless steel',
    fit: '12 oz with clear lid',
    cornerTag: '05 / MUG',
    cover: 'light',
    price: 1800,
    category: 'accessories',
    image: '/products/insulated-coffee-mug-12oz.png',
    imagePlaceholder: 'linear-gradient(135deg, #F5F0E8 0%, #1A161C 100%)',
    colors: [
      { name: 'black', hex: '#1A161C', label: 'Black' },
    ],
    variants: [
      { id: 'var_insulated-mug-12oz-black-one', color: 'black', stock: 13 },
    ],
    featured: true,
    tags: ['office-stock', 'aiewf-events', 'drinkware'],
  },
  {
    id: 'prod_baseball_cap',
    slug: 'baseball-cap',
    name: 'Baseball Cap',
    type: 'Hat',
    sku: 'INN-BBALL-CAP',
    tagline: 'Small-batch headwear for the swag store and AIEWF events.',
    blurb: "Black Inngest baseball cap from Riley's latest swag order.",
    description:
      'A black baseball cap with the Inngest mark. Riley ordered 15 for the swag store and AIEWF events.',
    fabric: 'Cotton twill',
    fit: 'Adjustable strap',
    cornerTag: '06 / CAP',
    cover: 'light',
    price: 2400,
    category: 'accessories',
    image: '/products/baseball-cap.png',
    imagePlaceholder: 'linear-gradient(135deg, #F5F0E8 0%, #1A161C 100%)',
    colors: [
      { name: 'black', hex: '#1A161C', label: 'Black' },
    ],
    variants: [
      { id: 'var_baseball-cap-black-one', color: 'black', stock: 15 },
    ],
    featured: true,
    tags: ['office-stock', 'aiewf-events', 'headwear'],
  },
];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Editorial corner tag derived from catalog display position (01, 02, …)
// instead of the stored tag, so numbering stays sequential as products change.
export function catalogCornerTag(product: Product, index: number): string {
  const suffix = product.cornerTag.includes('/')
    ? product.cornerTag.split('/').slice(1).join('/').trim()
    : product.cornerTag.trim();
  return `${String(index + 1).padStart(2, '0')} / ${suffix || product.type.toUpperCase()}`;
}

export function getVariant(product: Product, size?: string, color?: string): ProductVariant | undefined {
  return product.variants.find(
    (v) => (!size || v.size === size) && (!color || v.color === color)
  );
}
