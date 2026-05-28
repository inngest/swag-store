import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/api-auth';
import { listAutomationProducts } from '@/lib/order-automation';

export async function GET(req: NextRequest) {
  try {
    await requireApiActor(req);
    return NextResponse.json({ products: await listAutomationProducts() });
  } catch (err) {
    return apiError(err);
  }
}

function apiError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Request failed';
  const status = message.includes('API token') || message.includes('SWAG_STORE_API_TOKEN') ? 401 : 500;
  return NextResponse.json({ error: message }, { status });
}
