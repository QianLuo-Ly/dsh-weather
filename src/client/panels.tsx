/**
 * Presentational panels for the weather popover — pure renders driven by
 * plain props, extracted from WeatherBar.tsx so that file keeps the data &
 * interaction logic and each block is testable/themeable on its own.
 *
 * All of them read the shared {@link TOKEN} / {@link NUM} presets and the
 * condition/icon helpers; none of them touches settings, fetching or state.
 */
import type { ReactElement } from 'react'
import type { DailyPoint, HourlyPoint, MinutelyPoint } from './weather-api'
import { RAIN_MM_PER_15MIN } from './weather-api'
import { dayLabel, hourLabel, timeLabel } from './condition'
import { Glyph, WeatherIcon, type GlyphName } from './icons'
import { NUM, PALETTE, TOKEN } from './theme'

/** Rain-bar intensity ramp (mm per 15 min → color), shared with theme palette. */
const RAIN_RAMP: Array<{ atLeast: number; color: string }> = [
  { atLeast: 2.5, color: PALETTE.rainStrong },
  { atLeast: 1, color: PALETTE.rain },
  { atLeast: 0, color: PALETTE.rainSoft },
]

/** One entry of the "今日信息" wrap row: an optional small glyph + text. */
export interface TodayFactItem {
  glyph?: GlyphName
  text: string
}

/** Wrap row of small environment facts (sunrise, wind, pressure, …). */
export function TodayFacts(props: { items: TodayFactItem[] }): ReactElement {
  const { items } = props
  return (
    <div data-block="today" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 12, fontSize: 12, color: TOKEN.fgMuted }}>
      {items.map((item, index) => (
        <span key={`${index}-${item.text}`} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {item.glyph !== undefined && <Glyph name={item.glyph} size={14} />}
          {item.text}
        </span>
      ))}
    </div>
  )
}

/** One hero stat cell (湿度 / 风速 / …). */
export function StatChip(props: {
  icon: ReactElement
  label: string
  value: string
  suffix?: string
  valueColor?: string
  compact?: boolean
}): ReactElement {
  return (
    <div
      style={{
        flex: '1 1 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        background: TOKEN.bgSoft,
        borderRadius: 10,
        padding: props.compact === true ? '6px 2px' : '7px 4px',
        border: `1px solid ${TOKEN.border}`,
        overflow: 'hidden',
      }}
    >
      <span style={{ color: TOKEN.fgMuted }}>{props.icon}</span>
      <span style={{ fontSize: 10, color: TOKEN.fgMuted, lineHeight: '13px' }}>{props.label}</span>
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          lineHeight: '16px',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
          ...NUM,
          ...(props.valueColor === undefined ? {} : { color: props.valueColor }),
        }}
      >
        {props.value}
        {props.suffix !== undefined && (
          <span style={{ fontSize: '0.8em', fontWeight: 400, marginLeft: 1 }}> {props.suffix}</span>
        )}
      </span>
    </div>
  )
}

/**
 * Mini bar strip of 15-minute precipitation (one column per step). Bar height
 * scales with the step amount; dry steps stay as a low neutral tick, wet
 * steps deepen with intensity.
 */
export function RainStrip(props: { points: MinutelyPoint[] }): ReactElement {
  const { points } = props
  const maxValue = Math.max(...points.map((point) => point.precipitation), 0.5)
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
      {points.map((point, index) => {
        const value = point.precipitation
        const wet = value >= RAIN_MM_PER_15MIN
        const height = wet ? Math.max(8, Math.min(30, 6 + (value / maxValue) * 24)) : 4
        const color = !wet
          ? TOKEN.border
          : (RAIN_RAMP.find((entry) => value >= entry.atLeast) ?? RAIN_RAMP[RAIN_RAMP.length - 1]).color
        return (
          <div key={point.time} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div
              title={`${timeLabel(point.time)} ${value.toFixed(1)} mm`}
              style={{ width: '100%', maxWidth: 14, height, borderRadius: 3, background: color, transition: 'height 0.2s ease' }}
            />
            <span style={{ fontSize: 9, lineHeight: '12px', color: TOKEN.fgMuted, whiteSpace: 'nowrap' }}>
              {index % 4 === 0 ? timeLabel(point.time) : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Horizontally scrollable strip of hourly forecast cards. */
export function HourlyStrip(props: {
  title: string
  points: HourlyPoint[]
  fmt: (value: number) => string
}): ReactElement {
  const { title, points, fmt } = props
  return (
    <div data-block="hourly" style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: TOKEN.fgMuted, marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {points.map((point) => (
          <div key={point.time} style={{ flex: '0 0 auto', width: 46, textAlign: 'center', background: TOKEN.bgSoft, borderRadius: 10, padding: '5px 2px' }}>
            <div style={{ fontSize: 11, color: TOKEN.fgMuted, ...NUM }}>{hourLabel(point.time)}</div>
            <div style={{ margin: '2px 0' }}>
              <WeatherIcon code={point.weatherCode} isDay={point.isDay} size={18} />
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, ...NUM }}>{fmt(point.temperature)}</div>
            <div style={{ fontSize: 10, color: point.precipProb > 0 ? TOKEN.accent : 'transparent', ...NUM }}>{point.precipProb}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 7-day forecast rows with temperature-range gradient bars. */
export function DailyList(props: {
  title: string
  points: DailyPoint[]
  fmt: (value: number) => string
}): ReactElement {
  const { title, points, fmt } = props
  const weekMin = points.length > 0 ? Math.min(...points.map((d) => d.tempMin)) : 0
  const weekMax = points.length > 0 ? Math.max(...points.map((d) => d.tempMax)) : 1
  const weekSpan = weekMax - weekMin || 1
  return (
    <div data-block="daily" style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: TOKEN.fgMuted, marginBottom: 6 }}>{title}</div>
      <div>
        {points.map((point, index) => {
          const left = ((point.tempMin - weekMin) / weekSpan) * 100
          const width = Math.max(8, ((point.tempMax - point.tempMin) / weekSpan) * 100)
          return (
            <div key={point.date} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 2px', borderBottom: index === points.length - 1 ? 'none' : `1px solid ${TOKEN.border}`, fontSize: 12.5 }}>
              <span style={{ width: 44, flex: '0 0 auto', ...NUM }}>{dayLabel(point.date, index)}</span>
              <span style={{ width: 20, textAlign: 'center', flex: '0 0 auto' }}>
                <WeatherIcon code={point.weatherCode} isDay={true} size={18} />
              </span>
              <span style={{ width: 36, flex: '0 0 auto', textAlign: 'right', fontSize: 11, color: point.precipProb > 0 ? TOKEN.accent : TOKEN.fgMuted, ...NUM }}>
                {point.precipProb}%
              </span>
              <span style={{ width: 36, flex: '0 0 auto', textAlign: 'right', color: TOKEN.fgMuted, ...NUM }}>{fmt(point.tempMin)}</span>
              <span style={{ position: 'relative', flex: 1, height: 4, borderRadius: 2, background: TOKEN.bgSoft, overflow: 'hidden' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: `${left}%`,
                    width: `${width}%`,
                    top: 0,
                    bottom: 0,
                    borderRadius: 3,
                    background: `linear-gradient(90deg, ${TOKEN.accent}, ${PALETTE.sun})`,
                  }}
                />
              </span>
              <span style={{ width: 38, flex: '0 0 auto', textAlign: 'right', fontWeight: 600, ...NUM }}>{fmt(point.tempMax)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
