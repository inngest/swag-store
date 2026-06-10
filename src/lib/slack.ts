import type { LowStockInventoryRow } from './store-db';

export type SlackPostResult =
  | { ok: true; skipped: false; status: number }
  | { ok: true; skipped: true; reason: string };

export async function sendLowStockSlackMessage({
  rows,
  threshold,
  source,
}: {
  rows: LowStockInventoryRow[];
  threshold: number;
  source: string;
}): Promise<SlackPostResult> {
  const webhookUrl = process.env.LOW_STOCK_SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return { ok: true, skipped: true, reason: 'LOW_STOCK_SLACK_WEBHOOK_URL is not configured.' };
  }

  const mention = process.env.LOW_STOCK_SLACK_MENTION?.trim();
  const heading = `${mention ? `${mention} ` : ''}Low swag inventory`;
  const text = [
    `${heading}: ${rows.length} variant${rows.length === 1 ? '' : 's'} at or below ${threshold}.`,
    ...rows.map((row) => {
      const variant = [row.size, row.color].filter(Boolean).join(' / ');
      const variantLabel = variant ? ` (${variant})` : '';
      return `• ${row.productName}${variantLabel} — ${row.stock} left — SKU ${row.sku}`;
    }),
    `Source: ${source}`,
  ].join('\n');

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${heading}*\n${rows.length} variant${rows.length === 1 ? '' : 's'} at or below *${threshold}* units.`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: rows
              .map((row) => {
                const variant = [row.size, row.color].filter(Boolean).join(' / ');
                const variantLabel = variant ? ` (${variant})` : '';
                return `• *${row.productName}${variantLabel}* — ${row.stock} left — \`${row.sku}\``;
              })
              .join('\n'),
          },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `Source: ${source}` }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Slack low-stock notification failed: ${response.status} ${body}`.trim());
  }

  return { ok: true, skipped: false, status: response.status };
}

export async function sendOrderFulfillmentFailureSlackMessage({
  orderId,
  reason,
  amountCents,
  currency,
  refundSummary,
}: {
  orderId: string;
  reason: string;
  amountCents: number;
  currency: string;
  refundSummary: string;
}): Promise<SlackPostResult> {
  const webhookUrl = process.env.ORDER_OPS_SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return { ok: true, skipped: true, reason: 'ORDER_OPS_SLACK_WEBHOOK_URL is not configured.' };
  }

  const mention = process.env.LOW_STOCK_SLACK_MENTION?.trim();
  const heading = `${mention ? `${mention} ` : ''}Order fulfillment failed`;
  const amount = `$${(Math.max(0, amountCents) / 100).toFixed(2)} ${currency.toUpperCase()}`;
  const lines = [
    `${heading}: ${orderId} (${amount}) needs attention.`,
    `Reason: ${reason}`,
    `Refund: ${refundSummary}`,
  ];

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: lines.join('\n'),
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${heading}*\nOrder \`${orderId}\` (${amount}) failed fulfillment and is parked in the pending queue.`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Reason:* ${reason}\n*Refund:* ${refundSummary}`,
          },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: 'Source: fulfill-order onFailure handler' }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Slack order-failure notification failed: ${response.status} ${body}`.trim());
  }

  return { ok: true, skipped: false, status: response.status };
}

