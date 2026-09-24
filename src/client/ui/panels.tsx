/**
 * Presentational panels for the weather popover — pure renders driven by plain
 * props, so WeatherBar.tsx keeps the data/interaction logic and each block is
 * testable/themeable alone. None touch settings, fetching or state.
 */
import type { CSSProperties, ReactElement } from 'react'
import type { DailyPoint, DayDetail, HourlyPoint, MinutelyPoint } from '../data/weather-api'
import { MINUTE_STEP_MIN, RAIN_MM_PER_15MIN } from '../data/weather-api'
import { dayLabel, durationLabel, hourLabel, timeLabel } from '../data/condition'
import { Glyph, WeatherIcon, type GlyphName } from './icons'
import { glyphForCode } from '../data/describe'
import { actionButton, NUM, PALETTE, TOKEN } from './theme'
import { tempText, windText, type UnitSetting } from '../shared/units'

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
      {items.map((item) => (
        <span key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
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
 * Mini bar strip of 15-minute precipitation — bar height scales with the step
 * amount; dry steps stay a low tick, wet steps deepen with intensity.
 */
export function RainStrip(props: { points: MinutelyPoint[] }): ReactElement {
  const { points } = props
  const maxValue = Math.max(...points.map((point) => point.precipitation), 0.5)
  // The strip's own span, labelled the same way as the rain-timing line.
  const windowText = durationLabel(points.length * MINUTE_STEP_MIN)
  return (
    // One summary for assistive tech; the bars are decorative (value only in `title`).
    <div
      role="img"
      aria-label={`未来 ${windowText}降水，最大 ${maxValue.toFixed(1)} 毫米/${MINUTE_STEP_MIN} 分钟`}
      style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}
    >
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
              aria-hidden="true"
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
              <WeatherIcon glyph={glyphForCode(point.weatherCode, point.isDay)} size={18} />
            </div>
            {/* A step the feed did not report renders as "—", never as 0 °C. */}
            <div style={{ fontSize: 12.5, fontWeight: 600, ...NUM }}>
              {point.temperature !== undefined ? fmt(point.temperature) : '—'}
            </div>
            <div style={{ fontSize: 10, color: point.precipProb !== undefined && point.precipProb > 0 ? TOKEN.accent : 'transparent', ...NUM }}>
              {point.precipProb !== undefined ? `${point.precipProb}%` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 7-day forecast rows with temperature-range gradient bars. `onSelectDay`
 * turns each row into a real button; without it the rows stay inert.
 */
export function DailyList(props: {
  title: string
  points: DailyPoint[]
  fmt: (value: number) => string
  /** Called with the row's date (`YYYY-MM-DD`) on click; rows are inert if absent. */
  onSelectDay?: (date: string) => void
}): ReactElement {
  const { title, points, fmt, onSelectDay } = props
  // Range bars scale over the week's REPORTED extremes. Omitted days are skipped,
  // not counted as 0 °C — that would squash every real bar into a sliver.
  const reportedMin: number[] = []
  const reportedMax: number[] = []
  for (const day of points) {
    if (day.tempMin === undefined || day.tempMax === undefined) continue
    reportedMin.push(day.tempMin)
    reportedMax.push(day.tempMax)
  }
  const weekMin = reportedMin.length > 0 ? Math.min(...reportedMin) : 0
  const weekMax = reportedMax.length > 0 ? Math.max(...reportedMax) : 1
  const weekSpan = weekMax - weekMin || 1
  return (
    <div data-block="daily" style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: TOKEN.fgMuted, marginBottom: 6 }}>{title}</div>
      <div>
        {points.map((point, index) => {
          const tempMin = point.tempMin
          const tempMax = point.tempMax
          const hasRange = tempMin !== undefined && tempMax !== undefined
          const left = tempMin !== undefined && tempMax !== undefined ? ((tempMin - weekMin) / weekSpan) * 100 : 0
          const width = tempMin !== undefined && tempMax !== undefined
            ? Math.max(8, ((tempMax - tempMin) / weekSpan) * 100)
            : 0
          // Shared row metrics so clickable and inert rows stay pixel-identical.
          const row: CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '3px 2px',
            borderBottom: index === points.length - 1 ? 'none' : `1px solid ${TOKEN.border}`,
            fontSize: 12.5,
          }
          const cells = (
            <>
              <span style={{ width: 44, flex: '0 0 auto', ...NUM }}>{dayLabel(point.date, index)}</span>
              <span style={{ width: 20, textAlign: 'center', flex: '0 0 auto' }}>
                <WeatherIcon glyph={glyphForCode(point.weatherCode, true)} size={18} />
              </span>
              <span style={{ width: 36, flex: '0 0 auto', textAlign: 'right', fontSize: 11, color: point.precipProb !== undefined && point.precipProb > 0 ? TOKEN.accent : TOKEN.fgMuted, ...NUM }}>
                {point.precipProb !== undefined ? `${point.precipProb}%` : '—'}
              </span>
              <span style={{ width: 36, flex: '0 0 auto', textAlign: 'right', color: TOKEN.fgMuted, ...NUM }}>
                {tempMin !== undefined ? fmt(tempMin) : '—'}
              </span>
              <span style={{ position: 'relative', flex: 1, height: 4, borderRadius: 2, background: TOKEN.bgSoft, overflow: 'hidden' }}>
                {hasRange && (
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
                )}
              </span>
              <span style={{ width: 38, flex: '0 0 auto', textAlign: 'right', fontWeight: 600, ...NUM }}>
                {tempMax !== undefined ? fmt(tempMax) : '—'}
              </span>
            </>
          )
          if (onSelectDay === undefined) {
            return <div key={point.date} style={row}>{cells}</div>
          }
          return (
            <button
              key={point.date}
              type="button"
              onClick={() => onSelectDay(point.date)}
              aria-label={`查看 ${dayLabel(point.date, index)} 天气详情`}
              style={{
                ...row,
                width: '100%',
                margin: 0,
                border: 'none',
                borderBottom: row.borderBottom,
                borderRadius: 6,
                background: 'transparent',
                color: 'inherit',
                fontFamily: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {cells}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** `2026-09-05` → `9月5日 周五` (parsed at local midnight to avoid a UTC day shift). */
function detailDateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日 ${weekdays[parsed.getDay()]}`
}

/** Day-detail panel: back button + summary + hourly list. Missing fields show —. */
export function DayDetailPanel(props: {
  detail: DayDetail
  units: UnitSetting
  onBack: () => void
}): ReactElement {
  const { detail, units, onBack } = props
  const hasSun = detail.sunrise !== undefined || detail.sunset !== undefined
  const hasSummary = detail.precipSum !== undefined || detail.windGustsMax !== undefined
  return (
    <div data-block="day-detail" style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={onBack}
          autoFocus
          style={{ ...actionButton, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 11px 4px 8px', flex: '0 0 auto' }}
        >
          <span aria-hidden="true" style={{ fontSize: 13, lineHeight: '13px' }}>←</span>
          <span>返回</span>
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, ...NUM }}>{detailDateLabel(detail.date)}</span>
        {hasSun && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: TOKEN.fgMuted }}>
            {detail.sunrise !== undefined && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Glyph name="sunrise" size={13} />
                {timeLabel(detail.sunrise)}
              </span>
            )}
            {detail.sunset !== undefined && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Glyph name="sunset" size={13} />
                {timeLabel(detail.sunset)}
              </span>
            )}
          </span>
        )}
      </div>
      {hasSummary && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 8, fontSize: 12, color: TOKEN.fgMuted }}>
          {detail.precipSum !== undefined && <span style={{ ...NUM }}>降水量 {detail.precipSum.toFixed(1)} mm</span>}
          {detail.windGustsMax !== undefined && <span style={{ ...NUM }}>最大阵风 {windText(detail.windGustsMax, units)}</span>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginTop: 8 }}>
        {detail.hourly.length === 0 && (
          <span style={{ fontSize: 12, color: TOKEN.fgMuted }}>暂无逐小时数据</span>
        )}
        {detail.hourly.map((point) => (
          <div
            key={point.time}
            style={{ flex: '0 0 auto', width: 50, textAlign: 'center', background: TOKEN.bgSoft, borderRadius: 10, padding: '5px 2px' }}
          >
            <div style={{ fontSize: 11, color: TOKEN.fgMuted, ...NUM }}>{hourLabel(point.time)}</div>
            <div style={{ margin: '2px 0', minHeight: 18 }}>
              {point.weatherCode !== undefined
                ? <WeatherIcon glyph={glyphForCode(point.weatherCode, point.isDay)} size={18} />
                : <span style={{ fontSize: 12, color: TOKEN.fgMuted }}>—</span>}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, ...NUM }}>
              {point.temperature !== undefined ? tempText(point.temperature, units) : '—'}
            </div>
            <div style={{ fontSize: 10, color: point.precipProb !== undefined && point.precipProb > 0 ? TOKEN.accent : TOKEN.fgMuted, ...NUM }}>
              {point.precipProb !== undefined ? `${point.precipProb}%` : '—'}
            </div>
            <div style={{ fontSize: 9.5, lineHeight: '12px', color: TOKEN.fgMuted, whiteSpace: 'nowrap', ...NUM }}>
              {point.windSpeed !== undefined ? windText(point.windSpeed, units) : '—'}
            </div>
            <div style={{ fontSize: 9.5, lineHeight: '12px', color: TOKEN.fgMuted, whiteSpace: 'nowrap', ...NUM }}>
              {point.humidity !== undefined ? `${Math.round(point.humidity)}%` : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
