import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

// Boolean only — never expose the allowlist or the resolved admin identity
// to the storefront client.
export async function GET() {
  const admin = await getAdminUser();
  return NextResponse.json(
    { isAdmin: Boolean(admin) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
