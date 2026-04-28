import * as React from 'react';
import { Logo } from './brand-marks';

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
        <FooterCol title="STORE" links={['Catalog', 'Order status', 'Returns', 'Sizing']} />
        <FooterCol title="INNGEST" links={['Docs', 'Discord', 'GitHub', 'Changelog']} />
        <FooterCol title="BUILT WITH" links={['Next.js 16', 'Stripe Checkout', 'Inngest v4', '@inngest/realtime']} />
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

function FooterCol({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 14 }}>
        {title}
      </div>
      {links.map((l) => (
        <div key={l} style={{ fontSize: 13, padding: '4px 0', cursor: 'pointer' }} className="display">
          <a>{l}</a>
        </div>
      ))}
    </div>
  );
}
