import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';
import { requireApiActor } from '@/lib/api-auth';
import { APP_ORIGIN } from '@/lib/app-origin';
import { listAutomationProducts } from '@/lib/order-automation';
import { resolveProductImageInput } from '@/lib/product-images';
import {
  normalizeProductInput,
  productUpsertInputSchema,
  type ProductUpsertInput,
} from '@/lib/product-management';
import { upsertAdminProduct } from '@/lib/store-db';

const productApiSpec = {
  endpoints: {
    listProducts: {
      method: 'GET',
      path: '/api/ai/products',
      auth: 'Bearer token from /admin API Tokens or SWAG_STORE_API_TOKEN',
      description: 'Lists current product and variant IDs for ordering agents.',
    },
    upsertProduct: {
      method: 'POST',
      path: '/api/ai/products',
      auth: 'Bearer token from /admin API Tokens or SWAG_STORE_API_TOKEN',
      description:
        'Creates or updates one product, including images, price, copy, colors, sizes, and variants. Image options: pass image as a /products/*.png path or https URL, pass imageSourceUrl as an https URL for the server to fetch and store, or pass imageBase64 + imageContentType for an inline upload. Stored uploads are served from /api/product-images/<id> and set product.image automatically.',
      inputSchema: productUpsertInputSchema,
    },
  },
};

export async function GET(req: NextRequest) {
  try {
    await requireApiActor(req);
    return NextResponse.json({ products: await listAutomationProducts(), apiSpec: productApiSpec });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireApiActor(req);
    const input = (await req.json()) as ProductUpsertInput;
    const product = normalizeProductInput(input);
    const uploadedImageUrl = await resolveProductImageInput({
      productId: product.id,
      actorEmail: actor.email,
      input,
    });
    if (uploadedImageUrl) product.image = uploadedImageUrl;
    await upsertAdminProduct(product);
    await inngest.send({
      id: `inventory-changed-api-product-${product.id}-${Date.now()}`,
      name: 'store/inventory.changed',
      data: {
        appOrigin: APP_ORIGIN,
        source: 'api-product-upsert',
        reason: 'API created or updated product inventory',
        actorEmail: actor.email,
        productId: product.id,
        variantIds: product.variants.map((variant) => variant.id),
      },
    });
    return NextResponse.json({ product, apiSpec: productApiSpec.endpoints.upsertProduct });
  } catch (err) {
    return apiError(err);
  }
}

function apiError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Request failed';
  const status = message.includes('API token') || message.includes('SWAG_STORE_API_TOKEN')
    ? 401
    : message.includes('DATABASE_URL')
      ? 503
      : message.includes('required') || message.includes('Variant line') || message.includes('Price must') || message.includes('Image') || message.includes('image')
        ? 400
        : 500;
  return NextResponse.json({ error: message }, { status });
}
