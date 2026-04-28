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
    description: 'Reserve SKUs and update stock levels',
    status: 'pending',
  },
  {
    id: 'fulfillment-submit',
    name: 'step.run("submit-to-fulfillment")',
    description: 'Send order to fulfillment provider API',
    status: 'pending',
  },
  {
    id: 'shipping-label',
    name: 'step.run("generate-shipping-label")',
    description: 'Generate and store shipping label',
    status: 'pending',
  },
  {
    id: 'confirmation-email',
    name: 'step.run("send-confirmation")',
    description: 'Send confirmation email with tracking',
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
      '100% heavyweight ring-spun cotton. DURABLY YOURS printed in Citrus Glow on Quantum black. The shirt you wear when you give a talk about why other queues are bad.',
    price: 3500,
    category: 'apparel',
    image: '/images/tee-durably-yours.jpg',
    imagePlaceholder: 'linear-gradient(135deg, #362C40 0%, #1A161C 100%)',
    colors: [
      { name: 'quantum', hex: '#1A161C', label: 'Quantum Black' },
      { name: 'citrine', hex: '#EFE9D6', label: 'Citrine Cream' },
    ],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    variants: [
      { id: 'var_tee-quantum-s', size: 'S', color: 'quantum', stock: 12 },
      { id: 'var_tee-quantum-m', size: 'M', color: 'quantum', stock: 24 },
      { id: 'var_tee-quantum-l', size: 'L', color: 'quantum', stock: 18 },
      { id: 'var_tee-quantum-xl', size: 'XL', color: 'quantum', stock: 10 },
      { id: 'var_tee-citrine-s', size: 'S', color: 'citrine', stock: 8 },
      { id: 'var_tee-citrine-m', size: 'M', color: 'citrine', stock: 15 },
      { id: 'var_tee-citrine-l', size: 'L', color: 'citrine', stock: 9 },
    ],
    featured: true,
    tags: ['bestseller', 'new'],
  },
  {
    id: 'prod_inngest-hoodie',
    slug: 'inngest-hoodie',
    name: 'Inngest Hoodie',
    tagline: 'Orange on black. Retry-proof warmth.',
    description:
      'Premium 80/20 cotton-poly fleece. INNGEST wordmark across the chest in Citrus Glow. The hoodie that survives long-running processes and cold server rooms alike.',
    price: 6500,
    category: 'apparel',
    image: '/images/hoodie-orange-black.jpg',
    imagePlaceholder: 'linear-gradient(135deg, #FF7300 0%, #362C40 60%, #1A161C 100%)',
    colors: [
      { name: 'quantum', hex: '#1A161C', label: 'Quantum Black' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    variants: [
      { id: 'var_hoodie-s', size: 'S', color: 'quantum', stock: 6 },
      { id: 'var_hoodie-m', size: 'M', color: 'quantum', stock: 14 },
      { id: 'var_hoodie-l', size: 'L', color: 'quantum', stock: 11 },
      { id: 'var_hoodie-xl', size: 'XL', color: 'quantum', stock: 8 },
    ],
    featured: true,
    tags: ['featured'],
  },
  {
    id: 'prod_step-function-sticker-pack',
    slug: 'step-function-sticker-pack',
    name: 'Step Function',
    tagline: '6 stickers. 0 dropped steps.',
    description:
      'Six die-cut vinyl stickers. step.run(), step.waitForEvent(), step.sleep(), and more. UV-resistant, laptop-safe, dishwasher-proof. Because your code should be too.',
    price: 1200,
    category: 'accessories',
    image: '/images/sticker-pack.jpg',
    imagePlaceholder: 'linear-gradient(135deg, #FF7300 0%, #CBB26A 50%, #EFE9D6 100%)',
    variants: [
      { id: 'var_stickers-one', stock: 150 },
    ],
    featured: false,
    tags: ['new', 'popular'],
  },
  {
    id: 'prod_enamel-pin',
    slug: 'enamel-pin',
    name: 'Inngest Pin',
    tagline: 'Hard enamel. Hard guarantees.',
    description:
      'Hard enamel pin, 1.25". Inngest wordmark in Citrus Glow fill on Quantum black base. Rubber clutch back. For the lapel of whoever keeps the build green.',
    price: 1500,
    category: 'accessories',
    image: '/images/enamel-pin.jpg',
    imagePlaceholder: 'linear-gradient(135deg, #CBB26A 0%, #362C40 100%)',
    variants: [
      { id: 'var_pin-one', stock: 75 },
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
