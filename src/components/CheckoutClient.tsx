'use client';

import { useState, useEffect } from 'react';
import { useCart } from '@/lib/cart-context';
import { PRODUCTS, formatPrice } from '@/lib/catalog';
import { useRouter } from 'next/navigation';

// ─── Checkout Page ────────────────────────────────────────────────────────
// Shows order summary and a "Proceed to Payment" button.
// In production: POST /api/checkout → creates Stripe Checkout Session → redirect.
// The loading state between clicking and Stripe redirect is what we design here.

type CheckoutStep = 'review' | 'redirecting' | 'error';

export function CheckoutClient() {
  const { state, clearCart } = useCart();
  const router = useRouter();
  const [step, setStep] = useState<CheckoutStep>('review');

  const lineItems = state.items.map((item) => {
    const product = PRODUCTS.find((p) => p.id === item.productId);
    return { ...item, product };
  });

  const subtotal = lineItems.reduce(
    (sum, item) => sum + (item.product?.price ?? 0) * item.quantity,
    0
  );
  const shipping = subtotal > 7500 ? 0 : 799;
  const total = subtotal + shipping;

  const handlePay = async () => {
    setStep('redirecting');

    // Simulate API call to create Stripe session
    // In production: const { url } = await fetch('/api/checkout').then(r => r.json());
    // window.location.href = url;

    // For demo: simulate 2s redirect delay then go to order confirmation
    await new Promise((r) => setTimeout(r, 2000));
    const orderId = `ORD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    clearCart();
    router.push(`/orders/${orderId}`);
  };

  if (state.items.length === 0 && step === 'review') {
    return (
      <div
        style={{
          backgroundColor: '#1A161C',
          minHeight: 'calc(100vh - 56px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(239, 233, 214, 0.4)',
              marginBottom: '24px',
            }}
          >
            Your cart is empty
          </p>
          <a
            href="/"
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: '#FF7300',
              textDecoration: 'none',
            }}
          >
            ← Back to Catalog
          </a>
        </div>
      </div>
    );
  }

  // ─── Stripe Redirect Loading State ──────────────────────────────────────
  if (step === 'redirecting') {
    return (
      <div
        style={{
          backgroundColor: '#1A161C',
          minHeight: 'calc(100vh - 56px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '32px',
        }}
      >
        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>

        {/* Spinner */}
        <div
          style={{
            width: '48px',
            height: '48px',
            border: '2px solid rgba(239, 233, 214, 0.1)',
            borderTopColor: '#FF7300',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />

        <div style={{ textAlign: 'center', animation: 'fadeIn 0.4s ease both' }}>
          <div
            style={{
              fontFamily: 'var(--font-space-grotesk, sans-serif)',
              fontWeight: '700',
              fontSize: '24px',
              textTransform: 'uppercase',
              color: '#EFE9D6',
              marginBottom: '8px',
            }}
          >
            Preparing Checkout
          </div>
          <p
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(239, 233, 214, 0.4)',
            }}
          >
            Redirecting to Stripe Checkout...
          </p>
        </div>

        {/* Stripe trust badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            border: '1px solid rgba(239, 233, 214, 0.1)',
            color: 'rgba(239, 233, 214, 0.4)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="4" width="22" height="16" rx="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Secured by Stripe
          </span>
        </div>
      </div>
    );
  }

  // ─── Order Review ────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: '#1A161C', minHeight: 'calc(100vh - 56px)' }}>
      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          padding: '48px 24px',
          display: 'grid',
          gridTemplateColumns: '1fr 360px',
          gap: '48px',
          alignItems: 'start',
        }}
      >
        {/* ─── Left: Order Summary ─── */}
        <div>
          <div
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: '#FF7300',
              marginBottom: '8px',
            }}
          >
            Review Order
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-space-grotesk, sans-serif)',
              fontWeight: '700',
              fontSize: '36px',
              textTransform: 'uppercase',
              color: '#EFE9D6',
              margin: '0 0 32px',
            }}
          >
            Your Cart
          </h1>

          {/* Line items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {lineItems.map((item, i) => (
              <div
                key={item.variantId}
                style={{
                  display: 'flex',
                  gap: '20px',
                  padding: '20px 0',
                  borderBottom: '1px solid rgba(239, 233, 214, 0.08)',
                }}
              >
                {/* Image */}
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    flexShrink: 0,
                    background: item.product?.imagePlaceholder ?? '#362C40',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: '32px', opacity: 0.3 }}>
                    {item.product?.category === 'apparel' ? '👕' : '🏷️'}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-space-grotesk, sans-serif)',
                      fontWeight: '700',
                      fontSize: '16px',
                      textTransform: 'uppercase',
                      color: '#EFE9D6',
                      marginBottom: '4px',
                    }}
                  >
                    {item.product?.name}
                  </div>
                  {item.size && (
                    <div
                      style={{
                        fontFamily: 'var(--font-space-mono, monospace)',
                        fontSize: '10px',
                        textTransform: 'uppercase',
                        color: 'rgba(239, 233, 214, 0.4)',
                        letterSpacing: '0.08em',
                      }}
                    >
                      Size: {item.size} · Qty: {item.quantity}
                    </div>
                  )}
                </div>

                {/* Price */}
                <div
                  style={{
                    fontFamily: 'var(--font-space-mono, monospace)',
                    fontSize: '16px',
                    fontWeight: '700',
                    color: '#FF7300',
                  }}
                >
                  {formatPrice((item.product?.price ?? 0) * item.quantity)}
                </div>
              </div>
            ))}
          </div>

          {/* Workflow note */}
          <div
            style={{
              marginTop: '32px',
              padding: '16px 20px',
              backgroundColor: 'rgba(255, 115, 0, 0.05)',
              borderLeft: '2px solid rgba(255, 115, 0, 0.4)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <div style={{ color: '#FF7300', marginTop: '1px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#FF7300',
                  marginBottom: '4px',
                }}
              >
                Inngest Workflow
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-space-grotesk, sans-serif)',
                  fontSize: '13px',
                  color: 'rgba(239, 233, 214, 0.55)',
                  margin: 0,
                }}
              >
                After payment, a 5-step durable workflow handles fulfillment. Track every step in real time on your order status page.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Right: Payment Summary ─── */}
        <div
          style={{
            position: 'sticky',
            top: '80px',
            border: '1px solid rgba(239, 233, 214, 0.12)',
            padding: '28px',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'rgba(239, 233, 214, 0.5)',
              margin: '0 0 24px',
            }}
          >
            Order Summary
          </h2>

          {/* Line totals */}
          {[
            { label: 'Subtotal', value: formatPrice(subtotal) },
            { label: 'Shipping', value: shipping === 0 ? 'FREE' : formatPrice(shipping) },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'rgba(239, 233, 214, 0.5)',
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '13px',
                  color: value === 'FREE' ? '#59A569' : '#EFE9D6',
                }}
              >
                {value}
              </span>
            </div>
          ))}

          {/* Divider */}
          <div style={{ borderTop: '1px solid rgba(239, 233, 214, 0.12)', margin: '16px 0' }} />

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '28px' }}>
            <span
              style={{
                fontFamily: 'var(--font-space-mono, monospace)',
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#EFE9D6',
              }}
            >
              Total
            </span>
            <span
              style={{
                fontFamily: 'var(--font-space-mono, monospace)',
                fontSize: '22px',
                fontWeight: '700',
                color: '#FF7300',
              }}
            >
              {formatPrice(total)}
            </span>
          </div>

          {/* Pay button */}
          <button
            onClick={handlePay}
            style={{
              width: '100%',
              backgroundColor: '#FF7300',
              color: '#1A161C',
              border: 'none',
              padding: '16px',
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '12px',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              cursor: 'pointer',
              marginBottom: '12px',
              transition: 'background-color 0.15s ease',
            }}
          >
            Pay with Stripe →
          </button>

          <p
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'rgba(239, 233, 214, 0.25)',
              textAlign: 'center',
              margin: 0,
            }}
          >
            Secured by Stripe · SSL Encrypted
          </p>
        </div>
      </div>
    </div>
  );
}
