'use client';

import { useCart } from '@/lib/cart-context';
import { PRODUCTS, formatPrice } from '@/lib/catalog';
import { useRouter } from 'next/navigation';

export function CartDrawer() {
  const { state, closeCart, removeItem, updateQuantity } = useCart();
  const router = useRouter();

  // Compute line items with product details
  const lineItems = state.items.map((item) => {
    const product = PRODUCTS.find((p) => p.id === item.productId);
    const variant = product?.variants.find((v) => v.id === item.variantId);
    return { ...item, product, variant };
  });

  const subtotal = lineItems.reduce((sum, item) => {
    return sum + (item.product?.price ?? 0) * item.quantity;
  }, 0);

  const handleCheckout = () => {
    closeCart();
    router.push('/checkout');
  };

  if (!state.isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeCart}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(26, 22, 28, 0.8)',
          zIndex: 98,
          backdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '420px',
          maxWidth: '100vw',
          backgroundColor: '#231D27',
          borderLeft: '1px solid rgba(239, 233, 214, 0.12)',
          zIndex: 99,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <style>{`
          @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
          @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
        `}</style>

        {/* Header */}
        <div
          style={{
            padding: '24px',
            borderBottom: '1px solid rgba(239, 233, 214, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span
              style={{
                fontFamily: 'var(--font-space-mono, monospace)',
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#FF7300',
                display: 'block',
                marginBottom: '4px',
              }}
            >
              Your Cart
            </span>
            <span
              style={{
                fontFamily: 'var(--font-space-grotesk, sans-serif)',
                fontSize: '20px',
                fontWeight: '700',
                color: '#EFE9D6',
              }}
            >
              {lineItems.length} {lineItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <button
            onClick={closeCart}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(239, 233, 214, 0.5)',
              cursor: 'pointer',
              padding: '4px',
              fontSize: '20px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {lineItems.length === 0 ? (
            <div
              style={{
                paddingTop: '80px',
                textAlign: 'center',
                color: 'rgba(239, 233, 214, 0.4)',
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>○</div>
              <p
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                Cart is empty
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {lineItems.map((item) => (
                <div
                  key={item.variantId}
                  style={{
                    display: 'flex',
                    gap: '16px',
                    padding: '16px',
                    border: '1px solid rgba(239, 233, 214, 0.08)',
                    backgroundColor: 'rgba(54, 44, 64, 0.3)',
                  }}
                >
                  {/* Product color swatch as image placeholder */}
                  <div
                    style={{
                      width: '72px',
                      height: '72px',
                      flexShrink: 0,
                      background: item.product?.imagePlaceholder ?? '#362C40',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{ fontSize: '24px', opacity: 0.6 }}>
                      {item.product?.category === 'apparel' ? '👕' : '🏷️'}
                    </span>
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: '600',
                        color: '#EFE9D6',
                        marginBottom: '4px',
                        fontSize: '14px',
                      }}
                    >
                      {item.product?.name}
                    </div>
                    {item.size && (
                      <div
                        style={{
                          fontFamily: 'var(--font-space-mono, monospace)',
                          fontSize: '10px',
                          color: 'rgba(239, 233, 214, 0.5)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          marginBottom: '8px',
                        }}
                      >
                        Size: {item.size}
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      {/* Quantity controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                          style={{
                            width: '24px',
                            height: '24px',
                            border: '1px solid rgba(239, 233, 214, 0.2)',
                            background: 'none',
                            color: '#EFE9D6',
                            cursor: 'pointer',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          −
                        </button>
                        <span style={{ fontSize: '13px', width: '20px', textAlign: 'center' }}>
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                          style={{
                            width: '24px',
                            height: '24px',
                            border: '1px solid rgba(239, 233, 214, 0.2)',
                            background: 'none',
                            color: '#EFE9D6',
                            cursor: 'pointer',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          +
                        </button>
                      </div>

                      {/* Price + remove */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-space-mono, monospace)',
                            fontSize: '13px',
                            color: '#FF7300',
                          }}
                        >
                          {formatPrice((item.product?.price ?? 0) * item.quantity)}
                        </span>
                        <button
                          onClick={() => removeItem(item.variantId)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(239, 233, 214, 0.3)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            padding: '2px',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {lineItems.length > 0 && (
          <div
            style={{
              padding: '24px',
              borderTop: '1px solid rgba(239, 233, 214, 0.12)',
            }}
          >
            {/* Subtotal */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'rgba(239, 233, 214, 0.6)',
                }}
              >
                Subtotal
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '16px',
                  fontWeight: '700',
                  color: '#EFE9D6',
                }}
              >
                {formatPrice(subtotal)}
              </span>
            </div>

            {/* Inngest note */}
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 12px',
                backgroundColor: 'rgba(255, 115, 0, 0.08)',
                borderLeft: '2px solid #FF7300',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'rgba(239, 233, 214, 0.7)',
                  margin: 0,
                }}
              >
                Order fulfillment runs on Inngest durable workflows
              </p>
            </div>

            {/* Checkout CTA */}
            <button
              onClick={handleCheckout}
              style={{
                width: '100%',
                backgroundColor: '#FF7300',
                color: '#1A161C',
                border: 'none',
                padding: '14px 24px',
                fontFamily: 'var(--font-space-mono, monospace)',
                fontSize: '12px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#e66800';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FF7300';
              }}
            >
              Proceed to Checkout →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
