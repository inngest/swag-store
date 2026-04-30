'use client';

import * as React from 'react';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useCart } from '@/lib/cart-context';
import { PRODUCTS, formatPrice } from '@/lib/catalog';
import { StepDot } from './atoms/WorkflowTracker';

type Stage = 'review' | 'creating' | 'redirecting' | 'error';

export function CheckoutClient() {
  const { state } = useCart();
  const [stage, setStage] = useState<Stage>('review');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lineItems = state.items.map((item) => {
    const product = PRODUCTS.find((p) => p.id === item.productId);
    return { ...item, product };
  });

  const subtotalCents = lineItems.reduce((s, it) => s + (it.product?.price ?? 0) * it.quantity, 0);
  const subtotal = subtotalCents / 100;
  const tax = +(subtotal * 0.0875).toFixed(2);
  const shipping = subtotal > 40 ? 0 : 6;
  const total = +(subtotal + tax + shipping).toFixed(2);

  useEffect(() => {
    if (stage !== 'creating') return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: state.items }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Checkout failed');
        if (cancelled) return;
        setStage('redirecting');
        window.location.href = data.url;
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setStage('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stage, state.items]);

  if (lineItems.length === 0) {
    return (
      <div style={{ padding: '80px 32px', textAlign: 'center' }}>
        <h1 className="display" style={{ fontSize: 56, fontWeight: 400, textTransform: 'uppercase' }}>Empty cart.</h1>
        <a href="/" className="btn btn-primary square" style={{ marginTop: 24, display: 'inline-block' }}>BACK TO CATALOG</a>
      </div>
    );
  }

  return (
    <div>
      <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 32px', borderBottom: '1px solid var(--rule-soft)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
        <a href="/">← BACK</a>
        <span>05 / CHECKOUT</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--ink)', minHeight: 600 }}>
        <div style={{ padding: '48px 40px', borderRight: '1px solid var(--ink)' }}>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>5.1 ORDER REVIEW</div>
          <h2 className="display" style={{ fontSize: 56, fontWeight: 400, lineHeight: 0.92, textTransform: 'uppercase', margin: '8px 0 24px' }}>
            One last<br />look.
          </h2>
          <div>
            {lineItems.map((it) => {
              const p = it.product;
              if (!p) return null;
              return (
                <div key={it.variantId} style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--rule-soft)' }}>
                  <div style={{ aspectRatio: '1/1', border: '1px solid var(--ink)', position: 'relative', background: 'var(--bone)' }}>
                    {p.image && <Image src={p.image} alt={p.name} fill sizes="60px" style={{ objectFit: 'cover' }} />}
                  </div>
                  <div>
                    <div className="display" style={{ fontSize: 14, fontWeight: 500 }}>{p.name} × {it.quantity}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
                      {it.size}
                      {it.color ? ` · ${it.color}` : ''}
                    </div>
                  </div>
                  <div className="mono tabnum" style={{ fontSize: 13 }}>{formatPrice(p.price * it.quantity)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 20 }}>
            <Row label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
            <Row label="Tax (8.75%)" value={`$${tax.toFixed(2)}`} />
            <Row label="Shipping" value={shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`} />
            <div className="hr-soft" style={{ margin: '10px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="display" style={{ fontSize: 18, fontWeight: 500 }}>Total</span>
              <span className="display tabnum" style={{ fontSize: 24, fontWeight: 500 }}>${total.toFixed(2)} USD</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '48px 40px', background: 'var(--bone)', display: 'flex', flexDirection: 'column' }}>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>5.2 PAYMENT</div>
          <h2 className="display" style={{ fontSize: 56, fontWeight: 400, lineHeight: 0.92, textTransform: 'uppercase', margin: '8px 0 24px' }}>
            Stripe.<br />Hosted.
          </h2>
          <p style={{ fontSize: 13, lineHeight: 1.55, maxWidth: 380, color: 'var(--ink)' }}>
            We don&apos;t touch your card. Stripe handles checkout. When payment succeeds, a webhook fires <span className="mono">store/order.placed</span> and a durable Inngest workflow takes over.
          </p>

          <div style={{ marginTop: 32, padding: 20, background: 'var(--paper)', border: '1px solid var(--ink)' }}>
            <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12 }}>
              CHECKOUT SESSION FLOW
            </div>
            <FlowStep label="1 / POST /api/checkout" status={stage === 'review' ? 'pending' : 'complete'} />
            <FlowStep label="2 / stripe.checkout.sessions.create" status={stage === 'review' ? 'pending' : stage === 'creating' ? 'running' : 'complete'} />
            <FlowStep label="3 / Redirect to checkout.stripe.com" status={stage === 'redirecting' ? 'running' : stage === 'review' || stage === 'creating' ? 'pending' : 'complete'} />
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 32 }}>
            {stage === 'review' && (
              <button className="btn btn-citrus square" style={{ width: '100%' }} onClick={() => setStage('creating')}>
                CREATE STRIPE SESSION → ${total.toFixed(2)}
              </button>
            )}
            {stage === 'creating' && (
              <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--ink)', color: 'var(--paper)', padding: 16, textAlign: 'center', border: '1px solid var(--ink)' }}>
                <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>CREATING SESSION…</div>
                <div className="load-bar" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 }} />
              </div>
            )}
            {stage === 'redirecting' && (
              <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--citrus)', color: 'var(--nebula)', padding: 16, textAlign: 'center', border: '1px solid var(--citrus)' }}>
                <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>REDIRECTING TO STRIPE…</div>
              </div>
            )}
            {stage === 'error' && (
              <div>
                <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: 16, border: '1px solid var(--ink)' }}>
                  <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>CHECKOUT FAILED</div>
                  <div className="mono" style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.5 }}>{errorMessage}</div>
                </div>
                <button className="btn btn-citrus square" style={{ width: '100%', marginTop: 8 }} onClick={() => { setErrorMessage(null); setStage('review'); }}>
                  TRY AGAIN
                </button>
              </div>
            )}
            <div className="mono" style={{ fontSize: 10, textAlign: 'center', marginTop: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              POWERED BY STRIPE · TEST MODE
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span className="mono" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>{label}</span>
      <span className="mono tabnum" style={{ fontSize: 12.5 }}>{value}</span>
    </div>
  );
}

function FlowStep({ label, status }: { label: string; status: 'complete' | 'running' | 'pending' }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 12, alignItems: 'center', padding: '8px 0' }}>
      <StepDot status={status} />
      <div className="mono" style={{ fontSize: 11.5, color: status === 'pending' ? 'var(--muted)' : 'var(--ink)' }}>{label}</div>
    </div>
  );
}
