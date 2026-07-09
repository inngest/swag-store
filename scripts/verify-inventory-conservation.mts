// One-shot verification of inventory conservation (INV-1/INV-2 fixes).
// Run: npx tsx --env-file=.env.local scripts/verify-inventory-conservation.mts
// Safe for QA only — creates and cleans up a test order.
import {
  ensureStoreReady,
  reserveInventory,
  releaseOrderReservations,
  recordPendingOrder,
  updateOrderStatus,
  canTransitionOrderStatus,
} from '../src/lib/store-db';
import { getPool } from '../src/lib/db';

const ORDER_ID = `ord_verify_${Date.now().toString(36)}`;
let failures = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  if (!ok) failures += 1;
}

async function stockOf(variantId: string): Promise<number> {
  const res = await getPool().query('select stock from product_variants where id = $1', [variantId]);
  return Number(res.rows[0].stock);
}

async function main() {
  await ensureStoreReady();

  const variantRes = await getPool().query(
    `select v.id, v.stock, p.sku, p.name from product_variants v join products p on p.id = v.product_id where v.stock >= 2 limit 1`,
  );
  if (!variantRes.rows[0]) throw new Error('No variant with stock >= 2 in QA DB');
  const variant = variantRes.rows[0];
  const startStock = Number(variant.stock);
  console.log(`Using variant ${variant.id} (${variant.name}) at stock ${startStock}\n`);

  const lineItems = [{ description: variant.name as string, quantity: 1, amountTotal: 100, productId: '', productName: variant.name as string, sku: variant.sku as string, variantId: variant.id as string, size: '', color: '' }];

  // 1. Reserve decrements + writes reservation & ledger rows
  await reserveInventory({ orderId: ORDER_ID, lineItems });
  check('reserve decrements stock by 1', (await stockOf(variant.id)) === startStock - 1);
  const resv = await getPool().query('select * from order_reservations where order_id = $1', [ORDER_ID]);
  check('reservation row written', resv.rows.length === 1 && resv.rows[0].released_at === null);
  const ledger1 = await getPool().query(`select mode from inventory_adjustments where note = $1 and mode = 'order_reservation'`, [ORDER_ID]);
  check('order_reservation ledger row written', ledger1.rows.length === 1);

  // 2. Replay is idempotent (lost-ack retry)
  const replay = await reserveInventory({ orderId: ORDER_ID, lineItems });
  check('replayed reserve does NOT double-decrement', (await stockOf(variant.id)) === startStock - 1);
  check('replay returns recorded reservation', replay.count === 1);

  // 3. Release restores stock exactly once
  const rel1 = await releaseOrderReservations({ orderId: ORDER_ID, reason: 'verify', actorEmail: 'verify@test' });
  check('release restores stock', (await stockOf(variant.id)) === startStock && rel1.released.length === 1);
  const rel2 = await releaseOrderReservations({ orderId: ORDER_ID, reason: 'verify-again', actorEmail: 'verify@test' });
  check('second release is a no-op', rel2.released.length === 0 && (await stockOf(variant.id)) === startStock);
  const ledger2 = await getPool().query(`select mode from inventory_adjustments where note = $1 and mode = 'order_release'`, [ORDER_ID]);
  check('order_release ledger row written exactly once', ledger2.rows.length === 1);

  // 4. Status transitions
  await recordPendingOrder({
    row: { orderId: ORDER_ID, createdAt: new Date().toISOString(), email: 'verify@test', name: 'Verify', items: 'test', totalCents: 100, currency: 'USD', shipAddress: '', shipCity: '', shipState: '', shipZip: '', shipCountry: '', phone: '', status: 'pending', tracking: '', notes: '', discountCode: '', discountAmountCents: 0 },
    lineItems,
  });
  const t1 = await updateOrderStatus({ orderId: ORDER_ID, status: 'fulfilled' });
  check('pending → fulfilled allowed', t1.previousStatus === 'pending');
  let rejected = false;
  try { await updateOrderStatus({ orderId: ORDER_ID, status: 'pending' }); } catch { rejected = true; }
  check('fulfilled → pending rejected', rejected);
  const t2 = await updateOrderStatus({ orderId: ORDER_ID, status: 'cancelled' });
  check('fulfilled → cancelled allowed', t2.previousStatus === 'fulfilled');
  rejected = false;
  try { await updateOrderStatus({ orderId: ORDER_ID, status: 'shipped' }); } catch { rejected = true; }
  check('cancelled → shipped rejected (terminal)', rejected);
  check('same-status write allowed', (await updateOrderStatus({ orderId: ORDER_ID, status: 'cancelled', notes: 'note update' })).previousStatus === 'cancelled');
  check('transition matrix pure fn', canTransitionOrderStatus('pending', 'cancelled') && !canTransitionOrderStatus('shipped', 'cancelled'));

  // Cleanup
  await getPool().query('delete from order_items where order_id = $1', [ORDER_ID]);
  await getPool().query('delete from orders where order_id = $1', [ORDER_ID]);
  await getPool().query('delete from order_reservations where order_id = $1', [ORDER_ID]);
  await getPool().query('delete from inventory_adjustments where note = $1', [ORDER_ID]);
  check('cleanup: stock unchanged from start', (await stockOf(variant.id)) === startStock);

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
