'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart-context';

export function Navbar() {
  const { itemCount, openCart } = useCart();

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: '#1A161C',
        borderBottom: '1px solid rgba(239, 233, 214, 0.12)',
      }}
    >
      <nav
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 24px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            textDecoration: 'none',
          }}
        >
          {/* Inngest wordmark SVG */}
          <svg width="90" height="18" viewBox="0 0 90 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <text
              x="0"
              y="15"
              fontFamily="var(--font-space-grotesk, Space Grotesk, sans-serif)"
              fontWeight="700"
              fontSize="17"
              letterSpacing="-0.5"
              fill="#EFE9D6"
            >
              INNGEST
            </text>
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-space-mono, Space Mono, monospace)',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: '#FF7300',
              paddingTop: '2px',
            }}
          >
            SWAG
          </span>
        </Link>

        {/* Nav links + cart */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <Link
            href="/"
            style={{
              fontFamily: 'var(--font-space-mono, Space Mono, monospace)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(239, 233, 214, 0.6)',
              textDecoration: 'none',
            }}
          >
            Catalog
          </Link>
          <Link
            href="/admin"
            style={{
              fontFamily: 'var(--font-space-mono, Space Mono, monospace)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(239, 233, 214, 0.6)',
              textDecoration: 'none',
            }}
          >
            Admin
          </Link>

          {/* Cart button */}
          <button
            onClick={openCart}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: '1px solid rgba(239, 233, 214, 0.2)',
              color: '#EFE9D6',
              padding: '6px 14px',
              cursor: 'pointer',
              fontFamily: 'var(--font-space-mono, Space Mono, monospace)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              transition: 'border-color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#FF7300';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239, 233, 214, 0.2)';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
            Cart
            {itemCount > 0 && (
              <span
                style={{
                  backgroundColor: '#FF7300',
                  color: '#1A161C',
                  borderRadius: '50%',
                  width: '18px',
                  height: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: '700',
                }}
              >
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </nav>
    </header>
  );
}
