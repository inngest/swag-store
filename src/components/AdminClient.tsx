'use client';

// ─── Admin Order List ─────────────────────────────────────────────────────
// Internal screen for the livestream — shows orders flowing in with their
// Inngest workflow status. In production, this would poll /api/admin/orders
// which reads from Inngest run status + order DB.
//
// For demo: generates mock orders and simulates them advancing through steps.

import { useState, useEffect } from 'react';
import { PRODUCTS, formatPrice } from '@/lib/catalog';
import Link from 'next/link';

type OrderStatus = 'processing' | 'fulfilling' | 'shipped' | 'complete';
type MockOrder = {
  id: string;
  product: string;
  productId: string;
  size?: string;
  amount: number;
  status: OrderStatus;
  step: number; // 0-4
  createdAt: string;
  email: string;
};

const STATUSES: OrderStatus[] = ['processing', 'fulfilling', 'shipped', 'complete'];
const STATUS_COLORS: Record<OrderStatus, string> = {
  processing: '#FF7300',
  fulfilling: '#CBB26A',
  shipped: '#59A569',
  complete: '#006250',
};

const MOCK_EMAILS = [
  'tony@buildwithfury.dev',
  'dev@nocodenevermind.io',
  'sarah@retryqueen.com',
  'mike@infiniteloops.net',
  'alex@durableordie.com',
];

function generateOrder(i: number): MockOrder {
  const product = PRODUCTS[i % PRODUCTS.length];
  const sizes = ['S', 'M', 'L', 'XL'];
  return {
    id: `ORD-${(1000 + i).toString(16).toUpperCase()}`,
    product: product.name,
    productId: product.id,
    size: product.sizes ? sizes[i % sizes.length] : undefined,
    amount: product.price,
    status: 'processing',
    step: 0,
    createdAt: new Date(Date.now() - i * 47000).toISOString(),
    email: MOCK_EMAILS[i % MOCK_EMAILS.length],
  };
}

const INITIAL_ORDERS: MockOrder[] = Array.from({ length: 6 }, (_, i) => ({
  ...generateOrder(i),
  // Seed some in various states
  status: STATUSES[Math.min(i, 3)] as OrderStatus,
  step: Math.min(i, 4),
}));

