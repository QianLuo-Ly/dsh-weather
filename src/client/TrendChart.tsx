/**
 * Temperature trend chart with indicators: a dependency-free SVG line chart
 * showing the 24h temperature curve with the day's high / low annotated in a
 * left gutter (with dashed guide lines), a ring marker at "now" (the first
 * point), and hour labels along the baseline. Designed for a full-width hero
 * slot: the 640-unit viewBox renders ~1:1 in a ~620px container.
 */
import { useId, type ReactElement } from 'react'

export interface TrendChartProps {
  /** Temperature values (hours, ascending). */
  values: number[]
  /** Optional per-point labels (rendered at a few anchor indices). */
  labels?: string[]
  /** Chart height in px; width flows with the container. */
  height?: number
  /** Unit suffix for the high/low annotations (°C / °F). */
  unit?: string
}

const WIDTH = 640
/** Left gutter reserved for the high/low annotations. */
const PAD_X = 52
const PAD_Y = 16

const ACCENT = 'var(--dsw-alias-brand-primary, #4f8cff)'
const MUTED = 'var(--dshw-fg-muted, #5f6672)'
const DOT_EDGE = 'var(--dsw-alias-bg-layer-2, #ffffff)'

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}

export function TrendChart(props: TrendChartProps): ReactElement {
  const { values, labels, height = 88, unit = '' } = props
  const gradientId = useId()

  if (values.length < 2) {
    return <div style={{ fontSize: 12, color: MUTED }}>数据不足</div>
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = (WIDTH - PAD_X * 2) / (values.length - 1)
  const points = values.map((value, index) => ({
    x: PAD_X + index * stepX,
    y: PAD_Y + (height - PAD_Y * 2) * (1 - (value - min) / span),
  }))
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${PAD_X},${height - PAD_Y} ${line} ${WIDTH - PAD_X},${height - PAD_Y}`

  const labelIndices = [...new Set([
    0,
    Math.floor((values.length - 1) / 3),
    Math.floor(((values.length - 1) * 2) / 3),
    values.length - 1,
  ])]
  const first = points[0]
  const last = points[points.length - 1]
  const showExtremes = max !== min
  const maxPoint = points[values.indexOf(max)]
  const minPoint = points[values.indexOf(min)]

  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} width="100%" height={height} style={{ display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: ACCENT, stopOpacity: 0.3 }} />
          <stop offset="100%" style={{ stopColor: ACCENT, stopOpacity: 0.02 }} />
        </linearGradient>
      </defs>

      <polygon points={area} fill={`url(#${gradientId})`} />

      {showExtremes && (
        <>
          {/* Guide lines at the day's high and low */}
          <line x1={PAD_X} y1={maxPoint.y} x2={WIDTH - PAD_X} y2={maxPoint.y} stroke={ACCENT} strokeOpacity={0.3} strokeWidth={1} strokeDasharray="3 3" />
          <line x1={PAD_X} y1={minPoint.y} x2={WIDTH - PAD_X} y2={minPoint.y} stroke={ACCENT} strokeOpacity={0.16} strokeWidth={1} strokeDasharray="3 3" />
          {/* High / low annotations in the left gutter */}
          <text x={PAD_X - 6} y={maxPoint.y + 4} textAnchor="end" fontSize={12} fontWeight={700} style={{ fill: ACCENT }}>
            {Math.round(max)}{unit}
          </text>
          <text x={PAD_X - 6} y={minPoint.y + 4} textAnchor="end" fontSize={12} fontWeight={700} style={{ fill: MUTED }}>
            {Math.round(min)}{unit}
          </text>
        </>
      )}

      <polyline
        points={line}
        fill="none"
        style={{ stroke: ACCENT }}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* "Now" ring on the first (current) point */}
      <circle cx={first.x} cy={first.y} r={3.5} fill={ACCENT} style={{ stroke: DOT_EDGE }} strokeWidth={1.5} />
      {/* Solid dot on the last point */}
      <circle cx={last.x} cy={last.y} r={2.5} fill={ACCENT} />

      {labels !== undefined && labelIndices.map((index) => (
        <text
          key={index}
          x={points[index].x}
          y={height - 4}
          textAnchor={index === 0 ? 'start' : index === values.length - 1 ? 'end' : 'middle'}
          fontSize={10.5}
          style={{ fill: MUTED }}
        >
          {labels[index]}
        </text>
      ))}
    </svg>
  )
}
