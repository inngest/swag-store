import { auth, currentUser } from '@clerk/nextjs/server';

export type AdminUser = {
  userId: string;
  email: string;
};

export async function getAdminUser(): Promise<AdminUser | null> {
  if (!process.env.CLERK_SECRET_KEY) return null;

  const session = await auth();
  if (!session.userId) return null;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? '';
  if (!isAllowedAdminEmail(email)) return null;

  return { userId: session.userId, email };
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
