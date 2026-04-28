import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PRODUCTS, getProduct, formatPrice } from '@/lib/catalog';
import { AddToCartButton } from '@/components/AddToCartButton';
import { ProductCover } from '@/components/atoms/ProductCover';
import { SectionHead } from '@/components/atoms/SectionHead';

export async function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const productIndex = PRODUCTS.findIndex((p) => p.id === product.id);
  const others = PRODUCTS.filter((p) => p.id !== product.id);

  return (
    <div>
      {/* Crumb */}
      <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 32px', borderBottom: '1px solid var(--rule-soft)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
        <Link href="/" style={{ cursor: 'pointer' }}>← BACK TO CATALOG</Link>
        <span>{product.cornerTag} · SKU {product.sku}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', borderBottom: '1px solid var(--ink)' }}>
        <div style={{ aspectRatio: '1 / 1', borderRight: '1px solid var(--ink)', position: 'relative' }}>
          <ProductCover product={product} />
          <div className="mono" style={{ position: 'absolute', bottom: 16, left: 16, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: product.cover === 'dark' ? 'var(--paper)' : 'var(--ink)' }}>
            FIG. 01 / FRONT
          </div>
        </div>

        <div style={{ padding: '40px 40px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12 }}>
              {String(productIndex + 1).padStart(2, '0')} / 04 · {product.type.toUpperCase()}
            </div>
            <h1 className="display" style={{ fontSize: 'clamp(56px, 6.5vw, 96px)', lineHeight: 0.92, fontWeight: 400, letterSpacing: '-0.02em', textTransform: 'uppercase', margin: 0 }}>
              {product.name}
            </h1>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginTop: 16 }}>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, maxWidth: 460, color: 'var(--ink)' }}>
                {product.description}
              </p>
              <div className="display tabnum" style={{ fontSize: 44, fontWeight: 400, lineHeight: 1 }}>
                {formatPrice(product.price)}
              </div>
            </div>
          </div>

          <div className="hr-soft" />

          <AddToCartButton product={product} />

          <div className="hr-soft" />

          <div>
            <div className="meta-row mono">
              <span className="plus">+</span>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>FABRIC</span>
                <span>{product.fabric}</span>
              </span>
            </div>
            <div className="meta-row mono">
              <span className="plus">+</span>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>FIT</span>
                <span>{product.fit}</span>
              </span>
            </div>
            <div className="meta-row mono">
              <span className="plus">+</span>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>SHIPS IN</span>
                <span>3—5 BUSINESS DAYS</span>
              </span>
            </div>
            <div className="meta-row mono" style={{ borderBottom: 'none' }}>
              <span className="plus">+</span>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>FULFILLMENT</span>
                <span>RUNS ON INNGEST · 3 STEPS</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <section>
        <SectionHead num="2.5" title="ALSO IN STOCK" blurb="Pair the tee with the hoodie. Add the hat to your kit. Stickers go on the laptop." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid var(--ink)' }}>
          {others.map((p, i) => (
            <Link
              key={p.id}
              href={`/products/${p.slug}`}
              style={{ aspectRatio: '1/1.1', borderRight: i < 2 ? '1px solid var(--ink)' : 'none', cursor: 'pointer', position: 'relative', display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ flex: 1, position: 'relative' }}>
                <ProductCover product={p} />
              </div>
              <div style={{ padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'end', borderTop: '1px solid var(--rule-soft)', background: 'var(--paper)' }}>
                <div className="display" style={{ fontSize: 18, fontWeight: 500 }}>{p.name}</div>
                <div className="display tabnum" style={{ fontSize: 18 }}>{formatPrice(p.price)}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
