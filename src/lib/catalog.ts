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
  tagline: string;
  description: string;
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
    tagline: 'The T-shirt that never drops a step.',
    description:
      '100% heavyweight ring-spun cotton. DURABLY YOURS printed in Citrus Glow on heather grey. The shirt you wear when you give a talk about why other queues are bad.',
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
    tagline: 'Citrus Glow on Quantum. Retry-proof warmth.',
    description:
      'Premium 80/20 cotton-poly fleece. INNGEST wordmark across the chest in Citrus Glow. The hoodie that survives long-running processes and cold server rooms alike.',
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
    tagline: '8 stickers. 0 dropped steps.',
    description:
      'Eight die-cut vinyl stickers. step.run(), step.waitForEvent(), step.sleep(), and more. UV-resistant, laptop-safe, dishwasher-proof. Because your code should be too.',
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
    tagline: 'Eon Moss. Embroidered mark.',
    description:
      'Six-panel structured cap, Eon Moss colorway. Embroidered Inngest mark on the front, low-profile fit. The hat for the engineer who keeps the build green.',
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
