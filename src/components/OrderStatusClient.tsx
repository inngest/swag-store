'use client';

// ─── Order Status Page — THE INNGEST MONEYSHOT ──────────────────────────────
// This page shows live execution of the Inngest fulfill-order durable function.
//
// LIVESTREAM TARGET (Block 3): The plugin will subscribe this client to the
// Inngest Realtime channel `order:{orderId}` and replace the static state below
// with live updates. Each step.run() in fulfill-order.ts publishes a Realtime
// event with { step, status, output } and the four panels render off that.
//
// The four panels:
//   1. Step tracker — animates through pending → running → complete
//   2. Per-step JSON output reveal — shows what each step returned
//   3. Realtime log panel — vertical timeline of events
//   4. Source view — fulfill-order.ts with active step highlighted in citrus

import * as React from 'react';
import { subscribe } from 'inngest/realtime';
import { StepDot } from './atoms/WorkflowTracker';
import {
  fetchOrderSubscriptionToken,
  fetchOrderDetailAction,
} from '@/app/orders/[orderId]/actions';

const STEPS = [
  {
    name: 'capture-payment',
    detail: 'stripe.payment_intents.retrieve',
    output: {} as Record<string, unknown>,
  },
  {
    name: 'reserve-inventory',
    detail: 'inventory.decrement(sku, qty)',
    output: {} as Record<string, unknown>,
  },
  {
    name: 'send-confirmation',
    detail: 'email.send(template: "order_confirmation")',
    output: {} as Record<string, unknown>,
  },
];

type StepMessage = {
  name: string;
  status: 'running' | 'complete' | 'failed';
  output?: Record<string, unknown>;
  ts: number;
};

type Hydrated = {
  items: string;
  totalCents: number;
  currency: string;
  email: string;
  name: string;
  createdAt: string;
};

function maskEmail(email: string): string {
  if (!email) return '';
  const [local = '', domain = ''] = email.split('@');
  const [domainName = '', tld = ''] = domain.split('.');
  return `${'*'.repeat(Math.max(local.length, 4))}@${'*'.repeat(Math.max(domainName.length, 4))}${tld ? `.${tld}` : ''}`;
}

