'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { unlockOrderViewing } from '@/app/orders/[orderId]/actions';

function ConfirmationContent() {
  const params = useSearchParams();
  const orderId = params.get('ord') ?? 'ord_demo01';
  const sessionId = params.get('session_id');
  const [email, setEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await unlockOrderViewing(orderId, sessionId);
        if (cancelled) return;
        if ('email' in result) {
          setEmail(result.email);
        } else {
          console.error('[confirmation-unlock] failed', result.error);
        }
      } catch (err) {
        console.error('[confirmation-unlock] threw', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, sessionId]);

  return (
    <div>
      <div style={{ padding: '80px 32px 40px', textAlign: 'center', borderBottom: '1px solid var(--ink)', background: 'var(--citrus)', color: 'var(--nebula)', position: 'relative', overflow: 'hidden' }}>
        <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
          06 / ORDER CONFIRMED · APR 2026
        </div>
        <h1 className="display" style={{ fontSize: 'clamp(72px, 11vw, 168px)', lineHeight: 0.86, fontWeight: 400, letterSpacing: '-0.03em', textTransform: 'uppercase', margin: 0 }}>
          Thanks.
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, maxWidth: 540, margin: '24px auto 0' }}>
          Your payment cleared. An <span className="mono">store/order.placed</span> Inngest event has been fired. Your order will move through three durable steps — you can watch them happen.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', maxWidth: 1100, margin: '0 auto', padding: '48px 32px' }}>
        <div style={{ paddingRight: 32, borderRight: '1px solid var(--rule-soft)' }}>
          <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
            6.1 ORDER ID
          </div>
          <div className="display tabnum" style={{ fontSize: 36, fontWeight: 500, marginTop: 6, letterSpacing: '-0.01em' }}>
            {orderId}
          </div>
          {email && (
            <div className="mono" style={{ fontSize: 11, marginTop: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              EMAILED A COPY · {email.toUpperCase()}
            </div>
          )}
        </div>
        <div style={{ paddingLeft: 32 }}>
          <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
            6.2 NEXT
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, margin: '8px 0 16px' }}>
            Watch your fulfill-order workflow run. Each step publishes a Realtime event the moment it completes.
          </p>
          <Link href={`/orders/${orderId}`} className="btn btn-primary square" style={{ display: 'inline-block' }}>
            WATCH YOUR ORDER SHIP →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading…</div>}>
      <ConfirmationContent />
    </Suspense>
  );
}
