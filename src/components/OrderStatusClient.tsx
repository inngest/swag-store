'use client';

// ─── Order Status Page — THE INNGEST MONEYSHOT ──────────────────────────────
// This is the centerpiece of the livestream demo. It shows a real-time view
// of the Inngest durable workflow executing after checkout.
//
// In production:
//   - Poll GET /api/orders/:id/status (which reads from Inngest run status)
//   - Or use Inngest Realtime (step.waitForEvent with SSE) to push updates
//   - Each step maps to a step.run() call in the inngest/functions/fulfill-order.ts
//
// For the demo: auto-advances through steps on a timer to show the UI.

import { useState, useEffect } from 'react';
import { FULFILLMENT_STEPS, WorkflowStep, FulfillmentStatus } from '@/lib/catalog';
import Link from 'next/link';

// Step durations for the demo animation (ms)
const STEP_DURATIONS = [1800, 2400, 3200, 2100, 1600];

type StepState = WorkflowStep & { startedAt?: number; elapsed?: number };

function StatusIcon({ status }: { status: FulfillmentStatus }) {
  if (status === 'complete') {
    return (
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          backgroundColor: 'rgba(89, 165, 105, 0.15)',
          border: '1px solid #59A569',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#59A569',
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  if (status === 'running') {
    return (
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 115, 0, 0.1)',
          border: '1px solid #FF7300',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <div
          style={{
            width: '14px',
            height: '14px',
            border: '2px solid rgba(255, 115, 0, 0.2)',
            borderTopColor: '#FF7300',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }}
        />
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 68, 68, 0.1)',
          border: '1px solid #FF4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FF4444',
          flexShrink: 0,
        }}
      >
        ✕
      </div>
    );
  }
  return (
    <div
      style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        border: '1px solid rgba(239, 233, 214, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: 'rgba(239, 233, 214, 0.2)',
        }}
      />
    </div>
  );
}

