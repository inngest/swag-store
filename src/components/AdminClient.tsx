'use client';

import * as React from 'react';
import Link from 'next/link';
import { subscribe } from 'inngest/realtime';
import {
  fetchAdminSubscriptionToken,
  fetchPublicOrdersAction,
} from '@/app/admin/actions';
import { StepDot } from './atoms/WorkflowTracker';

type OrderMessage = {
  orderId: string;
  customerEmail?: string;
  amount?: number;
  currency?: string;
  items?: Array<{ name: string; quantity: number }>;
  step: string;
  status: 'running' | 'complete' | 'failed';
  ts: number;
};

type Order = {
  id: string;
  items: string;
  step: string;
  status: 'running' | 'complete' | 'failed';
  tracking: string;
  firstSeen: number;
  lastUpdated: number;
};

function foldMessage(prev: Map<string, Order>, msg: OrderMessage): Map<string, Order> {
  const next = new Map(prev);
  const existing = next.get(msg.orderId);

  const itemsLabel = msg.items?.length
    ? msg.items
        .map((i) => `${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`)
        .join(', ')
    : existing?.items ?? '';

  const isTerminal = msg.step === 'record-to-sheet' && msg.status === 'complete';

  next.set(msg.orderId, {
    id: msg.orderId,
    items: itemsLabel,
    step: isTerminal ? 'fulfilled' : msg.step,
    status: isTerminal ? 'complete' : msg.status,
    tracking: existing?.tracking ?? '',
    firstSeen: existing?.firstSeen ?? msg.ts,
    lastUpdated: msg.ts,
  });

  return next;
}

function foldHydratedRow(
  prev: Map<string, Order>,
  row: { orderId: string; createdAt: string; items: string; status: string; tracking: string },
): Map<string, Order> {
  if (!row.orderId) return prev;
  if (prev.has(row.orderId)) return prev;
  const next = new Map(prev);
  const ts = row.createdAt ? new Date(row.createdAt).getTime() : Date.now();
  next.set(row.orderId, {
    id: row.orderId,
    items: row.items,
    step: row.status === 'ready_to_ship' ? 'fulfilled' : row.status,
    status: 'complete',
    tracking: row.tracking,
    firstSeen: Number.isFinite(ts) ? ts : Date.now(),
    lastUpdated: Number.isFinite(ts) ? ts : Date.now(),
  });
  return next;
}

function formatRelative(ts: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - ts) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AdminClient() {
  const [orders, setOrders] = React.useState<Map<string, Order>>(new Map());
  const [pulse, setPulse] = React.useState<string | null>(null);
  const [now, setNow] = React.useState<number>(() => Date.now());
  const [subStatus, setSubStatus] = React.useState<string>('connecting');

  // Live ticking clock for "Xs ago" labels
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Hydrate from Sheets on mount
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchPublicOrdersAction();
        if (cancelled) return;
        setOrders((prev) => {
          let next = prev;
          for (const row of rows) next = foldHydratedRow(next, row);
          return next;
        });
      } catch (err) {
        console.error('[admin-hydrate] failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime subscription for live step updates
  React.useEffect(() => {
    let cancelled = false;
    let sub: { close?: (reason?: string) => void } | undefined;
    let pulseTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const token = await fetchAdminSubscriptionToken();
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
            const data = message.data as OrderMessage;
            setOrders((prev) => foldMessage(prev, data));
            setPulse(data.orderId);
            if (pulseTimer) clearTimeout(pulseTimer);
            pulseTimer = setTimeout(() => setPulse(null), 700);
          },
        );
        if (!cancelled) setSubStatus('subscribed');
      } catch (err) {
        console.error('[admin-realtime] subscribe failed', err);
        if (!cancelled) setSubStatus(`error: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();

    return () => {
      cancelled = true;
      sub?.close?.('unmount');
      if (pulseTimer) clearTimeout(pulseTimer);
    };
  }, []);

  const orderList = React.useMemo(
    () => Array.from(orders.values()).sort((a, b) => b.lastUpdated - a.lastUpdated),
    [orders],
  );

  const liveCount = orderList.filter((o) => o.status === 'running').length;
  const fulfilledCount = orderList.filter((o) => o.status === 'complete').length;

  return (
    <div>
      <div style={{ borderBottom: '1px solid var(--ink)', padding: '32px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 32, alignItems: 'end' }}>
        <div>
          <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="live-dot" />
            PUBLIC LIVE TRACKER · CHANNEL · admin · {subStatus}
          </div>
          <h1 className="display" style={{ fontSize: 'clamp(56px, 8vw, 120px)', lineHeight: 0.86, fontWeight: 400, letterSpacing: '-0.02em', textTransform: 'uppercase', margin: 0 }}>
            Orders, live.
          </h1>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, maxWidth: 540, marginTop: 16, color: 'var(--muted)' }}>
            Every order placed on this store flows through a durable Inngest workflow. Watch them progress in real time, click through to inspect any function run.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, background: 'var(--ink)', border: '1px solid var(--ink)' }}>
          <Stat label="IN FLIGHT" value={liveCount} accent />
          <Stat label="FULFILLED" value={fulfilledCount} />
        </div>
      </div>

      <div style={{ padding: '0 32px 32px' }}>
        <div className="mono" style={{ display: 'grid', gridTemplateColumns: '0.8fr 2fr 1.4fr 0.7fr 0.5fr', padding: '16px 0', borderBottom: '1px solid var(--ink)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
          <span>ORDER</span>
          <span>ITEMS</span>
          <span>CURRENT STEP</span>
          <span>UPDATED</span>
          <span />
        </div>

        {orderList.length === 0 && (
          <div className="mono" style={{ padding: '32px 0', color: 'var(--muted)', fontSize: 12 }}>
            No orders yet. Place one — it will appear here in real time.
          </div>
        )}

        {orderList.map((o) => (
          <div
            key={o.id}
            className={pulse === o.id ? 'step-in' : ''}
            style={{
              display: 'grid',
              gridTemplateColumns: '0.8fr 2fr 1.4fr 0.7fr 0.5fr',
              padding: '16px 0',
              borderBottom: '1px solid var(--rule-soft)',
              alignItems: 'center',
              background: pulse === o.id ? 'rgba(89, 165, 105, 0.08)' : 'transparent',
              transition: 'background 480ms',
            }}
          >
            <span className="mono tabnum" style={{ fontSize: 12 }}>{o.id}</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{o.items || '—'}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <StepDot status={o.status === 'complete' ? 'complete' : 'running'} />
              <span className="mono" style={{ fontSize: 11.5 }}>{o.step}</span>
            </span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{formatRelative(o.lastUpdated, now)}</span>
            <span style={{ textAlign: 'right' }}>
              <Link
                href={`/orders/${o.id}`}
                className="mono"
                style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px', border: '1px solid var(--ink)' }}
              >
                INSPECT →
              </Link>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div style={{ background: accent ? 'var(--citrus)' : 'var(--paper)', padding: '20px 24px' }}>
      <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: accent ? 'var(--nebula)' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {accent && <span className="live-dot" style={{ background: 'var(--nebula)' }} />}
        {label}
      </div>
      <div className="display tabnum" style={{ fontSize: 44, fontWeight: 400, marginTop: 6, color: accent ? 'var(--nebula)' : 'var(--ink)' }}>
        {value}
      </div>
    </div>
  );
}
