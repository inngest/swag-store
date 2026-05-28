import type { Product } from './catalog';

export type CheckoutCartItem = {
  productId: string;
  variantId: string;
  quantity: number;
  size?: string;
  color?: string;
};

export type NormalizedCheckoutItem = {
  product: Product;
  variant: Product['variants'][number];
  quantity: number;
};

export function normalizeCheckoutItems(
  items: CheckoutCartItem[],
  products: Product[],
): NormalizedCheckoutItem[] {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('cart is empty');
  }

  return items.map((item) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      throw new Error('Invalid cart quantity.');
    }

    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product) throw new Error(`Product not found: ${item.productId}`);

    const variant = product.variants.find((candidate) => candidate.id === item.variantId);
    if (!variant) throw new Error(`Product variant not found: ${item.variantId}`);
    if (variant.stock < item.quantity) {
      throw new Error(`${product.name} has only ${variant.stock} left in stock.`);
    }

    return { product, variant, quantity: item.quantity };
  });
}

export function getCheckoutSubtotalCents(items: NormalizedCheckoutItem[]): number {
  return items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
}