export function OrderStatusClient({ orderId }: { orderId: string }) {
  const [steps, setSteps] = useState<StepState[]>(
    FULFILLMENT_STEPS.map((s) => ({ ...s, status: 'pending' as FulfillmentStatus }))
  );
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [allComplete, setAllComplete] = useState(false);
  const [elapsedTotal, setElapsedTotal] = useState(0);

  // Simulate step advancement
  useEffect(() => {
    if (currentStep >= FULFILLMENT_STEPS.length) {
      setAllComplete(true);
      return;
    }

    // Mark current step as running
    setSteps((prev) =>
      prev.map((s, i) =>
        i === currentStep ? { ...s, status: 'running', startedAt: Date.now() } : s
      )
    );

    const duration = STEP_DURATIONS[currentStep] ?? 2000;
    const timer = setTimeout(() => {
      // Mark current step complete
      setSteps((prev) =>
        prev.map((s, i) =>
          i === currentStep
            ? { ...s, status: 'complete', completedAt: new Date().toISOString(), duration }
            : s
        )
      );
      setElapsedTotal((t) => t + duration);
      setCurrentStep((c) => c + 1);
    }, duration);

    return () => clearTimeout(timer);
  }, [currentStep]);

  const completedCount = steps.filter((s) => s.status === 'complete').length;
  const progressPct = (completedCount / steps.length) * 100;

  return (
    <div style={{ backgroundColor: '#1A161C', minHeight: 'calc(100vh - 56px)' }}>
      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          padding: '48px 24px',
        }}
      >
        {/* ─── Header ─── */}
        <div style={{ marginBottom: '48px' }}>
          <div
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: '#FF7300',
              marginBottom: '8px',
            }}
          >
            Order Status
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-space-grotesk, sans-serif)',
              fontWeight: '700',
              fontSize: 'clamp(32px, 5vw, 48px)',
              textTransform: 'uppercase',
              letterSpacing: '-0.02em',
              color: '#EFE9D6',
              margin: '0 0 8px',
            }}
          >
            {allComplete ? 'Order Confirmed' : 'Processing Order'}
          </h1>
          <div
            style={{
              fontFamily: 'var(--font-space-mono, monospace)',
              fontSize: '12px',
              color: 'rgba(239, 233, 214, 0.4)',
              letterSpacing: '0.05em',
            }}
          >
            {orderId}
          </div>
        </div>

        {/* ─── Two-column layout ─── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: '40px',
            alignItems: 'start',
          }}
        >
          {/* ─── Left: Workflow Steps ─── */}
          <div>
            {/* Inngest branding header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
                paddingBottom: '16px',
                borderBottom: '1px solid rgba(239, 233, 214, 0.1)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF7300" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <span
                  style={{
                    fontFamily: 'var(--font-space-mono, monospace)',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: '#FF7300',
                  }}
                >
                  Inngest Workflow — fulfill-order
                </span>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: allComplete ? '#59A569' : 'rgba(239, 233, 214, 0.35)',
                }}
              >
                {completedCount}/{steps.length} steps
              </span>
            </div>

            {/* Progress bar */}
            <div
              style={{
                width: '100%',
                height: '2px',
                backgroundColor: 'rgba(239, 233, 214, 0.08)',
                marginBottom: '28px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  width: `${progressPct}%`,
                  backgroundColor: '#FF7300',
                  transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
            </div>

            {/* Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {steps.map((step, i) => (
                <div
                  key={step.id}
                  style={{
                    display: 'flex',
                    gap: '16px',
                    padding: '16px 20px',
                    backgroundColor:
                      step.status === 'running'
                        ? 'rgba(255, 115, 0, 0.05)'
                        : step.status === 'complete'
                        ? 'rgba(89, 165, 105, 0.03)'
                        : 'rgba(54, 44, 64, 0.2)',
                    borderLeft: `2px solid ${
                      step.status === 'complete'
                        ? '#59A569'
                        : step.status === 'running'
                        ? '#FF7300'
                        : step.status === 'failed'
                        ? '#FF4444'
                        : 'rgba(239, 233, 214, 0.08)'
                    }`,
                    transition: 'all 0.3s ease',
                  }}
                >
                  <StatusIcon status={step.status} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Step function name */}
                    <div
                      style={{
                        fontFamily: 'var(--font-space-mono, monospace)',
                        fontSize: '13px',
                        color:
                          step.status === 'complete'
                            ? '#59A569'
                            : step.status === 'running'
                            ? '#FF7300'
                            : step.status === 'failed'
                            ? '#FF4444'
                            : 'rgba(239, 233, 214, 0.25)',
                        marginBottom: '4px',
                        letterSpacing: '0',
                      }}
                    >
                      {step.name}
                    </div>
                    {/* Description */}
                    <div
                      style={{
                        fontFamily: 'var(--font-space-grotesk, sans-serif)',
                        fontSize: '13px',
                        color:
                          step.status === 'pending'
                            ? 'rgba(239, 233, 214, 0.2)'
                            : 'rgba(239, 233, 214, 0.55)',
                      }}
                    >
                      {step.description}
                    </div>
                  </div>

                  {/* Duration / status badge */}
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    {step.status === 'complete' && step.duration && (
                      <span
                        style={{
                          fontFamily: 'var(--font-space-mono, monospace)',
                          fontSize: '10px',
                          color: 'rgba(239, 233, 214, 0.3)',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {(step.duration / 1000).toFixed(1)}s
                      </span>
                    )}
                    {step.status === 'running' && (
                      <span
                        style={{
                          fontFamily: 'var(--font-space-mono, monospace)',
                          fontSize: '10px',
                          color: '#FF7300',
                          letterSpacing: '0.05em',
                        }}
                      >
                        running...
                      </span>
                    )}
                    {step.status === 'pending' && (
                      <span
                        style={{
                          fontFamily: 'var(--font-space-mono, monospace)',
                          fontSize: '10px',
                          color: 'rgba(239, 233, 214, 0.15)',
                          letterSpacing: '0.05em',
                        }}
                      >
                        queued
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Code block — the actual Inngest function signature */}
            <div
              style={{
                marginTop: '28px',
                padding: '20px',
                backgroundColor: '#231D27',
                border: '1px solid rgba(239, 233, 214, 0.08)',
                fontFamily: 'var(--font-space-mono, monospace)',
                fontSize: '12px',
                lineHeight: '1.7',
                color: 'rgba(239, 233, 214, 0.5)',
                overflowX: 'auto',
              }}
            >
              <div style={{ marginBottom: '4px', color: 'rgba(239, 233, 214, 0.25)', fontSize: '10px' }}>
                // inngest/functions/fulfill-order.ts
              </div>
              <div>
                <span style={{ color: '#59A569' }}>export const</span>{' '}
                <span style={{ color: '#EFE9D6' }}>fulfillOrder</span>{' '}
                <span style={{ color: 'rgba(239, 233, 214, 0.4)' }}>=</span>{' '}
                <span style={{ color: '#CBB26A' }}>inngest</span>
                <span style={{ color: 'rgba(239, 233, 214, 0.4)' }}>.</span>
                <span style={{ color: '#FF7300' }}>createFunction</span>
                <span style={{ color: 'rgba(239, 233, 214, 0.5)' }}>(</span>
              </div>
              <div style={{ paddingLeft: '16px' }}>
                <span style={{ color: 'rgba(239, 233, 214, 0.4)' }}>{'{ id: '}</span>
                <span style={{ color: '#CBB26A' }}>&ldquo;fulfill-order&rdquo;</span>
                <span style={{ color: 'rgba(239, 233, 214, 0.4)' }}>{' },'}</span>
              </div>
              <div style={{ paddingLeft: '16px' }}>
                <span style={{ color: 'rgba(239, 233, 214, 0.4)' }}>{'{ event: '}</span>
                <span style={{ color: '#CBB26A' }}>&ldquo;store/order.placed&rdquo;</span>
                <span style={{ color: 'rgba(239, 233, 214, 0.4)' }}>{' },'}</span>
              </div>
              <div style={{ paddingLeft: '16px' }}>
                <span style={{ color: '#FF7300' }}>async</span>
                <span style={{ color: 'rgba(239, 233, 214, 0.5)' }}>{' ({ event, step }) => {'}</span>
              </div>
              {steps.map((s, i) => (
                <div
                  key={s.id}
                  style={{
                    paddingLeft: '32px',
                    color:
                      s.status === 'complete'
                        ? '#59A569'
                        : s.status === 'running'
                        ? '#FF7300'
                        : 'rgba(239, 233, 214, 0.2)',
                    transition: 'color 0.3s ease',
                  }}
                >
                  {s.name.replace('step.run(', 'await step.run(').replace(')', ', handler)')}
                </div>
              ))}
              <div style={{ paddingLeft: '16px' }}>
                <span style={{ color: 'rgba(239, 233, 214, 0.5)' }}>{'}'}</span>
              </div>
              <span style={{ color: 'rgba(239, 233, 214, 0.5)' }}>)</span>
            </div>
          </div>

          {/* ─── Right: Order Summary + Status ─── */}
          <div>
            {/* Overall status card */}
            <div
              style={{
                padding: '24px',
                border: `1px solid ${allComplete ? 'rgba(89, 165, 105, 0.3)' : 'rgba(255, 115, 0, 0.2)'}`,
                backgroundColor: allComplete ? 'rgba(89, 165, 105, 0.05)' : 'rgba(255, 115, 0, 0.04)',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: allComplete ? '#59A569' : '#FF7300',
                  marginBottom: '8px',
                }}
              >
                {allComplete ? 'Complete' : 'In Progress'}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-space-grotesk, sans-serif)',
                  fontWeight: '700',
                  fontSize: '22px',
                  textTransform: 'uppercase',
                  color: '#EFE9D6',
                }}
              >
                {allComplete ? 'Order Fulfilled' : 'Fulfilling...'}
              </div>
              {allComplete && (
                <p
                  style={{
                    fontFamily: 'var(--font-space-grotesk, sans-serif)',
                    fontSize: '13px',
                    color: 'rgba(239, 233, 214, 0.55)',
                    margin: '8px 0 0',
                  }}
                >
                  Confirmation email sent. Your swag is on its way.
                </p>
              )}
            </div>

            {/* Order meta */}
            <div
              style={{
                padding: '20px',
                border: '1px solid rgba(239, 233, 214, 0.08)',
                marginBottom: '16px',
              }}
            >
              {[
                { label: 'Order ID', value: orderId },
                { label: 'Placed', value: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
                { label: 'Steps Complete', value: `${completedCount} / ${steps.length}` },
                { label: 'Workflow', value: 'fulfill-order' },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(239, 233, 214, 0.06)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-space-mono, monospace)',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'rgba(239, 233, 214, 0.35)',
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-space-mono, monospace)',
                      fontSize: '11px',
                      color: label === 'Workflow' ? '#FF7300' : '#EFE9D6',
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Inngest cloud link */}
            <a
              href="https://app.inngest.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                padding: '12px 16px',
                border: '1px solid rgba(255, 115, 0, 0.2)',
                backgroundColor: 'rgba(255, 115, 0, 0.04)',
                textDecoration: 'none',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#FF7300',
                  marginBottom: '4px',
                }}
              >
                View in Inngest Cloud →
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-space-grotesk, sans-serif)',
                  fontSize: '12px',
                  color: 'rgba(239, 233, 214, 0.4)',
                }}
              >
                Full run trace, step outputs, retry history
              </div>
            </a>

            {allComplete && (
              <Link
                href="/"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '14px',
                  backgroundColor: '#FF7300',
                  color: '#1A161C',
                  fontFamily: 'var(--font-space-mono, monospace)',
                  fontSize: '11px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  textDecoration: 'none',
                }}
              >
                Shop More →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
