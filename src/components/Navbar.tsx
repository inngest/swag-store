'use client';

import * as React from 'react';
import Link from 'next/link';
import { Show, SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs';
import { useCart } from '@/lib/cart-context';
import { Logo } from './atoms/brand-marks';

const TICKER_ITEMS = [
  'FREE STICKER WITH ORDERS OVER $40',
  'BUILT ON INNGEST · WATCH YOUR ORDER FLOW IN REAL-TIME',
  'LIVE: PLUGIN ALPHA NOW IN DISCORD',
  'SHIPS WORLDWIDE · LA-PRINTED',
  'STEP.RUN("SHIP_SWAG") → COMPLETE',
  'EVERY ORDER IS A DURABLE WORKFLOW',
];

function TopTicker() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div style={{ background: 'var(--nebula)', color: 'var(--paper)', overflow: 'hidden', borderBottom: '1px solid var(--ink)' }}>
      <div className="marquee-track mono" style={{ padding: '10px 0', whiteSpace: 'nowrap', fontSize: 11, letterSpacing: '0.1em' }}>
        {items.map((t, i) => (
          <span key={i} style={{ padding: '0 28px', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 4, height: 4, background: 'var(--citrus)' }} />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Navbar() {
  const { itemCount, openCart } = useCart();
  const [hover, setHover] = React.useState<string | null>(null);
  const [bumped, setBumped] = React.useState(false);
  const lastCount = React.useRef(itemCount);

  React.useEffect(() => {
    if (itemCount > lastCount.current) {
      setBumped(true);
      const id = setTimeout(() => setBumped(false), 320);
      lastCount.current = itemCount;
      return () => clearTimeout(id);
    }
    lastCount.current = itemCount;
  }, [itemCount]);

  // Admin tab is allowlist-gated: the server decides (/api/admin/me returns a
  // bare boolean), re-checked whenever the Clerk session changes. Customers
  // never see it; admins get it back in the nav.
  const { user, isLoaded } = useUser();
  const [isAdmin, setIsAdmin] = React.useState(false);
  React.useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    fetch('/api/admin/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { isAdmin: false }))
      .then((d) => {
        if (!cancelled) setIsAdmin(Boolean(d.isAdmin));
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, user?.id]);

  const links: Array<{ id: string; label: string; href: string; external?: boolean }> = [
    { id: 'catalog', label: 'Catalog', href: '/#catalog-grid' },
    { id: 'docs', label: 'Inngest Docs', href: 'https://www.inngest.com/docs', external: true },
    { id: 'discord', label: 'Inngest Discord', href: 'https://www.inngest.com/discord', external: true },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', href: '/admin' }] : []),
  ];

  return (
    <>
      <TopTicker />
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--paper)', borderBottom: '1px solid var(--ink)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', padding: '18px 32px', gap: 24 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 18, cursor: 'pointer' }}>
            <Logo width={112} color="#1A161C" />
            <div className="mono" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderLeft: '1px solid var(--rule-soft)', paddingLeft: 14 }}>
              SWAG STORE<br />V1.0 — 2026
            </div>
          </Link>
          <nav style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
            {links.map((l) => (
              <Link
                key={l.id}
                href={l.href}
                target={l.external ? '_blank' : undefined}
                rel={l.external ? 'noopener' : undefined}
                onMouseEnter={() => setHover(l.id)}
                onMouseLeave={() => setHover(null)}
                className="mono nav-pill"
                style={{ padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', position: 'relative' }}
              >
                {l.label}
                {hover === l.id && <span style={{ position: 'absolute', bottom: 4, left: 16, right: 16, height: 1, background: 'var(--citrus)' }} />}
              </Link>
            ))}
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="mono nav-pill" style={{ padding: '10px 12px', border: '1px solid var(--ink)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  SIGN IN
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="mono nav-pill" style={{ padding: '10px 12px', border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  SIGN UP
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <span className="live-dot" style={{ display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} />
              REALTIME ON
            </span>
            <button
              onClick={openCart}
              className="mono nav-pill"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', border: '1px solid var(--ink)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}
            >
              <span>CART</span>
              <span
                className={bumped ? 'bump' : ''}
                style={{
                  minWidth: 22,
                  height: 22,
                  background: itemCount > 0 ? 'var(--citrus)' : 'transparent',
                  color: itemCount > 0 ? 'var(--nebula)' : 'var(--ink)',
                  border: itemCount > 0 ? '0' : '1px solid var(--ink)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {itemCount}
              </span>
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
