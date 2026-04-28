'use client';

import * as React from 'react';
import Image from 'next/image';
import { useCart } from '@/lib/cart-context';
import { PRODUCTS, formatPrice } from '@/lib/catalog';
import { useRouter } from 'next/navigation';

export function CartDrawer() {
  const { state, closeCart, removeItem, updateQuantity } = useCart();
  const router = useRouter();

  const lineItems = state.items.map((item) => {
    const product = PRODUCTS.find((p) => p.id === item.productId);
    return { ...item, product };
  });

  const subtotalCents = lineItems.reduce((s, it) => s + (it.product?.price ?? 0) * it.quantity, 0);
  const subtotal = subtotalCents / 100;
  const tax = +(subtotal * 0.0875).toFixed(2);
  const shipping = subtotal > 40 || subtotal === 0 ? 0 : 6;
  const total = +(subtotal + tax + shipping).toFixed(2);
  const itemCount = state.items.reduce((s, i) => s + i.quantity, 0);

  const handleCheckout = () => {
    closeCart();
    router.push('/checkout');
  };

  return (
    <>
      {state.isOpen && (
        <div
          onClick={closeCart}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26, 22, 28, 0.4)', zIndex: 50 }}
        />
      )}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 460,
          maxWidth: '92vw',
          background: 'var(--paper)',
          borderLeft: '1px solid var(--ink)',
          zIndex: 60,
          transform: state.isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              04 / CART
            </div>
            <div className="display" style={{ fontSize: 22, fontWeight: 500 }}>
              Your bag · {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </div>
          </div>
          <button onClick={closeCart} className="mono" style={{ fontSize: 11, textTransform: 'uppercase', padding: '8px 12px', border: '1px solid var(--ink)' }}>
            CLOSE ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
          {lineItems.length === 0 ? (
            <EmptyCart onClose={closeCart} />
          ) : (
            lineItems.map((it) => {
              const p = it.product;
              if (!p) return null;
              return (
                <div key={it.variantId} style={{ display: 'grid', gridTemplateColumns: '76px 1fr auto', gap: 18, padding: '20px 0', borderBottom: '1px solid var(--rule-soft)' }}>
                  <div style={{ aspectRatio: '1 / 1', border: '1px solid var(--ink)', overflow: 'hidden', position: 'relative', background: 'var(--bone)' }}>
                    {p.image && (
                      <Image src={p.image} alt={p.name} fill sizes="76px" style={{ objectFit: 'cover' }} />
                    )}
                  </div>
                  <div>
                    <div className="display" style={{ fontSize: 16, fontWeight: 500 }}>{p.name}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>
                      {p.type}
                      {it.size ? ` · ${it.size}` : ''}
                      {it.color ? ` · ${it.color}` : ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                      <button className="qty-btn mono" onClick={() => updateQuantity(it.variantId, Math.max(1, it.quantity - 1))}>−</button>
                      <span className="mono tabnum" style={{ fontSize: 12, minWidth: 16, textAlign: 'center' }}>{it.quantity}</span>
                      <button className="qty-btn mono" onClick={() => updateQuantity(it.variantId, it.quantity + 1)}>+</button>
                      <button
                        className="mono"
                        onClick={() => removeItem(it.variantId)}
                        style={{ marginLeft: 8, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', textDecoration: 'underline' }}
                      >
                        REMOVE
                      </button>
                    </div>
                  </div>
                  <div className="display tabnum" style={{ fontSize: 18 }}>
                    {formatPrice(p.price * it.quantity)}
                  </div>
                </div>
              );
            })
          )}

          {lineItems.length > 0 && (
            <div
              style={{
                padding: '20px 0',
                marginTop: 8,
                background: 'var(--bone)',
                marginLeft: -24,
                marginRight: -24,
                paddingLeft: 24,
                paddingRight: 24,
                borderTop: '1px solid var(--ink)',
                borderBottom: '1px solid var(--rule-soft)',
              }}
            >
              <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>
                INNGEST EVENT PREVIEW
              </div>
              <pre className="mono" style={{ fontSize: 11, lineHeight: 1.6, margin: 0, color: 'var(--ink)' }}>{`inngest.send({
  name: "store/order.placed",
  data: { items: ${itemCount}, total: ${total.toFixed(2)} }
})`}</pre>
            </div>
          )}
        </div>

        {lineItems.length > 0 && (
          <div style={{ borderTop: '1px solid var(--ink)', padding: '20px 24px' }}>
            <Row label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
            <Row label="Tax (mocked, 8.75%)" value={`$${tax.toFixed(2)}`} />
            <Row label="Shipping" value={shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`} />
            <div className="hr-soft" style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <span className="display" style={{ fontSize: 22, fontWeight: 500 }}>Total</span>
              <span className="display tabnum" style={{ fontSize: 28, fontWeight: 500 }}>${total.toFixed(2)}</span>
            </div>
            <button className="btn btn-citrus square" style={{ width: '100%' }} onClick={handleCheckout}>
              CHECKOUT WITH STRIPE →
            </button>
            <div className="mono" style={{ fontSize: 10, textAlign: 'center', marginTop: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              SECURE · STRIPE-HOSTED · NO ACCOUNT NEEDED
            </div>
          </div>
        )}
      </aside>
    </>
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

function EmptyCart({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ padding: '60px 0', textAlign: 'center' }}>
      <div className="display" style={{ fontSize: 56, fontWeight: 400, lineHeight: 1, textTransform: 'uppercase' }}>
        Empty.
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 280, margin: '16px auto 24px', lineHeight: 1.55 }}>
        No items in your cart. The fastest way to fix that is to add some.
      </p>
      <button className="btn btn-primary square" onClick={onClose}>BACK TO CATALOG</button>
    </div>
  );
}
