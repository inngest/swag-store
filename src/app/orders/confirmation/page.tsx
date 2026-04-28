// ─── Order Confirmation Page ───────────────────────────────────────────────
// Stripe redirects back here after successful checkout.
// URL: /orders/confirmation?session_id=xxx
// We read the session ID, fetch order details, display confirmation, then
// redirect to /orders/[orderId] where the workflow status lives.

import Link from 'next/link';

export default function ConfirmationPage() {
  return (
    <div
      style={{
        backgroundColor: '#1A161C',
        minHeight: 'calc(100vh - 56px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          maxWidth: '560px',
          width: '100%',
          padding: '0 24px',
          textAlign: 'center',
        }}
      >
        {/* Check mark */}
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            backgroundColor: 'rgba(89, 165, 105, 0.12)',
            border: '1px solid #59A569',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 32px',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#59A569" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-space-mono, monospace)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: '#59A569',
            marginBottom: '12px',
          }}
        >
          Payment Confirmed
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-space-grotesk, sans-serif)',
            fontWeight: '700',
            fontSize: 'clamp(32px, 5vw, 48px)',
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            color: '#EFE9D6',
            margin: '0 0 16px',
          }}
        >
          You&rsquo;re in the queue.
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-space-grotesk, sans-serif)',
            fontSize: '16px',
            lineHeight: '1.6',
            color: 'rgba(239, 233, 214, 0.6)',
            margin: '0 0 40px',
          }}
        >
          Your Inngest workflow just fired. We&rsquo;re capturing payment, reserving inventory,
          and sending your order to fulfillment — all in a durable, retry-safe workflow.
        </p>

        {/* Workflow callout */}
        <div
          style={{
            padding: '20px 24px',
            border: '1px solid rgba(255, 115, 0, 0.2)',
            backgroundColor: 'rgba(255, 115, 0, 0.04)',
            marginBottom: '32px',
            textAlign: 'left',
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
            Inngest Event Fired
          </div>
          <div
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '13px',
              color: 'rgba(239, 233, 214, 0.7)',
              lineHeight: '1.5',
            }}
          >
            <span style={{ color: '#CBB26A' }}>inngest</span>
            <span style={{ color: 'rgba(239, 233, 214, 0.4)' }}>.</span>
            <span style={{ color: '#FF7300' }}>send</span>
            <span style={{ color: 'rgba(239, 233, 214, 0.4)' }}>{'({'}</span>
            <br />
            <span style={{ paddingLeft: '16px', color: '#EFE9D6' }}>
              name: <span style={{ color: '#CBB26A' }}>&ldquo;store/order.placed&rdquo;</span>
            </span>
            <br />
            <span style={{ color: 'rgba(239, 233, 214, 0.4)' }}>{'});'}</span>
          </div>
        </div>

        <Link
          href="/orders/demo-order"
          style={{
            display: 'inline-block',
            backgroundColor: '#FF7300',
            color: '#1A161C',
            fontFamily: 'var(--font-space-mono, monospace)',
            fontSize: '12px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            padding: '14px 32px',
            textDecoration: 'none',
            marginBottom: '16px',
          }}
        >
          Track Your Order →
        </Link>

        <div>
          <Link
            href="/"
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'rgba(239, 233, 214, 0.35)',
              textDecoration: 'none',
            }}
          >
            ← Back to Store
          </Link>
        </div>
      </div>
    </div>
  );
}
