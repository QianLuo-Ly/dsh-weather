/**
 * Shared design tokens and numeric presets for the weather surfaces: TOKEN
 * (var()-backed theme colors), PALETTE (fixed weather colors), BANNER
 * (translucent alert palettes). Components import these, never hex literals.
 */
import type { CSSProperties } from 'react'

export const TOKEN = {
  bg: 'var(--dsw-alias-bg-layer-2, #f3f4f6)',
  /**
   * Soft/inset surface. NOT a bg-layer token: the host binds layer-1/2/3 to the
   * same colour (pure white in light mode), which is invisible on the header and
   * gives no hover feedback since brightness() cannot lift a clamped white.
   */
  bgSoft: 'var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06))',
  /** Elevated surfaces above the base layer (inputs, dropdowns). */
  bgRaised: 'var(--dsw-alias-bg-layer-1, #ffffff)',
  /** Row hover/active fill for the suggestion list (visible in light mode). */
  bgHover: 'var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, 0.1))',
  // Text colors flip to pure white in dark mode via .dshw-root (see styles.ts).
  fg: 'var(--dshw-fg, #1f2328)',
  fgMuted: 'var(--dshw-fg-muted, #5f6672)',
  border: 'var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12))',
  /**
   * Accent. `--dsw-alias-brand-primary` is bound to the near-black/near-white
   * FOREGROUND in this platform; the real accent token is `-new-colorprimary-new-color`.
   */
  accent: 'var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4f8cff)',
  danger: '#e5484d',
  warn: '#b45309',
} as const

/** Fixed weather/visual colors that must not follow the theme. */
export const PALETTE = {
  sun: '#fbbf24',
  rainStrong: '#3b82f6',
  rain: '#60a5fa',
  rainSoft: '#93c5fd',
} as const

/** Translucent banner palettes (color / background / border) for alerts. */
export const BANNER = {
  danger: { color: TOKEN.danger, bg: 'rgba(229, 72, 77, 0.1)', border: 'rgba(229, 72, 77, 0.28)' },
  warning: { color: TOKEN.warn, bg: 'rgba(180, 83, 9, 0.1)', border: 'rgba(180, 83, 9, 0.28)' },
} as const

/** Shared elevation shadows — components must not re-spell these literals. */
export const SHADOW = {
  popover: '0 16px 48px rgba(0, 0, 0, 0.28)',
  floating: '0 8px 24px rgba(0, 0, 0, 0.18)',
  dropdown: '0 8px 24px rgba(0, 0, 0, 0.12)',
} as const

export const NUM = { fontVariantNumeric: 'tabular-nums' as const }

export const baseButton: CSSProperties = {
  fontFamily: 'inherit',
}

export const iconButton: CSSProperties = {
  ...baseButton,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 8,
  background: 'transparent',
  color: TOKEN.fgMuted,
  border: 'none',
  cursor: 'pointer',
}

export const actionButton: CSSProperties = {
  ...baseButton,
  background: TOKEN.bgSoft,
  color: TOKEN.fg,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: '5px 13px',
  fontSize: 12.5,
  cursor: 'pointer',
}

export const segmentButton: CSSProperties = {
  ...baseButton,
  border: 'none',
  borderRadius: 999,
  padding: '4px 13px',
  fontSize: 12.5,
  color: TOKEN.fg,
  cursor: 'pointer',
}
