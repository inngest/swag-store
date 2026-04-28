import Link from 'next/link';
import { PRODUCTS, formatPrice } from '@/lib/catalog';

export default function CatalogPage() {
  const all = PRODUCTS;

  return (
    <div style={{ backgroundColor: '#1A161C', minHeight: '100vh' }}>

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section
        style={{
          borderBottom: '1px solid rgba(239, 233, 214, 0.12)',
          padding: '80px 24px 72px',
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '48px',
          alignItems: 'end',
        }}
      >
        <div>
          {/* Eyebrow */}
          <div
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: '#FF7300',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span style={{ display: 'inline-block', width: '24px', height: '1px', backgroundColor: '#FF7300' }} />
            Official Inngest Merchandise
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: 'var(--font-space-grotesk, sans-serif)',
              fontWeight: '700',
              fontSize: 'clamp(56px, 8vw, 96px)',
              textTransform: 'uppercase',
              letterSpacing: '-0.03em',
              lineHeight: '0.92',
              color: '#EFE9D6',
              margin: '0 0 32px',
            }}
          >
            Durably<br />
            <span style={{ color: '#FF7300' }}>Yours.</span>
          </h1>

          <p
            style={{
              fontFamily: 'var(--font-space-grotesk, sans-serif)',
              fontSize: '18px',
              lineHeight: '1.6',
              color: 'rgba(239, 233, 214, 0.65)',
              maxWidth: '420px',
              margin: '0 0 40px',
            }}
          >
            Swag for engineers who know that every dropped step is a moral failing.
            Ships via Inngest durable workflows.
          </p>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: '40px' }}>
            {[
              { label: 'Products', value: `${all.length}` },
              { label: 'Workflow Steps', value: '5' },
              { label: 'Retry Failures', value: '0' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div
                  style={{
                    fontFamily: 'var(--font-space-mono, monospace)',
                    fontSize: '28px',
                    fontWeight: '700',
                    color: '#EFE9D6',
                    lineHeight: 1,
                    marginBottom: '4px',
                  }}
                >
                  {value}
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
        </div>

        {/* Hero visual — workflow diagram decoration */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            alignSelf: 'center',
          }}
        >
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
          {[
            { label: 'step.run("capture-payment")', state: 'done' },
            { label: 'step.run("reserve-inventory")', state: 'active' },
            { label: 'step.run("send-confirmation")', state: 'pending' },
          ].map((step, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 16px',
                backgroundColor: step.state === 'active' ? 'rgba(255, 115, 0, 0.08)' : 'rgba(54, 44, 64, 0.3)',
                borderLeft: `2px solid ${step.state === 'done' ? '#59A569' : step.state === 'active' ? '#FF7300' : 'rgba(239, 233, 214, 0.1)'}`,
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: step.state === 'done' ? '#59A569' : step.state === 'active' ? '#FF7300' : 'rgba(239, 233, 214, 0.2)',
                  flexShrink: 0,
                  animation: step.state === 'active' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '12px',
                  color: step.state === 'done' ? '#59A569' : step.state === 'active' ? '#FF7300' : 'rgba(239, 233, 214, 0.3)',
                }}
              >
                {step.label}
              </span>
              {step.state === 'done' && (
                <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '10px', color: '#59A569' }}>✓</span>
              )}
              {step.state === 'active' && (
                <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '10px', color: '#FF7300' }}>running</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Product Grid ─────────────────────────────────────── */}
      <section
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '64px 24px',
        }}
      >
        {/* Section header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: '32px',
            paddingBottom: '16px',
            borderBottom: '1px solid rgba(239, 233, 214, 0.12)',
          }}
        >
          <div>
            <span
              style={{
                fontFamily: 'var(--font-space-mono, monospace)',
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#FF7300',
                display: 'block',
                marginBottom: '6px',
              }}
            >
              01 — All Products
            </span>
            <h2
              style={{
                fontFamily: 'var(--font-space-grotesk, sans-serif)',
                fontWeight: '700',
                fontSize: '28px',
                color: '#EFE9D6',
                margin: 0,
                textTransform: 'uppercase',
              }}
            >
              The Full Catalog
            </h2>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '11px',
              color: 'rgba(239, 233, 214, 0.4)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {all.length} items
          </span>
        </div>

        {/* Product grid — 1px gap creates grid-line effect on dark bg */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1px',
            backgroundColor: 'rgba(239, 233, 214, 0.08)',
          }}
        >
          {all.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              style={{ textDecoration: 'none' }}
            >
              <div
                className="product-card-item"
                style={{
                  backgroundColor: '#1A161C',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Product image placeholder */}
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '4/3',
                    background: product.imagePlaceholder,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <span style={{ fontSize: '64px', opacity: 0.25 }}>
                    {product.category === 'apparel'
                      ? product.id.includes('hoodie') ? '🧥' : '👕'
                      : product.id.includes('sticker') ? '🏷️' : '📌'}
                  </span>

                  {/* Tags */}
                  <div style={{ position: 'absolute', top: '12px', left: '12px', display: 'flex', gap: '6px' }}>
                    {product.tags.slice(0, 1).map((tag) => (
                      <span
                        key={tag}
                        style={{
                          backgroundColor: tag === 'featured' ? '#FF7300' : tag === 'new' ? '#006250' : '#362C40',
                          color: '#EFE9D6',
                          fontFamily: 'var(--font-space-mono, monospace)',
                          fontSize: '9px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          padding: '3px 8px',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Orange bottom edge on featured */}
                  {product.featured && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', backgroundColor: '#FF7300' }} />
                  )}
                </div>

                {/* Product info */}
                <div
                  style={{
                    padding: '20px 24px 24px',
                    borderTop: '1px solid rgba(239, 233, 214, 0.08)',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-space-mono, monospace)',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'rgba(239, 233, 214, 0.4)',
                      marginBottom: '6px',
                    }}
                  >
                    {product.category}
                  </div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-space-grotesk, sans-serif)',
                      fontWeight: '700',
                      fontSize: '20px',
                      color: '#EFE9D6',
                      margin: '0 0 4px',
                      textTransform: 'uppercase',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {product.name}
                  </h3>
                  <p
                    style={{
                      fontFamily: 'var(--font-space-grotesk, sans-serif)',
                      fontSize: '13px',
                      color: 'rgba(239, 233, 214, 0.5)',
                      margin: '0 0 16px',
                      lineHeight: '1.4',
                      flex: 1,
                    }}
                  >
                    {product.tagline}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-space-mono, monospace)',
                        fontSize: '18px',
                        fontWeight: '700',
                        color: '#FF7300',
                      }}
                    >
                      {formatPrice(product.price)}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-space-mono, monospace)',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'rgba(239, 233, 214, 0.4)',
                      }}
                    >
                      View →
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: '1px solid rgba(239, 233, 214, 0.12)',
          padding: '32px 24px',
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-space-mono, monospace)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'rgba(239, 233, 214, 0.3)',
          }}
        >
          Inngest Swag Store — Powered by Inngest Durable Workflows
        </span>
        <Link
          href="https://inngest.com"
          target="_blank"
          style={{
            fontFamily: 'var(--font-space-mono, monospace)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: '#FF7300',
            textDecoration: 'none',
          }}
        >
          inngest.com →
        </Link>
      </footer>
    </div>
  );
}
