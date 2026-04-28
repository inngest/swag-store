import * as React from 'react';

type Item = { idx: string; label: string };

export function SectionHead({
  num,
  title,
  blurb,
  items,
}: {
  num: string;
  title: string;
  blurb: React.ReactNode;
  items?: Item[];
}) {
  return (
    <div style={{ borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)', padding: '24px 32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '0.4fr 1fr 0.6fr', gap: 32, alignItems: 'start' }}>
        <div>
          <div className="display" style={{ fontSize: 48, lineHeight: 1, fontWeight: 400 }}>{num}</div>
          <div className="display" style={{ fontSize: 32, lineHeight: 1, fontWeight: 400, marginTop: 8, textTransform: 'uppercase' }}>{title}</div>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink)', maxWidth: 480, alignSelf: 'end' }}>
          {blurb}
        </div>
        <div style={{ alignSelf: 'end' }}>
          {items?.map((it) => (
            <div key={it.idx} className="meta-row mono">
              <span className="plus">{it.idx}</span>
              <span>{it.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
