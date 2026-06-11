// Two deployments of this app (Railway prod + Vercel QA) share one Stripe
// test account and one Inngest environment. Every event carries the origin
// of the app that sent it, and every function only triggers on events from
// its own origin, so the two apps never process each other's work.
export const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export function originTrigger(event: string) {
  return { event, if: `event.data.appOrigin == "${APP_ORIGIN}"` };
}