export function AdminClient() {
  const [orders, setOrders] = useState<MockOrder[]>(INITIAL_ORDERS);
  const [tick, setTick] = useState(0);

  // Simulate orders advancing every few seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);

      // Advance one random non-complete order
      setOrders((prev) => {
        const advancing = prev.filter((o) => o.status !== 'complete');
        if (advancing.length === 0) {
          // Add a new order
          const newOrder = generateOrder(prev.length);
          return [newOrder, ...prev.slice(0, 9)];
        }
        const target = advancing[Math.floor(Math.random() * advancing.length)];
        return prev.map((o) => {
          if (o.id !== target.id) return o;
          const nextStep = Math.min(o.step + 1, 4);
          const nextStatus = nextStep === 1 ? 'fulfilling' : nextStep >= 3 ? nextStep === 4 ? 'complete' : 'shipped' : o.status;
          return { ...o, step: nextStep, status: nextStatus as OrderStatus };
        });
      });
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  const counts = {
    processing: orders.filter((o) => o.status === 'processing').length,
    fulfilling: orders.filter((o) => o.status === 'fulfilling').length,
    shipped: orders.filter((o) => o.status === 'shipped').length,
    complete: orders.filter((o) => o.status === 'complete').length,
  };

  return (
    <div style={{ backgroundColor: '#1A161C', minHeight: 'calc(100vh - 56px)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 24px' }}>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: '32px',
            paddingBottom: '20px',
            borderBottom: '1px solid rgba(239, 233, 214, 0.12)',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-space-mono, monospace)',
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#FF7300',
                marginBottom: '6px',
              }}
            >
              Internal — Admin
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-space-grotesk, sans-serif)',
                fontWeight: '700',
                fontSize: '28px',
                textTransform: 'uppercase',
                color: '#EFE9D6',
                margin: 0,
              }}
            >
              Order Dashboard
            </h1>
          </div>

          {/* Live indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#59A569',
                animation: 'pulse 2s ease-in-out infinite',
              }}
            />
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
            <span
              style={{
                fontFamily: 'var(--font-space-mono, monospace)',
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#59A569',
              }}
            >
              Live
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1px',
            backgroundColor: 'rgba(239, 233, 214, 0.08)',
            marginBottom: '32px',
          }}
        >
          {[
            { label: 'Processing', count: counts.processing, color: '#FF7300' },
            { label: 'Fulfilling', count: counts.fulfilling, color: '#CBB26A' },
            { label: 'Shipped', count: counts.shipped, color: '#59A569' },
            { label: 'Complete', count: counts.complete, color: '#006250' },
          ].map(({ label, count, color }) => (
            <div
              key={label}
              style={{
                backgroundColor: '#1A161C',
                padding: '20px 24px',
                borderTop: `2px solid ${color}`,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '32px',
                  fontWeight: '700',
                  color,
                  lineHeight: 1,
                  marginBottom: '6px',
                }}
              >
                {count}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'rgba(239, 233, 214, 0.4)',
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Orders table */}
        <div style={{ border: '1px solid rgba(239, 233, 214, 0.08)' }}>
          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr 80px 80px 160px 100px',
              gap: '0',
              padding: '10px 20px',
              borderBottom: '1px solid rgba(239, 233, 214, 0.1)',
              backgroundColor: '#231D27',
            }}
          >
            {['Order ID', 'Product', 'Size', 'Amount', 'Customer', 'Status'].map((col) => (
              <div
                key={col}
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '9px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'rgba(239, 233, 214, 0.35)',
                }}
              >
                {col}
              </div>
            ))}
          </div>

          {/* Order rows */}
          {orders.map((order, i) => (
            <div
              key={order.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 1fr 80px 80px 160px 100px',
                gap: '0',
                padding: '14px 20px',
                borderBottom: '1px solid rgba(239, 233, 214, 0.05)',
                backgroundColor: i % 2 === 0 ? '#1A161C' : 'rgba(54, 44, 64, 0.15)',
                alignItems: 'center',
                transition: 'background-color 0.2s ease',
              }}
            >
              {/* Order ID */}
              <Link
                href={`/orders/${order.id}`}
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '12px',
                  color: '#FF7300',
                  textDecoration: 'none',
                }}
              >
                {order.id}
              </Link>

              {/* Product */}
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-space-grotesk, sans-serif)',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#EFE9D6',
                    textTransform: 'uppercase',
                  }}
                >
                  {order.product}
                </div>
              </div>

              {/* Size */}
              <div
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '11px',
                  color: 'rgba(239, 233, 214, 0.5)',
                }}
              >
                {order.size ?? '—'}
              </div>

              {/* Amount */}
              <div
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '13px',
                  color: '#EFE9D6',
                }}
              >
                {formatPrice(order.amount)}
              </div>

              {/* Customer */}
              <div
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '11px',
                  color: 'rgba(239, 233, 214, 0.4)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {order.email}
              </div>

              {/* Status */}
              <div>
                {/* Step progress mini-bar */}
                <div
                  style={{
                    display: 'flex',
                    gap: '2px',
                    marginBottom: '4px',
                  }}
                >
                  {Array.from({ length: 5 }).map((_, si) => (
                    <div
                      key={si}
                      style={{
                        height: '3px',
                        flex: 1,
                        backgroundColor:
                          si < order.step
                            ? STATUS_COLORS[order.status]
                            : si === order.step && order.status !== 'complete'
                            ? 'rgba(255, 115, 0, 0.4)'
                            : 'rgba(239, 233, 214, 0.1)',
                        transition: 'background-color 0.4s ease',
                      }}
                    />
                  ))}
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-space-mono, monospace)',
                    fontSize: '9px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: STATUS_COLORS[order.status],
                  }}
                >
                  {order.status}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Inngest Cloud link */}
        <div
          style={{
            marginTop: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <a
            href="https://app.inngest.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: '#FF7300',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            View all runs in Inngest Cloud →
          </a>
        </div>
      </div>
    </div>
  );
}
