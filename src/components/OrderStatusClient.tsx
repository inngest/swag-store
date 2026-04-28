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
import { StepDot } from './atoms/WorkflowTracker';

const STEPS = [
  {
    name: 'capture-payment',
    detail: 'stripe.payment_intents.retrieve',
    output: { id: 'pi_3OxYz1', amount: 4200, currency: 'usd', status: 'pending' },
  },
  {
    name: 'reserve-inventory',
    detail: 'inventory.decrement(sku, qty)',
    output: { sku: 'INN-TEE-01', reserved: 0, remaining: 0 },
  },
  {
    name: 'send-confirmation',
    detail: 'email.send(template: "order_confirmation")',
    output: { messageId: '', to: '', status: 'pending' },
  },
];

export function OrderStatusClient({ orderId }: { orderId: string }) {
  // TODO (livestream Block 3): replace static state with Realtime subscription.
  // const { data } = useInngestSubscription({ refreshToken: () => fetchOrderSubscriptionToken(orderId) });
  // Fold `data` into stepStatus + logs + completedDurations below.
  const stepStatus: Array<'complete' | 'running' | 'pending'> = ['pending', 'pending', 'pending'];
  const logs: Array<{ ts: string; level: string; msg: string }> = [
    { ts: '00:00.000', level: 'INFO', msg: 'awaiting store/order.placed event' },
  ];
  const completedDurations: string[] = [];
  const allDone = stepStatus.every((s) => s === 'complete');
  const activeIdx = stepStatus.findIndex((s) => s === 'running');
  const [open, setOpen] = React.useState(true);

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
            <OrderMetric label="ITEMS" value="2 ITEMS · DURABLY YOURS TEE, INNGEST HAT" />
            <OrderMetric label="TOTAL" value="$42.00 USD" mono />
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
            {STEPS.map((s, i) => (
              <StepCard key={s.name} index={i} step={s} status={stepStatus[i]} duration={completedDurations[i]} />
            ))}
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
