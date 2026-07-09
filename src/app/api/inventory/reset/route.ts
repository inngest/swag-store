import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';
import { APP_ORIGIN } from '@/lib/app-origin';
import { authorizeSharedSecret } from '@/lib/secret-auth';
import { resetStoreInventoryFromCatalog } from '@/lib/store-db';

export async function POST(req: NextRequest) {
  const auth = authorizeSharedSecret({
    auth: req.headers.get('authorization'),
    configuredSecret: process.env.SWAG_STORE_RESET_SECRET,
    header: req.headers.get('x-swag-store-reset-secret'),
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Live-store guardrail: in production this endpoint refuses to run
    // without an explicit confirmation string, and destructive behavior
    // (overwriting live stock, deleting non-catalog products) is opt-in
    // per call rather than the default.
    if (process.env.NODE_ENV === 'production' && body.confirm !== 'RESET-LIVE-STORE') {
      return NextResponse.json(
        { error: 'Refusing to reset a production store without { "confirm": "RESET-LIVE-STORE" }.' },
        { status: 400 },
      );
    }

    const actorEmail = typeof body.actorEmail === 'string'
      ? body.actorEmail
      : process.env.SWAG_STORE_API_ACTOR_EMAIL ?? 'railway-reset@inngest.com';
    const result = await resetStoreInventoryFromCatalog({
      actorEmail,
      overwriteStock: body.overwriteStock === true,
      deleteUnknownProducts: body.deleteUnknownProducts === true,
    });
    await inngest.send({
      id: `inventory-changed-reset-${result.importRunId}`,
      name: 'store/inventory.changed',
      data: {
        appOrigin: APP_ORIGIN,
        source: 'inventory-reset',
        reason: 'Inventory reset from catalog',
        importRunId: result.importRunId,
        actorEmail,
      },
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Inventory reset failed';
    console.error('[inventory/reset] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
