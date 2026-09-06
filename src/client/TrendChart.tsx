/**
 * Temperature trend chart with indicators: a dependency-free SVG line chart
 * showing the 24h temperature curve with the day's high / low annotated in a
 * left gutter (with dashed guide lines), a ring marker at "now" (the first
 * point), and hour labels along the baseline. Designed for a full-width hero
 * slot: the 640-unit viewBox renders ~1:1 in a ~620px container.
 */
import { useId, type ReactElement } from 'react'
import { TOKEN } from './theme'

export interface TrendChartProps {
  /** Temperature values (掳C, ascending hours). */
  values: number[]
  /** Optional per-point labels (rendered at a few anchor indices). */
  labels?: string[]
  /** Chart height in px; width flows with the container. */
  height?: number
  /** Unit suffix for the high/low annotations (掳C / 掳F). */
  unit?: string
}

const WIDTH = 640
/** Left gutter reserved for the high/low annotations. */
const PAD_X = 52
const PAD_Y = 16

export function TrendChart(props: TrendChartProps): ReactElement {
  const { values, labels, height = 88, unit = '' } = props
  const gradientId = useId()

  if (values.length < 2) {
    return <div style={{ fontSize: 12, color: TOKEN.fgMuted }}>鏁版嵁涓嶈冻</div>
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
          <stop offset="0%" style={{ stopColor: TOKEN.accent, stopOpacity: 0.3 }} />
          <stop offset="100%" style={{ stopColor: TOKEN.accent, stopOpacity: 0.02 }} />
        </linearGradient>
      </defs>

      <polygon points={area} fill={`url(#${gradientId})`} />

      {showExtremes && (
        <>
          {/* Guide lines at the day's high and low */}
          <line x1={PAD_X} y1={maxPoint.y} x2={WIDTH - PAD_X} y2={maxPoint.y} stroke={TOKEN.accent} strokeOpacity={0.3} strokeWidth={1} strokeDasharray="3 3" />
          <line x1={PAD_X} y1={minPoint.y} x2={WIDTH - PAD_X} y2={minPoint.y} stroke={TOKEN.accent} strokeOpacity={0.16} strokeWidth={1} strokeDasharray="3 3" />
          {/* High / low annotations in the left gutter */}
          <text x={PAD_X - 6} y={maxPoint.y + 4} textAnchor="end" fontSize={12} fontWeight={700} style={{ fill: TOKEN.accent }}>
            {Math.round(max)}{unit}
          </text>
          <text x={PAD_X - 6} y={minPoint.y + 4} textAnchor="end" fontSize={12} fontWeight={700} style={{ fill: TOKEN.fgMuted }}>
            {Math.round(min)}{unit}
          </text>
        </>
      )}

      <polyline
        points={line}
        fill="none"
        style={{ stroke: TOKEN.accent }}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* "Now" ring on the first (current) point */}
      <circle cx={first.x} cy={first.y} r={3.5} fill={TOKEN.accent} style={{ stroke: TOKEN.bg }} strokeWidth={1.5} />
      {/* Solid dot on the last point */}
      <circle cx={last.x} cy={last.y} r={2.5} fill={TOKEN.accent} />

      {labels !== undefined && labelIndices.map((index) => (
        <text
          key={index}
          x={points[index].x}
          y={height - 4}
          textAnchor={index === 0 ? 'start' : index === values.length - 1 ? 'end' : 'middle'}
          fontSize={10.5}
          style={{ fill: TOKEN.fgMuted }}
        >
          {labels[index]}
        </text>
      ))}
    </svg>
  )
}
