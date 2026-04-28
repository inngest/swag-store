import * as React from 'react';

export type WfStep = { name: string; detail?: string; duration?: string };

export function StepDot({ status }: { status: 'complete' | 'running' | 'pending' }) {
  if (status === 'complete') {
    return (
      <div style={{ width: 14, height: 14, background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
          <path d="M1 4.5L3.5 7L8 1.5" stroke="#fff" strokeWidth="1.6" />
        </svg>
      </div>
    );
  }
  if (status === 'running') {
    return (
      <div style={{ width: 14, height: 14, position: 'relative' }}>
        <div className="pulse" style={{ position: 'absolute', inset: 0, background: 'var(--citrus)' }} />
      </div>
    );
  }
  return <div style={{ width: 14, height: 14, border: '1px solid var(--ink)', opacity: 0.35 }} />;
}

export function WorkflowTracker({
  steps,
  activeIdx,
  dense = false,
  label = 'fulfill-order.ts',
}: {
  steps: WfStep[];
  activeIdx: number;
  dense?: boolean;
  label?: string;
}) {
  return (
    <div className="wf-card" style={{ padding: dense ? 16 : 22 }}>
      <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 14 }}>
        <span>EVENT · store/order.placed</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="live-dot" />LIVE
        </span>
      </div>
      <div className="display" style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 18 }}>
        run_id: 01HKXG2A · attempt 1 of 3
      </div>
      <div>
        {steps.map((s, i) => {
          const status = i < activeIdx ? 'complete' : i === activeIdx ? 'running' : 'pending';
          return (
            <div
              key={s.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '16px 1fr auto',
                gap: 12,
                alignItems: 'center',
                padding: '10px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--rule-soft)',
              }}
            >
              <StepDot status={status as 'complete' | 'running' | 'pending'} />
              <div>
                <div className="mono" style={{ fontSize: 12, fontWeight: 500 }}>{`step.run("${s.name}")`}</div>
                {s.detail && <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{s.detail}</div>}
              </div>
              <div className="mono tabnum" style={{ fontSize: 10.5, color: status === 'running' ? 'var(--citrus)' : 'var(--muted)', textTransform: 'uppercase' }}>
                {status === 'complete' ? s.duration || '0.4s' : status === 'running' ? 'RUNNING' : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