export function OrderStatusClient({
  orderId,
  publicView = false,
}: {
  orderId: string;
  publicView?: boolean;
}) {
  const [messages, setMessages] = React.useState<StepMessage[]>([]);
  const [startTs, setStartTs] = React.useState<number | null>(null);
  const [hydrated, setHydrated] = React.useState<Hydrated | null>(null);

  // Hydrate from sheet on mount: if the order is recorded, every step is done.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await fetchOrderDetailAction(orderId);
        if (cancelled || !detail) return;
        setHydrated({
          items: detail.items,
          totalCents: detail.totalCents,
          currency: detail.currency,
          email: detail.email,
          name: detail.name,
          createdAt: detail.createdAt,
        });
      } catch (err) {
        console.error('[order-hydrate] failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  React.useEffect(() => {
    let cancelled = false;
    let sub: { close?: (reason?: string) => void } | undefined;

    (async () => {
      try {
        const token = await fetchOrderSubscriptionToken(orderId);
        if (cancelled) return;

        sub = await subscribe(
          {
            channel: token.channel,
            topics: [...token.topics],
            key: token.key,
            apiBaseUrl: token.apiBaseUrl,
          },
          (message) => {
            if (cancelled) return;
            const data = message.data as StepMessage;
            setMessages((prev) => [...prev, data]);
            setStartTs((s) => s ?? data.ts);
          },
        );
      } catch (err) {
        console.error('[realtime] subscribe failed', err);
      }
    })();

    return () => {
      cancelled = true;
      sub?.close?.('unmount');
    };
  }, [orderId]);

  // Fold messages → per-step status, durations, and a log timeline.
  const stepStatus = STEPS.map((s) => {
    const msgs = messages.filter((m) => m.name === s.name);
    if (msgs.some((m) => m.status === 'complete')) return 'complete' as const;
    if (msgs.some((m) => m.status === 'running')) return 'running' as const;
    // If the order is in the sheet, all customer-visible steps already ran.
    if (hydrated) return 'complete' as const;
    return 'pending' as const;
  });

  const stepOutputs = STEPS.map((s) => {
    const live = messages.findLast((m) => m.name === s.name && m.status === 'complete')?.output;
    if (live) return live;
    if (!hydrated) return undefined;
    // Reconstruct from sheet data when realtime is unavailable (page loaded
    // after the function already finished).
    if (s.name === 'capture-payment') {
      return {
        status: 'succeeded',
        amount: publicView ? '***' : hydrated.totalCents,
        currency: hydrated.currency.toLowerCase(),
      };
    }
    if (s.name === 'reserve-inventory') {
      return {
        items: hydrated.items,
        reservedAt: hydrated.createdAt,
      };
    }
    if (s.name === 'send-confirmation') {
      return {
        recipient: publicView ? maskEmail(hydrated.email) : hydrated.email,
        sentAt: hydrated.createdAt,
      };
    }
    return undefined;
  });

  const completedDurations = STEPS.map((s) => {
    const running = messages.find((m) => m.name === s.name && m.status === 'running');
    const complete = messages.find((m) => m.name === s.name && m.status === 'complete');
    if (!running || !complete) return '';
    return ((complete.ts - running.ts) / 1000).toFixed(2);
  });

  const logs = (() => {
    if (messages.length > 0) {
      return messages.map((m) => ({
        ts: formatRelative(m.ts, startTs ?? m.ts),
        level: m.status === 'failed' ? 'ERROR' : 'INFO',
        msg: `step.${m.name} → ${m.status}`,
      }));
    }
    if (hydrated) {
      // Synthesize a log timeline from the recorded order. Real timestamps
      // aren't preserved past the workflow, so we offset evenly off createdAt.
      const base = new Date(hydrated.createdAt).getTime();
      const stepNames = ['capture-payment', 'reserve-inventory', 'send-confirmation'] as const;
      const entries: Array<{ ts: string; level: string; msg: string }> = [];
      stepNames.forEach((name, i) => {
        entries.push({
          ts: formatRelative(base + i * 200, base),
          level: 'INFO',
          msg: `step.${name} → running`,
        });
        entries.push({
          ts: formatRelative(base + i * 200 + 150, base),
          level: 'INFO',
          msg: `step.${name} → complete`,
        });
      });
      entries.push({
        ts: formatRelative(base + stepNames.length * 200 + 200, base),
        level: 'INFO',
        msg: 'order received · being prepped',
      });
      return entries;
    }
    return [{ ts: '00:00.000', level: 'INFO', msg: 'awaiting store/order.placed event' }];
  })();
  const allDone = stepStatus.every((s) => s === 'complete');
  const activeIdx = stepStatus.findIndex((s) => s === 'running');
  const [open, setOpen] = React.useState(true);

  const paymentOutput = stepOutputs[0] as { amount?: number; currency?: string } | undefined;
  const inventoryOutput = stepOutputs[1] as
    | {
        reservations?: Array<{
          name?: string;
          quantity?: number;
          size?: string;
          color?: string;
        }>;
        count?: number;
      }
    | undefined;

  const totalLabel = publicView
    ? '$***.** ***'
    : paymentOutput?.amount
      ? `$${(paymentOutput.amount / 100).toFixed(2)} ${(paymentOutput.currency ?? 'usd').toUpperCase()}`
      : hydrated?.totalCents
        ? `$${(hydrated.totalCents / 100).toFixed(2)} ${hydrated.currency.toUpperCase()}`
        : '—';

  const itemsLabel = inventoryOutput?.reservations?.length
    ? (() => {
        const totalUnits = inventoryOutput.reservations!.reduce(
          (sum, r) => sum + (r.quantity ?? 0),
          0,
        );
        const names = inventoryOutput.reservations!
          .map((r) => {
            const variant = [r.size, r.color].filter(Boolean).join('/');
            const variantTag = variant ? ` (${variant.toUpperCase()})` : '';
            const qtyTag = (r.quantity ?? 1) > 1 ? ` × ${r.quantity}` : '';
            return `${(r.name ?? 'item').toUpperCase()}${variantTag}${qtyTag}`;
          })
          .join(', ');
        return `${totalUnits} ITEM${totalUnits === 1 ? '' : 'S'} · ${names}`;
      })()
    : hydrated?.items
      ? hydrated.items.toUpperCase()
      : 'AWAITING INVENTORY STEP';

  return (
    <div>
      {/* ─── Header ─── */}
      <div style={{ background: 'var(--nebula)', color: 'var(--paper)', borderBottom: '1px solid var(--ink)' }}>
        <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 32px', borderBottom: '1px solid rgba(245, 240, 232, 0.1)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(245, 240, 232, 0.6)' }}>
          <a href="/">← STORE</a>
          <span>06 / ORDER STATUS · {orderId}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="live-dot" />
            CHANNEL · order:{orderId}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', padding: '40px 32px', gap: 32 }}>
          <div>
            <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--citrus)', marginBottom: 18 }}>
              {allDone ? 'FULFILLED' : 'IN PROGRESS · LIVE'}
            </div>
            <h1 className="display" style={{ fontSize: 'clamp(64px, 9vw, 144px)', lineHeight: 0.86, fontWeight: 400, letterSpacing: '-0.02em', textTransform: 'uppercase', margin: 0 }}>
              {allDone ? 'Shipped.' : 'Shipping…'}
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.55, maxWidth: 520, marginTop: 24, color: 'rgba(245, 240, 232, 0.78)' }}>
              You&apos;re watching the live execution of <span className="mono">fulfill-order.ts</span>, an Inngest durable function. Each step is independently retried, persisted, and observable. This page subscribes to Realtime channel <span className="mono">order:{orderId}</span>.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8 }}>
            <OrderMetric label="ORDER ID" value={orderId} mono />
            <OrderMetric label="ITEMS" value={itemsLabel} />
            <OrderMetric label="TOTAL" value={totalLabel} mono />
            <OrderMetric label="ETA" value="3—5 BUSINESS DAYS · USPS" />
          </div>
        </div>
      </div>

      {/* ─── Step tracker ─── */}
      <div style={{ borderBottom: '1px solid var(--ink)' }}>
        <div style={{ padding: '32px' }}>
          <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
            <span>6.1 DURABLE STEPS · {stepStatus.filter((s) => s === 'complete').length} OF {STEPS.length}</span>
            <span>FUNCTION ID · fulfill-order · attempt 1</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`, gap: 1, background: 'var(--ink)', border: '1px solid var(--ink)' }}>
            {STEPS.map((s, i) => {
              const liveOutput = stepOutputs[i] as Record<string, unknown> | undefined;
              const stepWithLiveOutput = { ...s, output: liveOutput ?? s.output };
              return (
                <StepCard
                  key={s.name}
                  index={i}
                  step={stepWithLiveOutput}
                  status={stepStatus[i]}
                  duration={completedDurations[i]}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Realtime log + code ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--ink)' }}>
        <div style={{ borderRight: '1px solid var(--ink)', padding: '32px' }}>
          <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>6.2 REALTIME LOG · @inngest/realtime</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="live-dot" />SUBSCRIBED
            </span>
          </div>
          <div style={{ background: 'var(--nebula)', padding: 18, minHeight: 280, fontFamily: 'JetBrains Mono', fontSize: 11.5, color: '#E8E3DD', lineHeight: 1.7 }}>
            {logs.map((l, i) => (
              <div key={i} className="step-in" style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: 12 }}>
                <span style={{ color: '#6B6670' }}>{l.ts}</span>
                <span style={{ color: l.level === 'INFO' ? 'var(--citrus)' : '#E8E3DD' }}>{l.level}</span>
                <span>{l.msg}</span>
              </div>
            ))}
            {!allDone && (
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: 12, opacity: 0.5 }}>
                <span style={{ color: '#6B6670' }}>—</span>
                <span style={{ color: 'var(--citrus)' }}>···</span>
                <span>awaiting next event</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '32px' }}>
          <div
            className="mono"
            style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 14, display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setOpen((o) => !o)}
          >
            <span>6.3 SOURCE · src/inngest/functions/fulfill-order.ts</span>
            <span>{open ? '− COLLAPSE' : '+ EXPAND'}</span>
          </div>
          {open && <CodeBlock activeIdx={Math.max(0, activeIdx)} />}
        </div>
      </div>
    </div>
  );
}

function formatRelative(ts: number, start: number): string {
  const ms = Math.max(0, ts - start);
  const totalMs = Math.floor(ms);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function OrderMetric({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'baseline', borderBottom: '1px solid rgba(245, 240, 232, 0.1)', padding: '8px 0' }}>
      <span className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(245, 240, 232, 0.5)', minWidth: 64 }}>{label}</span>
      <span className={mono ? 'mono' : 'display'} style={{ fontSize: mono ? 13 : 14, color: 'var(--paper)', fontWeight: mono ? 400 : 500 }}>{value}</span>
    </div>
  );
}

function StepCard({
  index,
  step,
  status,
  duration,
}: {
  index: number;
  step: { name: string; detail: string; output: Record<string, unknown> };
  status: 'complete' | 'running' | 'pending';
  duration?: string;
}) {
  return (
    <div style={{ background: 'var(--paper)', padding: '24px 22px', position: 'relative', minHeight: 200 }}>
      <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
        <span>STEP {String(index + 1).padStart(2, '0')} / 03</span>
        <span style={{ color: status === 'running' ? 'var(--citrus)' : status === 'complete' ? 'var(--ink)' : 'var(--muted)' }}>
          {status === 'complete' ? '✓ COMPLETE' : status === 'running' ? 'RUNNING' : 'PENDING'}
        </span>
      </div>
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <StepDot status={status} />
        <div className="display" style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.05 }}>
          {step.name}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
        {step.detail}
      </div>

      {status === 'running' && (
        <div style={{ marginTop: 18, position: 'relative', height: 4, background: 'var(--rule-soft)', overflow: 'hidden' }}>
          <div className="load-bar" style={{ position: 'absolute', inset: 0 }} />
        </div>
      )}

      {status === 'complete' && (
        <div className="step-in" style={{ marginTop: 18, padding: '10px 12px', background: 'var(--bone)', borderLeft: '2px solid var(--ok)' }}>
          <div className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 4 }}>
            OUTPUT {duration ? `· ${duration}s` : ''}
          </div>
          <pre className="mono" style={{ fontSize: 10.5, lineHeight: 1.55, margin: 0, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(step.output, null, 2)}
          </pre>
        </div>
      )}

      {status === 'pending' && (
        <div className="mono" style={{ marginTop: 14, fontSize: 11, color: 'var(--muted)' }}>
          Awaiting upstream step
        </div>
      )}
    </div>
  );
}

function CodeBlock({ activeIdx }: { activeIdx: number }) {
  type Tok = [string, string];
  type Line = { tokens: Tok[]; stepIdx?: number };
  const lines: Line[] = [
    { tokens: [['kw', 'import'], ['pun', ' { '], ['fn', 'inngest'], ['pun', ' } '], ['kw', 'from'], ['str', ' "@/inngest/client"']] },
    { tokens: [] },
    { tokens: [['kw', 'export const'], ['fn', ' fulfillOrder'], ['pun', ' = inngest.'], ['fn', 'createFunction'], ['pun', '(']] },
    { tokens: [['pun', '  { '], ['fn', 'id'], ['pun', ': '], ['str', '"fulfill-order"'], ['pun', ' },']] },
    { tokens: [['pun', '  { '], ['fn', 'event'], ['pun', ': '], ['str', '"store/order.placed"'], ['pun', ' },']] },
    { tokens: [['kw', '  async'], ['pun', ' ({ '], ['fn', 'event'], ['pun', ', '], ['fn', 'step'], ['pun', ', '], ['fn', 'publish'], ['pun', ' }) => {']] },
    { tokens: [['com', '    // 1 — capture the Stripe payment']], stepIdx: 0 },
    { tokens: [['kw', '    const'], ['fn', ' payment'], ['pun', ' = '], ['kw', 'await'], ['fn', ' step'], ['pun', '.'], ['fn', 'run'], ['pun', '('], ['str', '"capture-payment"'], ['pun', ', ...);']], stepIdx: 0 },
    { tokens: [] },
    { tokens: [['com', '    // 2 — reserve inventory']], stepIdx: 1 },
    { tokens: [['kw', '    await'], ['fn', ' step'], ['pun', '.'], ['fn', 'run'], ['pun', '('], ['str', '"reserve-inventory"'], ['pun', ', ...);']], stepIdx: 1 },
    { tokens: [] },
    { tokens: [['com', '    // 3 — send confirmation email']], stepIdx: 2 },
    { tokens: [['kw', '    await'], ['fn', ' step'], ['pun', '.'], ['fn', 'run'], ['pun', '('], ['str', '"send-confirmation"'], ['pun', ', ...);']], stepIdx: 2 },
    { tokens: [] },
    { tokens: [['pun', '  }']] },
    { tokens: [['pun', ');']] },
  ];

  return (
    <div className="code-block square">
      {lines.map((l, i) => {
        const isActive = l.stepIdx === activeIdx;
        return (
          <span key={i} className={`code-line ${isActive ? 'active' : ''}`}>
            {l.tokens.length === 0 ? ' ' : l.tokens.map((t, j) => (
              <span key={j} className={`tok-${t[0]}`}>{t[1]}</span>
            ))}
          </span>
        );
      })}
    </div>
  );
}
