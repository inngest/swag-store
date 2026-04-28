'use client';

import * as React from 'react';
import Link from 'next/link';
import { StepDot } from './atoms/WorkflowTracker';

type Order = {
  id: string;
  email: string;
  total: number;
  items: string;
  step: string;
  status: 'running' | 'complete';
  t: string;
};

const SEED: Order[] = [
  { id: 'ord_a01', email: 'alex@example.com', total: 42.0, items: 'Tee × 1, Hat × 1', step: 'send-confirmation', status: 'running', t: '0s ago' },
  { id: 'ord_a02', email: 'j.lin@hey.so', total: 86.0, items: 'Hoodie × 1, Stickers × 1', step: 'reserve-inventory', status: 'running', t: '12s ago' },
  { id: 'ord_a03', email: 'marco@inn.dev', total: 28.0, items: 'Tee × 1', step: 'complete', status: 'complete', t: '1m ago' },
  { id: 'ord_a04', email: 'sam@codes.io', total: 24.0, items: 'Hat × 1', step: 'complete', status: 'complete', t: '3m ago' },
  { id: 'ord_a05', email: 'priya@labs.run', total: 70.0, items: 'Hoodie × 1, Hat × 1', step: 'complete', status: 'complete', t: '5m ago' },
  { id: 'ord_a06', email: 'wren@deno.fm', total: 12.0, items: 'Stickers × 1', step: 'complete', status: 'complete', t: '8m ago' },
  { id: 'ord_a07', email: 'kira@build.so', total: 56.0, items: 'Tee × 2', step: 'complete', status: 'complete', t: '12m ago' },
];

export function AdminClient() {
  const [orders, setOrders] = React.useState<Order[]>(SEED);
  const [pulse, setPulse] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = setInterval(() => {
      setOrders((prev) =>
        prev.map((o, i) => {
          if (i === 0 && o.status === 'running') {
            if (o.step === 'capture-payment') return { ...o, step: 'reserve-inventory' };
            if (o.step === 'reserve-inventory') return { ...o, step: 'send-confirmation' };
            if (o.step === 'send-confirmation') {
              setPulse(o.id);
              setTimeout(() => setPulse(null), 700);
              return { ...o, step: 'complete', status: 'complete', t: 'just now' };
            }
          }
          return o;
        }),
      );
    }, 2400);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    const t = setInterval(() => {
      const fakes = ['dev@inn.gst', 'kira@vector.studio', 'rohan@ship.now', 'luca@workflow.cc'];
      const itemsList = ['Tee × 1', 'Hoodie × 1', 'Hat × 1, Stickers × 1', 'Tee × 1, Hat × 1'];
      const totals = [28.0, 58.0, 36.0, 52.0];
      const i = Math.floor(Math.random() * fakes.length);
      const j = Math.floor(Math.random() * itemsList.length);
      const newOrder: Order = {
        id: `ord_${Math.random().toString(36).slice(2, 7)}`,
        email: fakes[i],
        total: totals[j],
        items: itemsList[j],
        step: 'capture-payment',
        status: 'running',
        t: 'just now',
      };
      setOrders((prev) => [newOrder, ...prev].slice(0, 9));
      setPulse(newOrder.id);
      setTimeout(() => setPulse(null), 700);
    }, 7800);
    return () => clearInterval(t);
  }, []);

  const liveCount = orders.filter((o) => o.status === 'running').length;
  const revenue = orders.reduce((s, o) => s + o.total, 0).toFixed(0);

  return (
    <div>
      <div style={{ borderBottom: '1px solid var(--ink)', padding: '32px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 32, alignItems: 'end' }}>
        <div>
          <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12 }}>
            ADMIN · 07 / ORDERS · CHANNEL · admin:orders
          </div>
          <h1 className="display" style={{ fontSize: 'clamp(56px, 8vw, 120px)', lineHeight: 0.86, fontWeight: 400, letterSpacing: '-0.02em', textTransform: 'uppercase', margin: 0 }}>
            Orders, live.
          </h1>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--ink)', border: '1px solid var(--ink)' }}>
          <Stat label="LIVE" value={liveCount} accent />
          <Stat label="TODAY" value={orders.length} />
          <Stat label="REVENUE" value={`$${revenue}`} />
        </div>
      </div>

      <div style={{ padding: '0 32px 32px' }}>
        <div className="mono" style={{ display: 'grid', gridTemplateColumns: '0.7fr 1.2fr 0.8fr 1.4fr 1.2fr 0.7fr 0.5fr', padding: '16px 0', borderBottom: '1px solid var(--ink)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
          <span>ORDER</span>
          <span>EMAIL</span>
          <span>TOTAL</span>
          <span>ITEMS</span>
          <span>CURRENT STEP</span>
          <span>UPDATED</span>
          <span />
        </div>
        {orders.map((o) => (
          <div
            key={o.id}
            className={pulse === o.id ? 'step-in' : ''}
            style={{
              display: 'grid',
              gridTemplateColumns: '0.7fr 1.2fr 0.8fr 1.4fr 1.2fr 0.7fr 0.5fr',
              padding: '16px 0',
              borderBottom: '1px solid var(--rule-soft)',
              alignItems: 'center',
              background: pulse === o.id ? 'rgba(255, 115, 0, 0.06)' : 'transparent',
              transition: 'background 480ms',
            }}
          >
            <span className="mono tabnum" style={{ fontSize: 12 }}>{o.id}</span>
            <span style={{ fontSize: 13 }}>{o.email}</span>
            <span className="mono tabnum" style={{ fontSize: 12.5 }}>${o.total.toFixed(2)}</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{o.items}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <StepDot status={o.status === 'complete' ? 'complete' : 'running'} />
              <span className="mono" style={{ fontSize: 11.5 }}>{o.step}</span>
            </span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{o.t}</span>
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
