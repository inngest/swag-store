'use server';

import { getSubscriptionToken } from 'inngest/realtime';
import { inngest } from '@/inngest/client';
import { adminChannel } from '@/inngest/channels';
import { requireAdmin } from '@/lib/admin-auth';
import { runSwagCodeAgent, type SwagCodeAgentKind } from '@/lib/discount-code-agent';
import {
  generateApiToken,
  isStoreDatabaseEnabled,
  listAdminApiTokens,
  listAdminDiscountCodes,
  listAdminInventory,
  listAdminOrders,
  listInventoryImportRuns,
  revokeApiToken,
  updateDiscountCodeActive,
  updateInventoryVariant,
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
  const [inventory, orders, imports, discounts, apiTokens] = await Promise.all([
    listAdminInventory(),
    listAdminOrders(),
    listInventoryImportRuns(),
    listAdminDiscountCodes(),
    listAdminApiTokens(),
  ]);
  return { inventory, orders, imports, discounts, apiTokens };
}

export async function updateInventoryAction(input: {
  variantId: string;
  stock: number;
  image?: string;
}) {
  await requireAdmin();
  requireDatabaseForMutation();
  await updateInventoryVariant(input);
}

export async function requestInventoryImportAction() {
  const admin = await requireAdmin();
  requireDatabaseForMutation();
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
  await requireAdmin();
  requireDatabaseForMutation();
  await upsertDiscountCode(input);
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
