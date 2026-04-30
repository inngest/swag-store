'use client';

import * as React from 'react';

type Scheme = {
  id: string;
  label: string;
  vars: Record<string, string>;
  swatch: string; // primary color preview
};

const SCHEMES: Scheme[] = [
  {
    id: 'citrus',
    label: 'Citrus Glow',
    swatch: '#FF7300',
    vars: {
      '--citrus': '#FF7300',
      '--citrus-deep': '#E0590A',
      '--paper': '#FFFFFF',
      '--bone': '#F5F0E8',
      '--ink': '#1A161C',
      '--nebula': '#1A161C',
      '--rule': '#1A161C',
      '--rule-soft': 'rgba(26, 22, 28, 0.16)',
      '--muted': '#6B6670',
    },
  },
  {
    id: 'citrine',
    label: 'Citrine',
    swatch: '#EFE915',
    vars: {
      '--citrus': '#EFE915',
      '--citrus-deep': '#C9C40F',
      '--paper': '#FFFFFF',
      '--bone': '#F5F0E8',
      '--ink': '#1A161C',
      '--nebula': '#1A161C',
      '--rule': '#1A161C',
      '--rule-soft': 'rgba(26, 22, 28, 0.16)',
      '--muted': '#6B6670',
    },
  },
  {
    id: 'matcha',
    label: 'Matcha',
    swatch: '#59A569',
    vars: {
      '--citrus': '#59A569',
      '--citrus-deep': '#3F8D52',
      '--paper': '#FFFFFF',
      '--bone': '#EEECE6',
      '--ink': '#1A161C',
      '--nebula': '#1A161C',
      '--rule': '#1A161C',
      '--rule-soft': 'rgba(26, 22, 28, 0.16)',
      '--muted': '#6B6670',
    },
  },
  {
    id: 'eon',
    label: 'Eon Moss',
    swatch: '#006250',
    vars: {
      '--citrus': '#006250',
      '--citrus-deep': '#004A3C',
      '--paper': '#FFFFFF',
      '--bone': '#EEECE6',
      '--ink': '#1A161C',
      '--nebula': '#1A161C',
      '--rule': '#1A161C',
      '--rule-soft': 'rgba(26, 22, 28, 0.16)',
      '--muted': '#6B6670',
    },
  },
  {
    id: 'solar',
    label: 'Solar Lux',
    swatch: '#CBB26A',
    vars: {
      '--citrus': '#CBB26A',
      '--citrus-deep': '#A89154',
      '--paper': '#FFFFFF',
      '--bone': '#EEECE6',
      '--ink': '#1A161C',
      '--nebula': '#1A161C',
      '--rule': '#1A161C',
      '--rule-soft': 'rgba(26, 22, 28, 0.16)',
      '--muted': '#6B6670',
    },
  },
  {
    id: 'dune',
    label: 'Dune',
    swatch: '#B17A50',
    vars: {
      '--citrus': '#B17A50',
      '--citrus-deep': '#8E5F3C',
      '--paper': '#FFFFFF',
      '--bone': '#EEECE6',
      '--ink': '#1A161C',
      '--nebula': '#1A161C',
      '--rule': '#1A161C',
      '--rule-soft': 'rgba(26, 22, 28, 0.16)',
      '--muted': '#6B6670',
    },
  },
  {
    id: 'quantum',
    label: 'Quantum (dark)',
    swatch: '#FF7300',
    vars: {
      '--citrus': '#FF7300',
      '--citrus-deep': '#E0590A',
      '--paper': '#1A161C',
      '--bone': '#252028',
      '--ink': '#EEECE6',
      '--nebula': '#0E0B12',
      '--rule': '#EEECE6',
      '--rule-soft': 'rgba(238, 236, 230, 0.16)',
      '--muted': '#9C969F',
    },
  },
  {
    id: 'cloud',
    label: 'Cloud',
    swatch: '#FF7300',
    vars: {
      '--citrus': '#FF7300',
      '--citrus-deep': '#E0590A',
      '--paper': '#EEECE6',
      '--bone': '#E2DFD7',
      '--ink': '#1A161C',
      '--nebula': '#1A161C',
      '--rule': '#1A161C',
      '--rule-soft': 'rgba(26, 22, 28, 0.16)',
      '--muted': '#6B6670',
    },
  },
];

const STORAGE_KEY = 'inngest-swag-scheme';

function applyScheme(scheme: Scheme) {
  const root = document.documentElement;
  Object.entries(scheme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export function ColorSchemeToggle() {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState('matcha');

  React.useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const scheme =
      SCHEMES.find((s) => s.id === saved) ??
      SCHEMES.find((s) => s.id === 'matcha') ??
      SCHEMES[0];
    setActive(scheme.id);
    applyScheme(scheme);
  }, []);

  const handleSelect = (scheme: Scheme) => {
    applyScheme(scheme);
    setActive(scheme.id);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, scheme.id);
  };

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100 }}>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            right: 0,
            background: 'var(--paper)',
            border: '1px solid var(--ink)',
            padding: 16,
            minWidth: 220,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }}
        >
          <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12 }}>
            COLOR SCHEME
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SCHEMES.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelect(s)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 10px',
                  border: active === s.id ? '1px solid var(--ink)' : '1px solid transparent',
                  background: active === s.id ? 'var(--bone)' : 'transparent',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    background: s.swatch,
                    border: '1px solid var(--rule-soft)',
                    flexShrink: 0,
                  }}
                />
                <span className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="mono"
        style={{
          width: 44,
          height: 44,
          background: 'var(--ink)',
          color: 'var(--paper)',
          border: '1px solid var(--ink)',
          fontSize: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Color scheme"
      >
        {open ? '×' : '◉'}
      </button>
    </div>
  );
}
