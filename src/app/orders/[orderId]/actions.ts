'use server';

import { cookies } from 'next/headers';
import type Stripe from 'stripe';
import { getSubscriptionToken } from 'inngest/realtime';
import { inngest } from '@/inngest/client';
import { orderChannel } from '@/inngest/channels';
import { fetchOrder } from '@/lib/store-db';
import { getStripe } from '@/lib/stripe';

export async function fetchOrderSubscriptionToken(orderId: string) {
  const token = await getSubscriptionToken(inngest, {
    channel: orderChannel(orderId),
    topics: ['step'],
  });

  return {
    channel: orderChannel(orderId).name as string,
    topics: ['step'] as const,
    key: token.key,
    apiBaseUrl: token.apiBaseUrl,
  };
}

export async function fetchOrderDetailAction(orderId: string) {
  const detail = await fetchOrder(orderId);
  if (!detail) return null;

  const cookieStore = await cookies();
  const unlocked = cookieStore.get(`order_unlock_${orderId}`)?.value === '1';
  if (unlocked) return detail;

  return {
    ...detail,
    email: maskEmail(detail.email),
    name: '',
  };
}

// Called from the confirmation page after a successful Stripe redirect.
// Verifies the sessionId actually corresponds to this orderId (via Stripe),
// then drops a cookie that grants the visitor unmasked-PII access for 30 days.
// Returns the customer's email + name pulled directly from Stripe — no Sheet
// round-trip needed.
export async function unlockOrderViewing(
  orderId: string,
  sessionId: string,
): Promise<{ email: string | null; name: string | null } | { error: string }> {
  if (!orderId || !sessionId) return { error: 'missing arguments' };

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'stripe retrieve failed' };
  }

  if (session.metadata?.orderId !== orderId) {
    return { error: 'session does not match order' };
  }

  const cookieStore = await cookies();
  cookieStore.set(`order_unlock_${orderId}`, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return {
    email: session.customer_details?.email ?? session.customer_email ?? null,
    name: session.customer_details?.name ?? null,
  };
}

function maskEmail(email: string): string {
  if (!email) return '';
  const [local = '', domain = ''] = email.split('@');
  const [domainName = '', tld = ''] = domain.split('.');
  return `${'*'.repeat(Math.max(local.length, 4))}@${'*'.repeat(Math.max(domainName.length, 4))}${tld ? `.${tld}` : ''}`;
}
