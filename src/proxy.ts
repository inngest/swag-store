import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isAdminRoute = createRouteMatcher(['/admin(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req)) {
    if (isAdminE2eBypassEnabled()) return;

    const { isAuthenticated, redirectToSignIn } = await auth();
    if (!isAuthenticated) {
      if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
        return NextResponse.redirect(new URL('/sign-in', req.url));
      }
      return redirectToSignIn();
    }
  }
});

function isAdminE2eBypassEnabled(): boolean {
  if (process.env.ADMIN_E2E_BYPASS !== '1') return false;
  if (process.env.NODE_ENV === 'production') return false;
  const email = (process.env.ADMIN_E2E_EMAIL ?? '').trim().toLowerCase();
  return email.endsWith('@inngest.com');
}

export const config = {
  matcher: [
    // Clerk context must cover /api too: admin API routes call auth() inside
    // requireAdmin, which throws outside clerkMiddleware coverage. The
    // handler above still only gates /admin pages — API routes pass through.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/__clerk/(.*)',
  ],
};
