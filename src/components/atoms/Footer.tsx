import * as React from 'react';
import Link from 'next/link';
import { Logo } from './brand-marks';

type FooterItem = { label: string; href?: string; external?: boolean };

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--ink)', marginTop: 64, background: 'var(--paper)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', padding: '32px', gap: 32 }}>
        <div>
          <div style={{ marginBottom: 16 }}><Logo width={130} color="#1A161C" /></div>
          <div style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 320, color: 'var(--muted)' }}>
            The official Inngest swag store. Built on Inngest. Yes, every order you place runs through a durable workflow we wrote on a livestream.
          </div>
        </div>
        <FooterCol
          title="STORE"
          items={[{ label: 'Catalog', href: '/#catalog-grid' }]}
        />
        <FooterCol
          title="INNGEST"
          items={[
            { label: 'Docs', href: 'https://www.inngest.com/docs', external: true },
            { label: 'Discord', href: 'https://www.inngest.com/discord', external: true },
            { label: 'GitHub', href: 'https://github.com/inngest/inngest', external: true },
            { label: 'Changelog', href: 'https://www.inngest.com/changelog', external: true },
          ]}
        />
        <FooterCol
          title="BUILT WITH"
          items={[{ label: 'Next.js 16' }, { label: 'Stripe Checkout' }, { label: 'Inngest v4' }, { label: '@inngest/realtime' }]}
        />
      </div>
      <div className="hr" />
      <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 32px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
        <span>© 2026 Inngest, Inc.</span>
        <span>V1.0 — 2026 / SWAG.INNGEST.COM</span>
        <span>built durably</span>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: FooterItem[] }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 14 }}>
        {title}
      </div>
      {items.map((item) => (
        <div key={item.label} style={{ fontSize: 13, padding: '4px 0' }} className="display">
          {item.href ? (
            item.external ? (
              <a href={item.href} target="_blank" rel="noopener" style={{ cursor: 'pointer' }}>{item.label}</a>
            ) : (
              <Link href={item.href} style={{ cursor: 'pointer' }}>{item.label}</Link>
            )
          ) : (
            <span>{item.label}</span>
          )}
        </div>
      ))}
    </div>
  );
}
