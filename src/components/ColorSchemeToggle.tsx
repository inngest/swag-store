'use client';

import * as React from 'react';

type BrandColor = {
  id: string;
  label: string;
  hex: string;
};

type Role = 'primary' | 'primaryText' | 'secondary' | 'secondaryText';

type RoleColors = Record<Role, string>;

type Preset = {
  id: string;
  label: string;
  colors: RoleColors;
};

const BRAND_COLORS: BrandColor[] = [
  { id: 'black', label: '01 Black', hex: '#020202' },
  { id: 'charcoal', label: '02 Charcoal', hex: '#212121' },
  { id: 'gray', label: '03 Gray', hex: '#7C7C7C' },
  { id: 'silver', label: '04 Silver', hex: '#CDCDCD' },
  { id: 'paper', label: '05 Paper', hex: '#F2F2F2' },
  { id: 'coral', label: '06 Coral', hex: '#FB6142' },
  { id: 'soft-coral', label: '07 Soft Coral', hex: '#FF9883' },
  { id: 'blue', label: '08 Blue', hex: '#2F33CB' },
  { id: 'sky', label: '09 Sky', hex: '#4F70F2' },
  { id: 'green', label: '10 Green', hex: '#00A67B' },
  { id: 'mint', label: '11 Mint', hex: '#55C2A6' },
];

const PRESETS: Preset[] = [
  {
    id: 'charcoal-coral',
    label: 'Charcoal / Coral',
    colors: {
      primary: '#212121',
      primaryText: '#FB6142',
      secondary: '#212121',
      secondaryText: '#FF9883',
    },
  },
  {
    id: 'black-coral',
    label: 'Black / Coral',
    colors: {
      primary: '#020202',
      primaryText: '#FB6142',
      secondary: '#212121',
      secondaryText: '#FF9883',
    },
  },
  {
    id: 'soft-coral',
    label: 'Soft Coral',
    colors: {
      primary: '#FF9883',
      primaryText: '#020202',
      secondary: '#F2F2F2',
      secondaryText: '#020202',
    },
  },
  {
    id: 'blue-coral',
    label: 'Blue / Coral',
    colors: {
      primary: '#2F33CB',
      primaryText: '#F2F2F2',
      secondary: '#FB6142',
      secondaryText: '#020202',
    },
  },
  {
    id: 'mint-coral',
    label: 'Mint / Coral',
    colors: {
      primary: '#55C2A6',
      primaryText: '#020202',
      secondary: '#FF9883',
      secondaryText: '#020202',
    },
  },
];

const ROLE_LABELS: Record<Role, string> = {
  primary: 'Primary',
  primaryText: 'Primary text',
  secondary: 'Secondary',
  secondaryText: 'Secondary text',
};

const STORAGE_KEY = 'inngest-swag-brand-lab';

function applyColors(colors: RoleColors) {
  const root = document.documentElement;
  const vars: Record<string, string> = {
    '--palette-primary': colors.primary,
    '--palette-primary-fg': colors.primaryText,
    '--palette-secondary': colors.secondary,
    '--palette-secondary-fg': colors.secondaryText,
    '--hero-bg': colors.primary,
    '--hero-fg': colors.primaryText,
    '--hero-strip-bg': colors.secondary,
    '--hero-strip-fg': colors.secondaryText,
    '--hero-primary-cta-bg': '#020202',
    '--hero-primary-cta-fg': colors.primary === '#020202' ? '#FB6142' : '#F2F2F2',
    '--hero-primary-cta-hover-bg': '#FF9883',
    '--hero-primary-cta-hover-fg': '#020202',
    '--hero-secondary-cta-bg': colors.secondary,
    '--hero-secondary-cta-fg': colors.secondaryText,
    '--hero-secondary-cta-hover-bg': '#FF9883',
    '--hero-secondary-cta-hover-fg': '#020202',
    '--hero-secondary-divider-hover': '#020202',
    '--coral': colors.primary,
    '--coral-soft': colors.secondary,
    '--citrus': colors.primary,
    '--citrus-deep': colors.secondary,
    '--ok': colors.secondary,
    '--ink': '#020202',
    '--rule': '#020202',
    '--paper': '#F2F2F2',
    '--bone': '#F2F2F2',
    '--nebula': '#020202',
  };

  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

function readStoredColors(): RoleColors {
  if (typeof window === 'undefined') return PRESETS[0].colors;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return PRESETS[0].colors;
    return { ...PRESETS[0].colors, ...JSON.parse(stored) };
  } catch {
    return PRESETS[0].colors;
  }
}

