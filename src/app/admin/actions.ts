'use server';

import { getSubscriptionToken } from 'inngest/realtime';
import { inngest } from '@/inngest/client';
import { adminChannel } from '@/inngest/channels';
import { fetchPublicOrders } from '@/lib/sheets';

export async function fetchAdminSubscriptionToken() {
  const token = await getSubscriptionToken(inngest, {
    channel: adminChannel,
    topics: ['order'],
  });

  return {
    channel: adminChannel.name as string,
    topics: ['order'] as const,
    key: token.key,
    apiBaseUrl: token.apiBaseUrl,
  };
}

// Public-safe: returns recent fulfilled orders without email or total.
export async function fetchPublicOrdersAction() {
  return fetchPublicOrders(50);
}
