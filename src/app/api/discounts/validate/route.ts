import { NextRequest, NextResponse } from 'next/server';
import { getCheckoutSubtotalCents, normalizeCheckoutItems, type CheckoutCartItem } from '@/lib/checkout';
import { listPublicProducts, validateDiscountCode } from '@/lib/store-db';

export async function POST(req: NextRequest) {
  try {
    const { code, items } = (await req.json()) as {
      code?: string;
      items?: CheckoutCartItem[];
    };

    if (!code?.trim()) {
      return NextResponse.json({ error: 'Enter a discount code.' }, { status: 400 });
    }

    const products = await listPublicProducts();
    const normalizedItems = normalizeCheckoutItems(items ?? [], products);
    const subtotalCents = getCheckoutSubtotalCents(normalizedItems);
    const discount = await validateDiscountCode({ code, subtotalCents });

    return NextResponse.json({
      discount,
      subtotalCents,
      totalAfterDiscountCents: Math.max(0, subtotalCents - discount.discountCents),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discount validation failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
