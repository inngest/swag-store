import { auth, currentUser } from '@clerk/nextjs/server';

export type AdminUser = {
  userId: string;
  email: string;
};

export async function getAdminUser(): Promise<AdminUser | null> {
  // A real signed-in session always wins: evaluate the actual user against
  // the allowlist, so a non-allowlisted login is denied even when the local
  // E2E bypass is enabled. The bypass only covers the no-session (headless
  // test) case — it must never mask who is actually logged in.
  if (process.env.CLERK_SECRET_KEY) {
    const session = await auth();
    if (session.userId) {
      const user = await currentUser();
      const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? '';
      if (!isAllowedAdminEmail(email)) return null;
      return { userId: session.userId, email };
    }
  }

  return getE2eAdminUser();
}

export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) {
    throw new Error('Admin access requires an allowlisted @inngest.com Clerk account.');
  }
  return admin;
}

export function isAllowedAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized.endsWith('@inngest.com')) return false;

  const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(normalized);
}

function getE2eAdminUser(): AdminUser | null {
  if (process.env.ADMIN_E2E_BYPASS !== '1') return null;
  if (process.env.NODE_ENV === 'production') return null;

  const email = (process.env.ADMIN_E2E_EMAIL ?? '').trim().toLowerCase();
  if (!isAllowedAdminEmail(email)) return null;

  return {
    userId: 'admin-e2e-bypass',
    email,
  };
}
