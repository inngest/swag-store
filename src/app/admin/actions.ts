'use server';

import { getSubscriptionToken } from 'inngest/realtime';
import { inngest } from '@/inngest/client';
import { adminChannel } from '@/inngest/channels';
import { requireAdmin } from '@/lib/admin-auth';
import { runSwagCodeAgent, type SwagCodeAgentKind } from '@/lib/discount-code-agent';
import { saveProductImage } from '@/lib/product-images';
import { normalizeProductInput, type ProductUpsertInput } from '@/lib/product-management';
import {
  applyInventoryAdjustment,
  generateApiToken,
  generateSingleUseDiscountCodes,
  isOrderStatus,
  isStoreDatabaseEnabled,
  listAdminApiTokens,
  listAdminDiscountCodes,
  listAdminInventory,
  listAdminOrders,
  listAdminProducts,
  listInventoryImportRuns,
  revokeApiToken,
  updateDiscountCodeActive,
  updateInventoryVariant,
  updateApiToken,
  upsertAdminProduct,
  upsertDiscountCode,
  type DiscountCodeType,
  type OrderStatus,
} from '@/lib/store-db';

export async function fetchAdminSubscriptionToken() {
  await requireAdmin();
  const token = await getSubscriptionToken(inngest, {
    channel: adminChannel,
    topics: ['order', 'import'],
  });

  return {
    channel: adminChannel.name as string,
    topics: ['order', 'import'] as const,
    key: token.key,
    apiBaseUrl: token.apiBaseUrl,
  };
}

export async function fetchAdminDashboardAction() {
  await requireAdmin();
  const [inventory, orders, imports, discounts, apiTokens, products] = await Promise.all([
    listAdminInventory(),
    listAdminOrders(),
    listInventoryImportRuns(),
    listAdminDiscountCodes(),
    listAdminApiTokens(),
    listAdminProducts(),
  ]);
  return { inventory, orders, imports, discounts, apiTokens, products };
}

export async function updateInventoryAction(input: {
  variantId: string;
  stock: number;
  image?: string;
}) {
  const admin = await requireAdmin();
  requireDatabaseForMutation();
  const inventory = await listAdminInventory();
  const current = inventory.find((row) => row.variantId === input.variantId);
  if (!current) throw new Error(`Variant not found: ${input.variantId}`);

  const newStock = Math.max(0, Math.floor(input.stock));
  const quantityChange = newStock - current.stock;
  if (quantityChange !== 0) {
    await applyInventoryAdjustment({
      actorEmail: admin.email,
      mode: 'manual_correction',
      source: 'admin-inventory-edit',
      reason: 'Admin manually updated inventory',
      items: [{ variantId: input.variantId, quantity: quantityChange }],
    });
  }
  if (input.image !== undefined || quantityChange === 0) {
    await updateInventoryVariant({ variantId: input.variantId, stock: newStock, image: input.image });
  }
  await inngest.send({
    id: `inventory-changed-admin-${input.variantId}-${Date.now()}`,
    name: 'store/inventory.changed',
    data: {
      source: 'admin-inventory-edit',
      reason: 'Admin manually updated inventory',
      actorEmail: admin.email,
      variantIds: [input.variantId],
    },
  });
}

export async function upsertProductAction(input: ProductUpsertInput) {
  const admin = await requireAdmin();
  requireDatabaseForMutation();
  const product = normalizeProductInput(input);
  await upsertAdminProduct(product);
  await inngest.send({
    id: `inventory-changed-product-${product.id}-${Date.now()}`,
    name: 'store/inventory.changed',
    data: {
      source: 'admin-product-upsert',
      reason: 'Admin created or updated product inventory',
      actorEmail: admin.email,
      productId: product.id,
      variantIds: product.variants.map((variant) => variant.id),
    },
  });
  return product;
}

export async function uploadProductImageAction(formData: FormData) {
  const admin = await requireAdmin();
  requireDatabaseForMutation();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Choose an image file to upload.');
  }
  const productId = String(formData.get('productId') ?? '').trim();
  const buffer = Buffer.from(await file.arrayBuffer());
  return saveProductImage({
    productId,
    contentType: file.type,
    buffer,
    actorEmail: admin.email,
  });
}

export async function requestInventoryImportAction() {
  const admin = await requireAdmin();
  requireDatabaseForMutation();
  if (!process.env.INVENTORY_SHEET_ID && !process.env.ORDERS_SHEET_ID) {
    throw new Error('INVENTORY_SHEET_ID or ORDERS_SHEET_ID is required for sheet imports.');
  }
  await inngest.send({
    id: `inventory-import-${Date.now()}`,
    name: 'admin/inventory.import.requested',
    data: {
      actorEmail: admin.email,
    },
  });
}

export async function updateOrderStatusAction(input: {
  orderId: string;
  status: OrderStatus;
  tracking?: string;
  notes?: string;
}) {
  const admin = await requireAdmin();
  requireDatabaseForMutation();
  if (!isOrderStatus(input.status)) {
    throw new Error(`Invalid order status: ${String(input.status)}`);
  }
  await inngest.send({
    id: `order-status-${input.orderId}-${input.status}-${Date.now()}`,
    name: 'admin/order.status_update.requested',
    data: {
      ...input,
      actorEmail: admin.email,
    },
  });
}

export async function upsertDiscountCodeAction(input: {
  code: string;
  label?: string;
  type: DiscountCodeType;
  amountOffCents?: number | null;
  percentOff?: number | null;
  maxRedemptions?: number | null;
  active?: boolean;
}) {
  const admin = await requireAdmin();
  requireDatabaseForMutation();
  await upsertDiscountCode({ ...input, createdBy: admin.email });
}

export async function mintEventDiscountCodesAction(input: {
  prefix: string;
  label?: string;
  type: DiscountCodeType;
  amountOffCents?: number | null;
  percentOff?: number | null;
  count: number;
}) {
  const admin = await requireAdmin();
  requireDatabaseForMutation();
  return generateSingleUseDiscountCodes({ ...input, createdBy: admin.email });
}

export async function generateSwagCodeAction(input: {
  recipient?: string;
  purpose?: string;
  kind: SwagCodeAgentKind;
}) {
  const admin = await requireAdmin();
  requireDatabaseForMutation();
  return runSwagCodeAgent({ ...input, actorEmail: admin.email });
}

export async function updateDiscountCodeActiveAction(input: {
  code: string;
  active: boolean;
}) {
  await requireAdmin();
  requireDatabaseForMutation();
  await updateDiscountCodeActive(input);
}

export async function generateApiTokenAction(input: {
  name: string;
  actorEmail?: string;
}) {
  const admin = await requireAdmin();
  requireDatabaseForMutation();
  return generateApiToken({
    name: input.name,
    actorEmail: input.actorEmail || admin.email,
    createdBy: admin.email,
  });
}

export async function updateApiTokenAction(input: {
  id: number;
  name: string;
  actorEmail: string;
}) {
  await requireAdmin();
  requireDatabaseForMutation();
  await updateApiToken(input);
}

export async function revokeApiTokenAction(input: { id: number }) {
  await requireAdmin();
  requireDatabaseForMutation();
  await revokeApiToken(input.id);
}

function requireDatabaseForMutation(): void {
  if (!isStoreDatabaseEnabled()) {
    throw new Error('DATABASE_URL is required for live admin mutations.');
  }
}
