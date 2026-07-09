// Transactional email via Resend's REST API. Deliberately SDK-free: a single
// POST with a bearer key is all we need, and it keeps the dependency tree flat.
//
// Env-gated: if RESEND_API_KEY / ORDER_EMAIL_FROM are unset the send is a
// graceful no-op so local dev and preview environments never throw.

export type OrderConfirmationItem = {
  name: string;
  quantity: number;
};

export type OrderConfirmationEmailInput = {
  to: string;
  orderId: string;
  items: OrderConfirmationItem[];
  totalCents: number;
  currency: string;
  appUrl: string;
};

export type OrderConfirmationEmailResult =
  | { sent: true; id: string | null }
  | { sent: false; skipped: string };

export function isOrderEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ORDER_EMAIL_FROM);
}

export function renderOrderConfirmationEmailHtml({
  orderId,
  items,
  totalCents,
  currency,
  appUrl,
}: Omit<OrderConfirmationEmailInput, 'to'>): string {
  const rows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding: 6px 0; border-bottom: 1px solid #e5e5e5;">${escapeHtml(item.name)}</td>
          <td style="padding: 6px 0; border-bottom: 1px solid #e5e5e5; text-align: right;">× ${item.quantity}</td>
        </tr>`,
    )
    .join('\n');

  const orderUrl = `${appUrl.replace(/\/$/, '')}/orders/${encodeURIComponent(orderId)}`;

  return `<!doctype html>
<html>
  <body style="margin: 0; padding: 32px 16px; background: #fafafa; color: #111;">
    <div style="max-width: 520px; margin: 0 auto; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 14px; line-height: 1.6;">
      <p style="text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px; color: #666;">Inngest Swag</p>
      <h1 style="font-size: 18px; font-weight: 600; margin: 8px 0 24px;">Order confirmed.</h1>
      <p style="margin: 0 0 16px;">Order <strong>${escapeHtml(orderId)}</strong> is in the queue. We'll let you know when it ships.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        ${rows}
        <tr>
          <td style="padding: 10px 0; font-weight: 600;">Total</td>
          <td style="padding: 10px 0; font-weight: 600; text-align: right;">${formatAmount(totalCents, currency)}</td>
        </tr>
      </table>
      <p style="margin: 24px 0 0;">
        <a href="${orderUrl}" style="color: #111;">Track your order →</a>
      </p>
    </div>
  </body>
</html>`;
}

export async function sendOrderConfirmationEmail(
  input: OrderConfirmationEmailInput,
): Promise<OrderConfirmationEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_EMAIL_FROM;
  if (!apiKey || !from) {
    const missing = [!apiKey && 'RESEND_API_KEY', !from && 'ORDER_EMAIL_FROM']
      .filter(Boolean)
      .join(' + ');
    return { sent: false, skipped: `${missing} not configured` };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: `Order confirmed — ${input.orderId}`,
      html: renderOrderConfirmationEmailHtml(input),
    }),
  });

  if (!res.ok) {
    // Keep the error terse: Resend error bodies can echo the recipient
    // address, which must stay out of logs and step output.
    throw new Error(`Resend responded ${res.status}`);
  }

  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  return { sent: true, id: body?.id ?? null };
}

export type OrderShippedEmailInput = {
  to: string;
  orderId: string;
  tracking: string;
  appUrl: string;
};

export async function sendOrderShippedEmail(
  input: OrderShippedEmailInput,
): Promise<OrderConfirmationEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_EMAIL_FROM;
  if (!apiKey || !from) {
    const missing = [!apiKey && 'RESEND_API_KEY', !from && 'ORDER_EMAIL_FROM']
      .filter(Boolean)
      .join(' + ');
    return { sent: false, skipped: `${missing} not configured` };
  }

  const orderUrl = `${input.appUrl.replace(/\/$/, '')}/orders/${encodeURIComponent(input.orderId)}`;
  const trackingBlock = input.tracking
    ? `<p style="margin: 0 0 16px;">Tracking number: <strong>${escapeHtml(input.tracking)}</strong></p>`
    : '';

  const html = `<!doctype html>
<html>
  <body style="margin: 0; padding: 32px 16px; background: #fafafa; color: #111;">
    <div style="max-width: 520px; margin: 0 auto; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 14px; line-height: 1.6;">
      <p style="text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px; color: #666;">Inngest Swag</p>
      <h1 style="font-size: 18px; font-weight: 600; margin: 8px 0 24px;">Your order shipped.</h1>
      <p style="margin: 0 0 16px;">Order <strong>${escapeHtml(input.orderId)}</strong> is on its way.</p>
      ${trackingBlock}
      <p style="margin: 24px 0 0;">
        <a href="${orderUrl}" style="color: #111;">Order status →</a>
      </p>
    </div>
  </body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: `Shipped — ${input.orderId}`,
      html,
    }),
  });

  if (!res.ok) {
    // Same rule as the confirmation email: Resend error bodies can echo the
    // recipient address, which must stay out of logs and step output.
    throw new Error(`Resend responded ${res.status}`);
  }

  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  return { sent: true, id: body?.id ?? null };
}

function formatAmount(cents: number, currency: string): string {
  const amount = (Math.max(0, cents) / 100).toFixed(2);
  return currency.toLowerCase() === 'usd' ? `$${amount}` : `${amount} ${currency.toUpperCase()}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
