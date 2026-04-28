# Inngest Swag Store — Design System Reference

Brand guidelines source: Inngest Visual Identity Guidelines V1.0, MAD Creative Agency, 2026

---

## Color System

### Primary Palette

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Citrus Glow | `#FF7300` | 255/115/0 | Primary accent, CTAs, prices, active states, orange rule |
| Quantum | `#362C40` | 54/44/64 | Secondary bg, cards, borders, muted surfaces |
| Citrine | `#EFE9D6` | 239/233/214 | Primary text on dark, light bg alternative |
| Nebula | `#1A161C` | 26/22/28 | Site background (darkest) |

### Secondary Palette

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Cloud | `#EEECE6` | 238/236/230 | Light variant of Citrine, secondary text surfaces |
| Eon Moss | `#006250` | 0/98/80 | Success states, "complete" workflow steps |
| Dune | `#B17A50` | 177/122/80 | Warm accent, alternate highlight |
| Solar Lux | `#CBB26A` | 203/178/106 | Code syntax color, warm gold accent |
| Matcha | `#59A569` | 89/165/105 | Step complete indicator, shipping confirmed |

### Semantic Colors (derived)

| Token | Value | Usage |
|-------|-------|-------|
| `--step-running` | `#FF7300` | Workflow step currently executing |
| `--step-complete` | `#59A569` | Workflow step finished |
| `--step-pending` | `rgba(239,233,214,0.2)` | Workflow step not yet started |
| `--step-failed` | `#FF4444` | Workflow step errored |
| `--border-default` | `rgba(239,233,214,0.12)` | Section dividers, card borders |
| `--border-subtle` | `rgba(239,233,214,0.06)` | Table row separators |

---

## Typography

### Font Stack

| Role | Specification | Dev Proxy | CSS Variable |
|------|---------------|-----------|--------------|
| Display / H1 | ABC Whyte Inktrap, Regular, Uppercase only | Space Grotesk Bold | `--font-whyte-inktrap` |
| Heading / H2-H3 | ABC Whyte, Regular, Mixed case | Space Grotesk | `--font-whyte` |
| Body copy | Circular XX, Regular, Sentence case | Space Grotesk | `--font-circular` |
| Labels / CTAs / Captions | ABC Whyte Mono, Regular, Uppercase | Space Mono | `--font-whyte-mono` |

**License note:** ABC Whyte is a paid typeface from ABC Dinamo. Space Grotesk (Google Fonts, OFL) is used as a development proxy. For production, purchase and host the ABC Whyte family.

### Type Scale (brand spec → web equivalents)

| Token | Brand Spec | CSS Value | Usage |
|-------|-----------|-----------|-------|
| H1 | 64pt, Inktrap, 0% tracking | `clamp(56px, 8vw, 96px)`, weight 700, uppercase | Hero headlines |
| S1 | 32pt, Whyte, 0% tracking | `28-36px`, weight 400-500 | Subheadings, section titles |
| B1 | 18pt, Circular XX, 0% tracking | `16-18px`, weight 400 | Body copy |
| C1 | 16pt, Mono, 0% tracking | `10-13px`, ALL CAPS, letter-spacing 0.1em | Labels, CTAs, captions |

### Rules
- H1 always uppercase
- Mono font always uppercase with `letter-spacing: 0.1em`
- Body copy in sentence case only
- Prices always in Mono font, Citrus Glow color
- Order IDs, tracking numbers, step names always in Mono

---

## Spacing System

Base unit: `8px`

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | `4px` | Inline gaps, tag padding |
| `space-2` | `8px` | Small gaps |
| `space-3` | `12px` | Component internal padding |
| `space-4` | `16px` | Standard padding, card gap |
| `space-5` | `20px` | Section internal padding |
| `space-6` | `24px` | Page horizontal gutter |
| `space-8` | `32px` | Between components |
| `space-12` | `48px` | Section gaps |
| `space-16` | `64px` | Major section breaks |
| `space-20` | `80px` | Hero top padding |

---

## Layout

- **Max width:** `1400px` centered with `24px` horizontal gutters
- **Grid:** 1px gap trick — product grid has `gap: 1px; background: rgba(239,233,214,0.08)` which creates editorial grid lines between cells
- **Radius:** `0px` — no border radius anywhere. Sharp corners are brand-correct.
- **Sticky nav:** `56px` height, `z-index: 50`

---

## Component Patterns

### The Orange Rule
The brand's signature micro-detail. A `1px` horizontal or `2px` vertical line in Citrus Glow (`#FF7300`).

```css
/* Top orange rule (section headers) */
border-top: 1px solid #FF7300;

/* Left orange rule (active workflow steps, callout boxes) */
border-left: 2px solid #FF7300;
```

### Product Cards
- `gap: 1px` grid on a `rgba(239,233,214,0.08)` background creates automatic editorial grid lines
- On hover: `background: #231D27` (lighten from Nebula)
- Featured products get a `2px` Citrus Glow bottom edge on image
- Tag placement: `position: absolute, top: 12px, left: 12px`

### Workflow Step Row
The visual language for Inngest's durable execution:
```
[status icon] step.run("name")         [timing]
              Description of what this step does
```
- Left border: 2px, color varies by status
- Background: subtle tint (orange 5% for running, green 3% for complete)
- The code block below the steps uses Solar Lux for color values, Matcha for keywords

### Monospace Labels
All instance of `step.run()`, order IDs, prices, tracking numbers, status badges:
- Font: Space Mono (ABC Whyte Mono proxy)
- ALL CAPS
- `letter-spacing: 0.08-0.12em`
- Never use for body copy

---

## Interactive States

| Element | Default | Hover | Active/Selected |
|---------|---------|-------|-----------------|
| Product card | `bg: #1A161C` | `bg: #231D27` | — |
| Button (primary) | `bg: #FF7300` | `bg: #e66800` | — |
| Size selector | `border: rgba(...)0.2` | — | `border: #FF7300, bg: rgba(FF7300,0.1)` |
| Nav link | `color: rgba(...)0.6` | `color: #EFE9D6` | — |
| Cart button | `border: rgba(...)0.2` | `border: #FF7300` | — |

---

## Animation Tokens

| Name | Spec | Usage |
|------|------|-------|
| `slideInRight` | `0.3s cubic-bezier(0.16, 1, 0.3, 1)` | Cart drawer entrance |
| `fadeIn` | `0.2s ease` | Overlay/backdrop |
| `pulse` | `1.5s ease-in-out infinite` | Running step dot |
| `spin` | `0.7-0.8s linear infinite` | Loading spinners |
| `fade-up` | `0.5s cubic-bezier(0.16, 1, 0.3, 1)` | Content reveal on load |

---

## Voice and Tone (from brand guidelines)

- **Editorial precision** — no filler, every word earns its place
- **Visual restraint** — negative space is intentional, not accidental
- **Technical confidence** — product names like "step.run()", "durable execution" appear in UI copy without explanation
- **Dry wit** — "The T-shirt that never drops a step." Not "Buy our cool shirt."
- Copy patterns: taglines are short, declarative, slightly wry
- CTAs use `→` not "Click here" or "Submit"

---

## Figma / Design Assets Needed (production)

- ABC Whyte Inktrap font files (license from ABC Dinamo)
- ABC Whyte font files
- ABC Whyte Mono font files
- High-resolution product photos (replace gradient placeholders)
- Inngest wordmark SVG (official, not text-rendered)
- Inngest logomark/icon SVG for favicon
