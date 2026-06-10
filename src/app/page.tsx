import Link from 'next/link';
import { formatPrice, type Product } from '@/lib/catalog';
import { listPublicProducts } from '@/lib/store-db';
import { Mark } from '@/components/atoms/brand-marks';
import { SectionHead } from '@/components/atoms/SectionHead';
import { WorkflowTracker } from '@/components/atoms/WorkflowTracker';
import { ProductCover } from '@/components/atoms/ProductCover';

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const products = await listPublicProducts();
  return (
    <div>
      <Hero />
      <BrandBar />
      <CatalogGrid products={products} />
      <ManifestoStrip />
    </div>
  );
}

function Hero() {
  const trackerSteps = [
    { name: 'capture-payment', detail: 'stripe.payment_intent · usd 28.00', duration: '0.32s' },
    { name: 'reserve-inventory', detail: 'sku INN-TEE-01 · qty 1', duration: '0.18s' },
    { name: 'record-order', detail: 'status: pending · db: railway', duration: '0.41s' },
  ];

  return (
    <section style={{ background: 'var(--hero-bg)', color: 'var(--hero-fg)', borderBottom: '1px solid var(--ink)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr', padding: '32px 32px 0 32px', minHeight: 520, gap: 32 }}>
        <div style={{ paddingBottom: 40 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 22 }}>
            01 / SWAG · APR 2026 · BUILT DURABLY
          </div>
          <h1 className="display" style={{ fontSize: 'clamp(64px, 11vw, 168px)', lineHeight: 0.86, fontWeight: 400, letterSpacing: '-0.03em', textTransform: 'uppercase', margin: 0, textWrap: 'balance' }}>
            Wear<br />the<br />workflow.
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.55, margin: '32px 0 0', maxWidth: 380 }}>
            Office-stock swag, shipped by a durable Inngest workflow you can watch run in real-time.
          </p>
          <div style={{ display: 'flex', gap: 0, marginTop: 36 }}>
            <Link className="btn btn-primary btn-hero-primary square" href="#catalog-grid">
              Shop the catalog →
            </Link>
            <Link className="btn btn-hero-secondary square" href="/orders/ord_demo01">
              See an order ship live ↗
            </Link>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 32 }}>
          <WorkflowTracker steps={trackerSteps} activeIdx={1} label="fulfill-order.ts" />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--ink)', background: 'var(--hero-strip-bg)', color: 'var(--hero-strip-fg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px' }}>
          <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            BUILT DURABLY
          </div>
          <Mark width={28} />
        </div>
      </div>
    </section>
  );
}

function BrandBar() {
  const items: Array<[string, string, string]> = [
    ['01', 'DURABLE BY DEFAULT', 'Every order is a workflow'],
    ['02', 'REALTIME STATUS', 'Watch each step complete'],
    ['03', 'EDITORIAL PRECISION', 'Brand-aligned, zero radius'],
    ['04', 'STRIPE-NATIVE', 'Hosted, secure, boring'],
  ];
  return (
    <div style={{ background: 'var(--nebula)', color: 'var(--paper)', borderBottom: '1px solid var(--ink)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', padding: '20px 32px', gap: 32 }}>
        {items.map(([n, t, sub]) => (
          <div key={n} className="mono" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14, alignItems: 'start' }}>
            <span style={{ fontSize: 11, color: 'var(--citrus)' }}>{n}</span>
            <div>
              <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{t}</div>
              <div style={{ fontSize: 11, color: 'rgba(245, 240, 232, 0.6)' }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CatalogGrid({ products }: { products: Product[] }) {
  return (
    <section id="catalog-grid" style={{ scrollMarginTop: 80 }}>
      <SectionHead
        num="2.0"
        title="THE CATALOG"
        blurb="The orderable office inventory from the Swag Inventory page. Railway Postgres is the live backend; Inngest reserves stock during fulfillment."
        items={products.slice(0, 5).map((product, index) => ({
          idx: `2.${index + 1}`,
          label: product.name.toUpperCase(),
        }))}
      />
      <div className="editorial-grid">
        {products.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
    </section>
  );
}

function ProductCard({ product, index }: { product: Product; index: number }) {
  const totalStock = product.variants.reduce((sum, variant) => sum + variant.stock, 0);
  return (
    <Link
      href={`/products/${product.slug}`}
      style={{ position: 'relative', cursor: 'pointer', padding: 0, display: 'block' }}
    >
      <div style={{ aspectRatio: '1.05 / 1', position: 'relative', overflow: 'hidden', background: 'var(--bone)' }}>
        <ProductCover product={product} index={index} />
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div className="mono" style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '6px 10px', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {totalStock > 0 ? `${totalStock} IN STOCK` : 'SOLD OUT'}
          </div>
        </div>
      </div>
      <div style={{ padding: '20px 24px 24px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'end' }}>
        <div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            {String(index + 1).padStart(2, '0')} · {product.type}
          </div>
          <div className="display" style={{ fontSize: 28, fontWeight: 500, lineHeight: 1.05, marginBottom: 8 }}>
            {product.name}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5, maxWidth: 440 }}>
            {product.blurb}
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 14, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', gap: 14 }}>
            <span>SKU {product.sku}</span>
            <span>·</span>
            <span>{product.sizes?.length ? product.sizes.join(' · ') : 'ONE SIZE'}</span>
          </div>
        </div>
        <div className="display tabnum" style={{ fontSize: 36, fontWeight: 400, lineHeight: 1 }}>
          {formatPrice(product.price)}
        </div>
      </div>
    </Link>
  );
}

function ManifestoStrip() {
  return (
    <section style={{ borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)', padding: '56px 32px', background: 'var(--bone)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '0.4fr 1fr 0.5fr', gap: 32 }}>
        <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
          3.0<br />MANIFESTO
        </div>
        <div className="display" style={{ fontSize: 'clamp(28px, 3.5vw, 48px)', lineHeight: 1.05, fontWeight: 400, letterSpacing: '-0.01em', maxWidth: 920 }}>
          Most merch is afterthought. Ours runs on the same primitives we ship to customers. Checkout, fulfillment, inventory reservation, and order tracking all flow through a durable workflow backed by Railway Postgres.
        </div>
        <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', alignSelf: 'end' }}>
          — STERLING CHIN<br />
          INNGEST DEVREL, APR 2026
        </div>
      </div>
    </section>
  );
}
