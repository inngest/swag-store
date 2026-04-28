'use client';

import * as React from 'react';
import Link from 'next/link';
import { PRODUCTS, formatPrice, type Product } from '@/lib/catalog';
import { Mark } from '@/components/atoms/brand-marks';
import { SectionHead } from '@/components/atoms/SectionHead';
import { WorkflowTracker } from '@/components/atoms/WorkflowTracker';
import { ProductCover } from '@/components/atoms/ProductCover';

export default function CatalogPage() {
  return (
    <div>
      <Hero />
      <BrandBar />
      <CatalogGrid />
      <ManifestoStrip />
    </div>
  );
}

function Hero() {
  const [stepIdx, setStepIdx] = React.useState(1);
  React.useEffect(() => {
    const id = setInterval(() => setStepIdx((i) => (i + 1) % 4), 2400);
    return () => clearInterval(id);
  }, []);

  const trackerSteps = [
    { name: 'capture-payment', detail: 'stripe.payment_intent · usd 28.00', duration: '0.32s' },
    { name: 'reserve-inventory', detail: 'sku INN-TEE-01 · qty 1', duration: '0.18s' },
    { name: 'send-confirmation', detail: 'to: alex@example.com', duration: '0.41s' },
  ];

  return (
    <section style={{ background: 'var(--citrus)', color: 'var(--nebula)', borderBottom: '1px solid var(--ink)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr', padding: '32px 32px 0 32px', minHeight: 520, gap: 32 }}>
        <div style={{ paddingBottom: 40 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 22 }}>
            01 / SWAG · APR 2026 · BUILT DURABLY
          </div>
          <h1 className="display" style={{ fontSize: 'clamp(64px, 11vw, 168px)', lineHeight: 0.86, fontWeight: 400, letterSpacing: '-0.03em', textTransform: 'uppercase', margin: 0, textWrap: 'balance' as any }}>
            Wear<br />the<br />workflow.
          </h1>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 32, maxWidth: 720 }}>
            <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0, maxWidth: 380 }}>
              Four objects. One brand. Every one of them shipped to you by a durable Inngest workflow you can watch run in real-time.
            </p>
            <div className="mono" style={{ fontSize: 11, lineHeight: 1.7, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <div>+ FREE shipping over $40</div>
              <div>+ Ships in 3—5 days</div>
              <div>+ Returns within 30</div>
              <div>+ LA-printed, small batch</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 0, marginTop: 36 }}>
            <button className="btn btn-primary square" onClick={() => document.getElementById('catalog-grid')?.scrollIntoView({ behavior: 'smooth' })}>
              Shop the catalog →
            </button>
            <Link className="btn square" style={{ borderLeft: 0, background: 'transparent', color: 'var(--nebula)' }} href="/orders/ord_demo01">
              See an order ship live ↗
            </Link>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 32 }}>
          <WorkflowTracker steps={trackerSteps} activeIdx={stepIdx > 2 ? 3 : stepIdx} label="fulfill-order.ts" />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--ink)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.4fr 1fr 0.4fr', padding: '16px 32px' }}>
          <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            01.1<br />01.2<br />01.3<br />01.4
          </div>
          <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.55 }}>
            DURABLY YOURS — TEE<br />
            INNGEST HOODIE<br />
            STEP FUNCTION — STICKER PACK<br />
            INNGEST HAT
          </div>
          <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right', alignSelf: 'end' }}>
            <Mark width={28} color="#1A161C" />
          </div>
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

function CatalogGrid() {
  return (
    <section id="catalog-grid">
      <SectionHead
        num="2.0"
        title="THE CATALOG"
        blurb="Four SKUs. No quarter releases, no drops, no scarcity bait. Restocked when stock dips below twenty units of any size — automated by, naturally, an Inngest workflow."
        items={[
          { idx: '2.1', label: 'DURABLY YOURS TEE' },
          { idx: '2.2', label: 'INNGEST HOODIE' },
          { idx: '2.3', label: 'STEP FUNCTION STICKERS' },
          { idx: '2.4', label: 'INNGEST HAT' },
        ]}
      />
      <div className="editorial-grid">
        {PRODUCTS.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
    </section>
  );
}

function ProductCard({ product, index }: { product: Product; index: number }) {
  const [hover, setHover] = React.useState(false);
  return (
    <Link
      href={`/products/${product.slug}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', cursor: 'pointer', padding: 0, display: 'block' }}
    >
      <div style={{ aspectRatio: '1.05 / 1', position: 'relative', overflow: 'hidden', background: 'var(--bone)' }}>
        <ProductCover product={product} />
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          {hover && (
            <div className="mono slide-up" style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '6px 10px', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              VIEW PRODUCT →
            </div>
          )}
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
            <span>{product.sizes && product.sizes.length === 1 ? 'ONE SIZE' : product.sizes ? product.sizes.join(' · ') : 'ONE SIZE'}</span>
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
          Most merch is afterthought. Ours runs on the same primitives we ship to customers. The store you&apos;re shopping was built on a livestream — checkout, fulfillment, and order tracking, all flowing through a durable workflow you can watch from the order page.
        </div>
        <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', alignSelf: 'end' }}>
          — STERLING CHIN<br />
          INNGEST DEVREL, APR 2026
        </div>
      </div>
    </section>
  );
}
