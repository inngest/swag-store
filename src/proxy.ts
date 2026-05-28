import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isAdminRoute = createRouteMatcher(['/admin(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req)) {
    const { isAuthenticated, redirectToSignIn } = await auth();
    if (!isAuthenticated) {
      if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
        return NextResponse.redirect(new URL('/sign-in', req.url));
      }
      return redirectToSignIn();
    }
  }
});

export const config = {
  matcher: [
    '/((?!api|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/__clerk/(.*)',
  ],
};
