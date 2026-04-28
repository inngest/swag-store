import { notFound } from 'next/navigation';
import { PRODUCTS, getProduct, formatPrice } from '@/lib/catalog';
import { AddToCartButton } from '@/components/AddToCartButton';

export async function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const productEmoji =
    product.category === 'apparel'
      ? product.id.includes('hoodie') ? '🧥' : '👕'
      : product.id.includes('sticker') ? '🏷️' : '📌';

  return (
    <div style={{ backgroundColor: '#1A161C', minHeight: '100vh' }}>
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '48px 24px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '80px',
          alignItems: 'start',
        }}
      >
        {/* ─── Left: Product Image ─── */}
        <div style={{ position: 'sticky', top: '80px' }}>
          {/* Breadcrumb */}
          <div
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(239, 233, 214, 0.4)',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <a href="/" style={{ color: 'inherit', textDecoration: 'none' }}>Catalog</a>
            <span>/</span>
            <span style={{ color: '#FF7300' }}>{product.name}</span>
          </div>

          {/* Main image */}
          <div
            style={{
              width: '100%',
              aspectRatio: '1/1',
              background: product.imagePlaceholder,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              marginBottom: '16px',
            }}
          >
            <span style={{ fontSize: '120px', opacity: 0.2 }}>{productEmoji}</span>

            {/* Corner tag */}
            {product.featured && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  backgroundColor: '#FF7300',
                  color: '#1A161C',
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '9px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  padding: '6px 12px',
                }}
              >
                Featured
              </div>
            )}
          </div>

          {/* Thumbnail strip — placeholder dots */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: '64px',
                  height: '64px',
                  background: i === 0 ? product.imagePlaceholder : 'rgba(54, 44, 64, 0.5)',
                  border: `1px solid ${i === 0 ? '#FF7300' : 'rgba(239, 233, 214, 0.1)'}`,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>

        {/* ─── Right: Product Info ─── */}
        <div>
          {/* Category */}
          <div
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: '#FF7300',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>{product.category}</span>
            {product.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  backgroundColor: 'rgba(255, 115, 0, 0.12)',
                  color: '#FF7300',
                  padding: '2px 6px',
                  fontSize: '9px',
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Product name */}
          <h1
            style={{
              fontFamily: 'var(--font-space-grotesk, sans-serif)',
              fontWeight: '700',
              fontSize: 'clamp(36px, 5vw, 56px)',
              textTransform: 'uppercase',
              letterSpacing: '-0.02em',
              lineHeight: '0.95',
              color: '#EFE9D6',
              margin: '0 0 16px',
            }}
          >
            {product.name}
          </h1>

          {/* Tagline */}
          <p
            style={{
              fontFamily: 'var(--font-space-grotesk, sans-serif)',
              fontSize: '18px',
              color: 'rgba(239, 233, 214, 0.6)',
              margin: '0 0 32px',
              lineHeight: '1.5',
              fontStyle: 'italic',
            }}
          >
            {product.tagline}
          </p>

          {/* Price */}
          <div
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '36px',
              fontWeight: '700',
              color: '#FF7300',
              marginBottom: '32px',
              paddingBottom: '32px',
              borderBottom: '1px solid rgba(239, 233, 214, 0.12)',
            }}
          >
            {formatPrice(product.price)}
          </div>

          {/* Add to cart — client component */}
          <AddToCartButton product={product} />

          {/* Description */}
          <div
            style={{
              marginTop: '40px',
              paddingTop: '32px',
              borderTop: '1px solid rgba(239, 233, 214, 0.12)',
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-space-mono, monospace)',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'rgba(239, 233, 214, 0.5)',
                marginBottom: '16px',
              }}
            >
              Description
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-space-grotesk, sans-serif)',
                fontSize: '16px',
                lineHeight: '1.7',
                color: 'rgba(239, 233, 214, 0.75)',
              }}
            >
              {product.description}
            </p>
          </div>

          {/* Inngest workflow callout */}
          <div
            style={{
              marginTop: '32px',
              padding: '20px 24px',
              backgroundColor: 'rgba(255, 115, 0, 0.06)',
              borderLeft: '2px solid #FF7300',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-space-mono, monospace)',
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#FF7300',
                marginBottom: '8px',
              }}
            >
              Powered by Inngest
            </div>
            <p
              style={{
                fontFamily: 'var(--font-space-grotesk, sans-serif)',
                fontSize: '14px',
                color: 'rgba(239, 233, 214, 0.6)',
                margin: 0,
                lineHeight: '1.5',
              }}
            >
              Every order runs through a 5-step durable workflow — payment capture, inventory reservation,
              fulfillment, shipping, and confirmation. Zero dropped steps. Automatic retries. Watch it live on your order status page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
