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
    tags: ['office-stock', 'customer-gifts'],
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
    tags: ['office-stock', 'developer-gifts'],
  },
  {
    id: 'prod-durable-workflow-hoodie',
    slug: 'durable-workflow-hoodie',
    name: 'Durable Workflow Hoodie',
    type: 'Hoodie',
    sku: 'INN-DUR-HOODIE',
    tagline: 'Warm layer for cold deploy windows.',
    blurb: 'Heavyweight citrus hoodie for teams who like their jobs restart-safe.',
    description:
      'A soft fleece hoodie for customers, community, and demo guests. The variants mirror the office-ready stock that admins can adjust from the dashboard.',
    fabric: 'Cotton poly fleece',
    fit: 'Relaxed unisex fit',
    cornerTag: '03 / HOOD',
    cover: 'citrus',
    price: 6400,
    category: 'apparel',
    image: '/products/hoodie-orange.png',
    imagePlaceholder: 'linear-gradient(135deg, #FB6142 0%, #FF9883 58%, #1A161C 100%)',
    colors: [
      { name: 'citrus', hex: '#FB6142', label: 'Citrus' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    variants: [
      { id: 'var_durable-hoodie-citrus-s', size: 'S', color: 'citrus', stock: 8 },
      { id: 'var_durable-hoodie-citrus-m', size: 'M', color: 'citrus', stock: 14 },
      { id: 'var_durable-hoodie-citrus-l', size: 'L', color: 'citrus', stock: 16 },
      { id: 'var_durable-hoodie-citrus-xl', size: 'XL', color: 'citrus', stock: 11 },
      { id: 'var_durable-hoodie-citrus-xxl', size: 'XXL', color: 'citrus', stock: 5 },
    ],
    featured: true,
    tags: ['office-stock', 'launch-demo'],
  },
  {
    id: 'prod-moss-ops-cap',
    slug: 'moss-ops-cap',
    name: 'Moss Ops Cap',
    type: 'Hat',
    sku: 'INN-MOSS-CAP',
    tagline: 'Low-profile field gear for workflow operators.',
    blurb: 'Embroidered moss cap with one-size inventory for quick customer sends.',
    description:
      'A low-profile cap for field events, customer visits, and community packs. Kept as a one-size variant so admins can test accessory inventory edits quickly.',
    fabric: 'Brushed cotton twill',
    fit: 'Adjustable strap',
    cornerTag: '04 / CAP',
    cover: 'light',
    price: 2400,
    category: 'accessories',
    image: '/products/hat-moss.png',
    imagePlaceholder: 'linear-gradient(135deg, #EEECE6 0%, #00A67B 100%)',
    colors: [
      { name: 'moss', hex: '#00A67B', label: 'Moss' },
    ],
    variants: [
      { id: 'var_moss-cap-one', color: 'moss', stock: 42 },
    ],
    featured: true,
    tags: ['office-stock', 'events'],
  },
  {
    id: 'prod-workflow-sticker-pack',
    slug: 'workflow-sticker-pack',
    name: 'Workflow Sticker Pack',
    type: 'Sticker Pack',
    sku: 'INN-WF-STICKERS',
    tagline: 'Small batch proof that every laptop can run durable functions.',
    blurb: 'Cream sticker pack for event tables, thank-you notes, and new customer kits.',
    description:
      'A pack of workflow-themed stickers used for event tables and customer thank-you kits. This gives admins a high-stock accessory row for import testing.',
    fabric: 'Matte vinyl',
    fit: 'One pack',
    cornerTag: '05 / STK',
    cover: 'light',
    price: 800,
    category: 'accessories',
    image: '/products/stickers-cream.png',
    imagePlaceholder: 'linear-gradient(135deg, #F5F0E8 0%, #CBB26A 100%)',
    colors: [
      { name: 'cream', hex: '#F5F0E8', label: 'Cream' },
    ],
    variants: [
      { id: 'var_workflow-stickers-one', color: 'cream', stock: 120 },
    ],
    featured: false,
    tags: ['office-stock', 'event-table'],
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
