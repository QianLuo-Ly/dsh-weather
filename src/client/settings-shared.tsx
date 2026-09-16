/**
 * Shared primitives for the weather settings page: the design-token aliases,
 * the `Row` / `ClockField` controls, their inline styles and the callback types
 * every settings section receives.
 *
 * No settings state lives here. This module exists so the sections
 * (`settings-location`, `settings-brief`, …) share one definition of "a row"
 * instead of each re-declaring the page's look.
 */
import { useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { BRIEF_TIMES, parseClockTime, type WeatherConfig } from '../config-shared'
import type { NoticeKind } from './hooks'
import { SHADOW, TOKEN } from './theme'

// Design tokens — single source is theme.ts; these aliases only shorten reads.
export const FG = TOKEN.fg
export const MUTED = TOKEN.fgMuted
export const BORDER = TOKEN.border
export const ACCENT = TOKEN.accent
export const BG_ROW = TOKEN.bgSoft
export const INPUT_BG = TOKEN.bgRaised
export const DANGER = TOKEN.danger
export const OK = '#2f9e44'

export type FieldWriter = (fields: Array<[keyof WeatherConfig, unknown]>, clears?: Array<keyof WeatherConfig>) => Promise<boolean>
export type FieldSetter = (field: keyof WeatherConfig, value: unknown) => void
export type Notify = (text: string, kind?: NoticeKind) => void

export function Row(props: { label: string; labelFor?: string; children: ReactNode }): ReactElement {
  const { label, labelFor, children } = props
  const labelNode = labelFor !== undefined
    ? <label htmlFor={labelFor} style={{ flex: '0 0 auto', cursor: 'pointer' }}>{label}</label>
    : <span style={{ flex: '0 0 auto' }}>{label}</span>
  return (
    <div style={row}>
      {labelNode}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{children}</div>
    </div>
  )
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 12px',
  marginBottom: 8,
  background: BG_ROW,
  borderRadius: 10,
}

/** Hour choices `00`–`23`. */
const CLOCK_HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
/** Minute choices in five-minute steps — the granularity a brief actually needs. */
const CLOCK_MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))

/**
 * Pick an `HH:MM` time from two styled selects.
 *
 * A native `<input type="time">` was the only control in this page whose chrome
 * the plugin could not touch: its own clock affordance and spinner popup ignore
 * the design tokens, read as a stray browser widget next to the rest of the
 * form, and on some platforms are awkward to drive at all. Two selects render
 * with the page's own input styling and are unambiguous to operate. A stored
 * minute that is not a multiple of five is added to the list rather than
 * silently rewritten, so hand-edited documents round-trip unchanged.
 */
export function ClockField(props: {
  id: string
  label: string
  value: string
  onCommit: (text: string) => void
}): ReactElement {
  const { id, label, value, onCommit } = props
  const parsed = parseClockTime(value) ?? BRIEF_TIMES.morning
  const [hour, minute] = parsed.split(':') as [string, string]
  const minutes = CLOCK_MINUTES.includes(minute) ? CLOCK_MINUTES : [...CLOCK_MINUTES, minute].sort()
  const commit = (nextHour: string, nextMinute: string): void => onCommit(`${nextHour}:${nextMinute}`)
  return (
    <div style={clockField}>
      <select
        id={`${id}-hour`}
        aria-label={`${label}（小时）`}
        value={hour}
        onChange={(event) => commit(event.currentTarget.value, minute)}
        style={clockSelect}
      >
        {CLOCK_HOURS.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <span style={{ color: MUTED, fontSize: 13 }}>:</span>
      <select
        id={`${id}-minute`}
        aria-label={`${label}（分钟）`}
        value={minute}
        onChange={(event) => commit(hour, event.currentTarget.value)}
        style={clockSelect}
      >
        {minutes.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  )
}

export const checkbox: CSSProperties = { width: 16, height: 16, accentColor: ACCENT, cursor: 'pointer' }

const clockField: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

/** Matches the page's other inputs; the popup is native but the control is ours. */
const clockSelect: CSSProperties = {
  fontFamily: 'inherit',
  fontVariantNumeric: 'tabular-nums',
  fontSize: 13,
  color: FG,
  background: INPUT_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: '5px 6px',
  cursor: 'pointer',
  minWidth: 52,
  textAlign: 'center',
}

export const radioLabel: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export const input: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 13,
  color: FG,
  background: INPUT_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: '6px 10px',
  outline: 'none',
  minWidth: 0,
  boxSizing: 'border-box',
}

export const inputButton: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 13,
  color: FG,
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: '6px 16px',
  cursor: 'pointer',
}

// ── City picker ─────────────────────────────────────────────────────────────
// Positioning and the two-line result layout ride inline styles; hover and
// keyboard-active states live in the injected stylesheet (`dshw-ac-*`), since
// inline styles cannot express pseudo-classes or attribute selectors.

export const searchingBadge: CSSProperties = {
  position: 'absolute',
  right: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: 11.5,
  color: MUTED,
  pointerEvents: 'none',
}

export const suggestionPanel: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  zIndex: 20,
  padding: 6,
  background: INPUT_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: SHADOW.dropdown,
  maxHeight: 288,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
}

export const suggestionRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 4px 2px 0',
  borderRadius: 10,
}

export const suggestionPick: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flex: 1,
  minWidth: 0,
  padding: '6px 8px',
  background: 'transparent',
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  textAlign: 'left',
  font: 'inherit',
  color: FG,
}

/** Tinted disc behind the pin, so each result has a clear visual anchor. */
export const suggestionPin: CSSProperties = {
  display: 'flex',
  flex: '0 0 auto',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 9,
  color: ACCENT,
  background: 'rgba(79, 140, 255, 0.12)',
}

export const suggestionLines: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
}

export const suggestionName: CSSProperties = {
  fontSize: 13.5,
  lineHeight: '18px',
  fontWeight: 550,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const suggestionCoords: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontSize: 11.5,
  lineHeight: '15px',
  color: MUTED,
}

/** Icon-only bookmark toggle (★ saved / ☆ available), not a text button. */
export const suggestionStar: CSSProperties = {
  fontFamily: 'inherit',
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  fontSize: 15,
  lineHeight: 1,
  color: MUTED,
  background: 'transparent',
  border: 'none',
  borderRadius: 9,
  cursor: 'pointer',
}

/**
 * Browser notification permission, re-read on focus because it can change in the
 * browser's own site settings while this page stays open. The page holds it
 * (rather than each block) because the alerts switch and the brief switch both
 * show the same hint.
 */
export function useNotificationPermission(): { permission: NotificationPermission; request: () => void } {
  const [permission, setPermission] = useState<NotificationPermission>(() => (
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  ))
  useEffect(() => {
    const refresh = (): void => setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  const request = (): void => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return
    void Notification.requestPermission().then(() => {
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
    })
  }
  return { permission, request }
}
