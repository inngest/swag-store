import { AdminClient } from '@/components/AdminClient';
import { getAdminUser } from '@/lib/admin-auth';
import {
  isStoreDatabaseEnabled,
  listAdminApiTokens,
  listAdminDiscountCodes,
  listAdminInventory,
  listAdminOrders,
  listAdminProducts,
  listInventoryImportRuns,
} from '@/lib/store-db';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const admin = await getAdminUser();

  if (!admin) {
    return (
      <div style={{ padding: '80px 32px', minHeight: 520 }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          ADMIN ACCESS DENIED
        </div>
        <h1 className="display" style={{ fontSize: 72, lineHeight: 0.9, textTransform: 'uppercase', fontWeight: 400, margin: '16px 0' }}>
          Allowlist<br />required.
        </h1>
        <p style={{ maxWidth: 520, fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>
          Sign in with an allowlisted @inngest.com Clerk account to manage swag inventory and orders.
        </p>
      </div>
    );
  }

  const [inventory, orders, imports, discounts, apiTokens, products] = await Promise.all([
    listAdminInventory(),
    listAdminOrders(),
    listInventoryImportRuns(),
    listAdminDiscountCodes(),
    listAdminApiTokens(),
    listAdminProducts(),
  ]);

  return (
    <AdminClient
      adminEmail={admin.email}
      initialInventory={inventory}
      initialOrders={orders}
      initialImports={imports}
      initialDiscounts={discounts}
      initialApiTokens={apiTokens}
      initialProducts={products}
      isDatabaseBacked={isStoreDatabaseEnabled()}
    />
  );
}
