/**
 * Presentational panels for the weather popover — pure renders driven by
 * plain props, extracted from WeatherBar.tsx so that file keeps the data &
 * interaction logic and each block is testable/themeable on its own.
 *
 * All of them read the shared {@link TOKEN} / {@link NUM} presets and the
 * condition/icon helpers; none of them touches settings, fetching or state.
 */
import type { CSSProperties, ReactElement } from 'react'
import type { DailyPoint, DayDetail, HourlyPoint, MinutelyPoint } from './weather-api'
import { RAIN_MM_PER_15MIN } from './weather-api'
import { dayLabel, hourLabel, timeLabel } from './condition'
import { Glyph, WeatherIcon, type GlyphName } from './icons'
import { actionButton, NUM, PALETTE, TOKEN } from './theme'
import { tempText, windText, type UnitSetting } from './units'

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

/**
 * 7-day forecast rows with temperature-range gradient bars.
 *
 * `onSelectDay` makes every row openable (the row becomes a real button);
 * without it the rows stay inert and render exactly as before.
 */
export function DailyList(props: {
  title: string
  points: DailyPoint[]
  fmt: (value: number) => string
  /** 点击某一行时回传该行的日期（`YYYY-MM-DD`）；不传则行不可点。 */
  onSelectDay?: (date: string) => void
}): ReactElement {
  const { title, points, fmt, onSelectDay } = props
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
          // Shared row metrics, so the clickable (button) and inert (div) rows
          // stay pixel-identical — a button only adds the UA resets below.
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

/** `2026-09-05` → `9月5日 周五`（按本地零点解析，避免 UTC 偏移串到前一天）。 */
function detailDateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日 ${weekdays[parsed.getDay()]}`
}

/** 某一天的详情面板：顶部返回按钮 + 当日概况 + 逐小时列表。缺报字段显示 —。 */
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
                ? <WeatherIcon code={point.weatherCode} isDay={point.isDay} size={18} />
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
