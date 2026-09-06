/**
 * Shared design tokens and numeric style presets for the weather surfaces.
 *
 * This is the single source of truth for colors used by the client:
 * - {@link TOKEN} — var()-backed theme colors (flip with the harness theme).
 *   Plain fallbacks (the second var() argument) keep the plugin readable even
 *   when an alias token is absent. Text colors flip in dark mode via the
 *   document-wide `--dshw-*` variables injected by styles.ts.
 * - {@link PALETTE} — fixed weather colors (sun/rain ramp) that intentionally
 *   do not follow the theme.
 * - {@link BANNER} — translucent warning/danger banner palettes.
 * Components must import these instead of re-spelling hex literals.
 */
import type { CSSProperties } from 'react'

export const TOKEN = {
  bg: 'var(--dsw-alias-bg-layer-2, #f3f4f6)',
  bgSoft: 'var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, 0.06))',
  /** Elevated surfaces above the base layer (inputs, dropdowns). */
  bgRaised: 'var(--dsw-alias-bg-layer-1, #ffffff)',
  // Text colors flip to pure white in dark mode via .dshw-root (see styles.ts).
  fg: 'var(--dshw-fg, #1f2328)',
  fgMuted: 'var(--dshw-fg-muted, #5f6672)',
  border: 'var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12))',
  accent: 'var(--dsw-alias-brand-primary, #4f8cff)',
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