function colorLabel(hex: string): string {
  return BRAND_COLORS.find((color) => color.hex === hex)?.label ?? hex;
}

export function ColorSchemeToggle() {
  const [open, setOpen] = React.useState(false);
  const [colors, setColors] = React.useState<RoleColors>(readStoredColors);

  React.useEffect(() => {
    applyColors(colors);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  }, [colors]);

  const updateRole = (role: Role, hex: string) => {
    setColors((current) => ({ ...current, [role]: hex }));
  };

  const activePreset = PRESETS.find((preset) =>
    (Object.keys(preset.colors) as Role[]).every((role) => preset.colors[role] === colors[role])
  );

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100 }}>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            right: 0,
            width: 360,
            background: 'var(--paper)',
            border: '1px solid var(--ink)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
            color: 'var(--ink)',
          }}
        >
          <div style={{ padding: 16, borderBottom: '1px solid var(--ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
            <div>
              <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 6 }}>
                Local brand lab
              </div>
              <div className="display" style={{ fontSize: 20, lineHeight: 1 }}>
                Home palette
              </div>
            </div>
            <div className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
              Dev only
            </div>
          </div>

          <div style={{ padding: 16, display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setColors(preset.colors)}
                  className="mono"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    minHeight: 44,
                    border: activePreset?.id === preset.id ? '2px solid var(--ink)' : '1px solid var(--rule-soft)',
                    background: 'transparent',
                    color: 'var(--ink)',
                    overflow: 'hidden',
                  }}
                  title={preset.label}
                >
                  {(Object.keys(preset.colors) as Role[]).map((role) => (
                    <span key={role} style={{ background: preset.colors[role] }} />
                  ))}
                  <span style={{ gridColumn: '1 / -1', padding: '6px 8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', background: 'var(--paper)' }}>
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                <label key={role} style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 10, alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
                    {ROLE_LABELS[role]}
                  </span>
                  <span style={{ display: 'grid', gridTemplateColumns: '34px 1fr' }}>
                    <span style={{ background: colors[role], border: '1px solid var(--ink)', borderRight: 0 }} />
                    <select
                      value={colors[role]}
                      onChange={(event) => updateRole(role, event.target.value)}
                      className="mono"
                      style={{
                        width: '100%',
                        border: '1px solid var(--ink)',
                        borderRadius: 0,
                        background: 'var(--paper)',
                        color: 'var(--ink)',
                        padding: '9px 10px',
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {BRAND_COLORS.map((color) => (
                        <option key={color.hex} value={color.hex}>
                          {color.label} · {color.hex}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              ))}
            </div>

            <div style={{ border: '1px solid var(--ink)' }}>
              <div style={{ minHeight: 82, padding: 12, background: colors.primary, color: colors.primaryText }}>
                <div className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Primary · {colorLabel(colors.primary)}
                </div>
                <div className="display" style={{ fontSize: 30, lineHeight: 0.95, marginTop: 10 }}>
                  Wear the workflow.
                </div>
              </div>
              <div className="mono" style={{ padding: 10, background: colors.secondary, color: colors.secondaryText, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Secondary · {colorLabel(colors.secondary)}
              </div>
            </div>
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
        title="Local brand lab"
      >
        {open ? '×' : '◉'}
      </button>
    </div>
  );
}
