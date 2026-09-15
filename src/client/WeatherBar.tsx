/**
 * Session-header weather chip. Registered into the app-reserved
 * `conversation.session.header.actions` seat (not a floating overlay), so it
 * sits in the conversation column's own chrome row and can never collide with
 * other plugins' floating controls (sidebars, whales, status pills…).
 *
 * Collapsed it is one compact chip — weather icon, temperature, condition and a
 * live date/time (minute-aligned clock) — always visible while a session is
 * open. Clicking it opens a popover (anchored to the chip) holding the location
 * header, the saved-city switcher, current-weather hero, stat chips, the 24h
 * temperature trend, the hourly strip, the 7-day forecast, per-day detail, and
 * the unit / refresh controls.
 *
 * All data & side-effect logic lives in hooks.ts (location + IP-drift, feed +
 * stale degrade, saved cities, daily brief, notifications, tab title, day
 * detail); this file is layout, interaction and derived display text.
 *
 * Display units are applied here via units.ts — the feed is metric, so a unit
 * toggle never re-fetches and a cached snapshot stays valid across switches.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_WEATHER_CONFIG, placeKey, sameConfig, sanitizeConfig, type WeatherConfig } from '../config-shared'
import { evaluateAlerts } from './weather-api'
import {
  aqiInfo,
  clockDate,
  clockTime,
  describeCondition,
  hhmm,
  hourLabel,
  rainTimingText,
  timeLabel,
  uvLevel,
  weatherAdvice,
  windDirectionText,
} from './condition'
import {
  placeNameOf,
  useAutoLocation,
  useConfigWriter,
  useDailyBrief,
  useDayDetail,
  useSavedLocations,
  useTabTitle,
  useWeatherFeed,
  useWeatherNotifications,
} from './hooks'
import { Glyph, WeatherIcon, type GlyphName } from './icons'
import { DailyList, DayDetailPanel, HourlyStrip, RainStrip, StatChip, TodayFacts, type TodayFactItem } from './panels'
import { TrendChart } from './TrendChart'
import { NUM, TOKEN, actionButton, baseButton, BANNER, iconButton, segmentButton, SHADOW } from './theme'
import { tempNumber, tempText, unitLabel, windNumber, windText, windUnitLabel } from './units'

export interface WeatherBarProps {
  scope: SettingsScope<WeatherConfig>
}

type Status = 'locating' | 'loading' | 'ready' | 'error'

const POPOVER_MAX_WIDTH = 560
const POPOVER_MIN_WIDTH = 280
const POPOVER_EDGE_GAP = 16

/**
 * Live local clock driving the chip's date/time text. Self-contained so its
 * minute-aligned re-render never touches the (comparatively heavy) chart and
 * forecast subtrees of WeatherBar.
 */
function LiveClock(): ReactElement {
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    let timer = 0
    const refresh = (): void => {
      setNow(new Date())
      timer = window.setTimeout(refresh, 60_000 - (Date.now() % 60_000) + 20)
    }
    timer = window.setTimeout(refresh, 60_000 - (Date.now() % 60_000) + 20)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <span style={clockSpan}>
      {clockDate(now)} {clockTime(now)}
    </span>
  )
}

export function WeatherBar(props: WeatherBarProps): ReactElement | null {
  const { scope } = props
  const [config, setConfig] = useState<WeatherConfig | undefined>(() => sanitizeConfig(scope.getSnapshot().value))
  const [open, setOpen] = useState(false)
  // Popover geometry measured when the chip opens: which side to grow from and
  // how wide it may be before touching the viewport edge.
  const [pop, setPop] = useState<{ align: 'start' | 'end'; width: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()

  // Keep the config snapshot in sync with settings changes — normalized so a
  // hand-edited or older settings document can never yield undefined/NaN
  // fields. Snapshots are rebuilt objects, so an unchanged section keeps the
  // previous reference (otherwise every unrelated snapshot re-renders us).
  useEffect(() => {
    const sync = (): void => {
      const next = sanitizeConfig(scope.getSnapshot().value)
      setConfig((prev) => (sameConfig(prev, next) ? prev : next))
    }
    sync()
    return scope.subscribe(sync)
  }, [scope])

  const effective = config ?? DEFAULT_WEATHER_CONFIG

  // Data & side effects.
  const { location, locating, error: locationError, relocate, driftNotice } = useAutoLocation({ scope, effective })
  const feed = useWeatherFeed({ effective, location })
  const saved = useSavedLocations({ scope, effective })
  const day = useDayDetail(location)
  const writer = useConfigWriter(scope)
  const data = feed.data
  const name = placeNameOf(effective, location)
  // The saved entry matching the displayed coordinates (null when the current
  // location is custom/auto) — drives the ☆ toggle and the chip highlight.
  const savedMatch = location === null
    ? undefined
    : saved.saved.find((entry) => placeKey(entry.latitude, entry.longitude) === placeKey(location.latitude, location.longitude))
  const status: Status = locating
    ? (effective.locationMode === 'manual' ? 'loading' : 'locating')
    : location === null
      ? 'error'
      : feed.status
  const error = locationError ?? feed.error

  useWeatherNotifications({ effective, data, location, placeName: name, stale: feed.stale })
  useDailyBrief({ effective, data, location, placeName: name, stale: feed.stale })
  useTabTitle({ effective, data, status, placeName: name })

  // The transient toast under the chip: IP-drift switches and saved-city
  // feedback share one slot.
  const toast = driftNotice ?? saved.notice

  const measurePopover = useCallback((): void => {
    if (barRef.current === null) return
    const rect = barRef.current.getBoundingClientRect()
    const rightRoom = window.innerWidth - rect.right - POPOVER_EDGE_GAP
    const leftRoom = rect.left - POPOVER_EDGE_GAP
    if (rightRoom >= leftRoom) {
      setPop({ align: 'start', width: Math.min(POPOVER_MAX_WIDTH, Math.max(POPOVER_MIN_WIDTH, rect.width + rightRoom)) })
    } else {
      setPop({ align: 'end', width: Math.min(POPOVER_MAX_WIDTH, Math.max(POPOVER_MIN_WIDTH, rect.width + leftRoom)) })
    }
  }, [])

  const closePopover = useCallback((restoreFocus: boolean): void => {
    setOpen(false)
    if (restoreFocus && chipRef.current !== null) chipRef.current.focus()
  }, [])

  // Toggle the popover. On open, measure the chip's viewport position once and
  // let the popover grow from the side with more room.
  const togglePopover = (): void => {
    const next = !open
    if (next) {
      measurePopover()
    } else {
      closePopover(true)
      return
    }
    setOpen(next)
  }

  // Close the popover when the user clicks anywhere outside it, or presses Esc.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      if (barRef.current !== null && !barRef.current.contains(event.target as Node)) {
        closePopover(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closePopover(true)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closePopover])

  // Re-measure while open (viewport resize / zoom).
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', measurePopover)
    return () => window.removeEventListener('resize', measurePopover)
  }, [open, measurePopover])

  // Move keyboard focus into the dialog on open.
  useEffect(() => {
    if (open && popoverRef.current !== null) popoverRef.current.focus()
  }, [open])

  // Jump to the top when a day-detail view takes over the popover body.
  useEffect(() => {
    if (day.date !== null && popoverRef.current !== null) popoverRef.current.scrollTop = 0
  }, [day.date])

  // Closing the popover also closes the day-detail view (the state lives here
  // while the panel is a child that unmounts) and cancels its in-flight
  // request, so reopening never lands on a stale sub-view.
  useEffect(() => {
    if (!open) day.close()
  }, [open, day.close])

  const units = effective.units
  const fmt = (value: number): string => tempText(value, units)
  // Comparatively heavy derived text: keep it stable across the minute tick and
  // unrelated state changes instead of recomputing on every render.
  const alerts = useMemo(
    () => (data === null ? [] : evaluateAlerts(data, fmt, (kmh) => windText(kmh, units))),
    [data, units],
  )
  const advice = useMemo(() => (data === null ? null : weatherAdvice(data)), [data])
  // The feed is metric, the chart plots what it is given and only labels it with
  // `unitSuffix` — so convert here, or a °F axis would print °C numbers.
  const trendValues = useMemo(
    () => data?.hourly.map((point) => tempNumber(point.temperature, units)) ?? [],
    [data, units],
  )
  const trendLabels = useMemo(() => data?.hourly.map((point) => hourLabel(point.time)) ?? [], [data])

  if (!effective.enabled) return null

  // Read-only connections (process-local preferences, host without the
  // namespace) silently drop writes — disable the controls instead of letting
  // them look like they worked.
  const writable = scope.getSnapshot().writable
  const condition = data !== null ? describeCondition(data.current.weatherCode, data.current.isDay) : null
  const unitSuffix = unitLabel(units)
  const windSuffixLabel = windUnitLabel(units)

  // Text shown in the chip while weather is not ready yet (temp takes its place
  // once `ready`); keeps the chip meaningful during locating / loading / error.
  const busyText = status === 'locating'
    ? '定位中…'
    : status === 'loading'
      ? '加载中…'
      : status === 'error'
        ? '加载失败'
        : null

  const showTemp = status === 'ready' && data !== null
  const barIcon = showTemp
    ? <WeatherIcon code={data.current.weatherCode} isDay={data.current.isDay} size={17} />
    : <Glyph name="pin" size={15} />

  // Chip tooltip: full context at a glance without widening the header chip.
  const chipTitle = [
    name,
    showTemp && condition !== null ? condition.label : undefined,
    showTemp ? fmt(data.current.temperature) : undefined,
  ].filter((part): part is string => typeof part === 'string').join(' · ')

  const hasDanger = alerts.some((alert) => alert.level === 'danger')
  const air = data?.air
  const airInfo = air !== undefined && air.aqi !== undefined ? aqiInfo(air.aqi) : null

  // Derived display values for the extended environment facts.
  const cur = data?.current
  const windDisplayValue = windNumber(cur?.windSpeed, units)
  const windDeg = cur?.windDirection
  const windTextValue = windDeg !== undefined ? windDirectionText(windDeg) : undefined
  const gustTextValue = cur?.windGusts !== undefined ? windText(cur.windGusts, units) : undefined
  const dewPointTextValue = cur?.dewPoint !== undefined ? tempText(cur.dewPoint, units) : undefined
  const pressureTextValue = cur?.pressure !== undefined ? `${Math.round(cur.pressure)} hPa` : undefined
  // Sub-10 km readings are what actually matter (fog, haze), so keep one decimal
  // there instead of rounding 0.4 km to a reassuring "0 km".
  const visibilityTextValue = cur?.visibility !== undefined
    ? `${cur.visibility < 10 ? cur.visibility.toFixed(1) : Math.round(cur.visibility)} km`
    : undefined
  const cloudTextValue = cur?.cloudCover !== undefined ? `${Math.round(cur.cloudCover)}%` : undefined
  const rainTotal = data?.daily[0]?.precipSum
  const rainTotalText = rainTotal !== undefined && rainTotal >= 0.05 ? `${rainTotal.toFixed(1)} mm` : undefined

  // "今日信息" wrap-row entries, assembled conditionally so only fields the
  // feed actually returned are shown.
  const fact = (glyph: GlyphName | undefined, text: string): TodayFactItem => ({ glyph, text })
  const todayItems: TodayFactItem[] = []
  if (data?.sunrise !== undefined) todayItems.push(fact('sunrise', timeLabel(data.sunrise)))
  if (data?.sunset !== undefined) todayItems.push(fact('sunset', timeLabel(data.sunset)))
  if (data?.uvIndexMax !== undefined) todayItems.push(fact('sun', `UV ${Math.round(data.uvIndexMax)} ${uvLevel(data.uvIndexMax)}`))
  if (air?.pm25 !== undefined) todayItems.push(fact(undefined, `PM2.5 ${Math.round(air.pm25)}`))
  if (windTextValue !== undefined) todayItems.push(fact('wind', windTextValue))
  if (gustTextValue !== undefined) todayItems.push(fact('wind', `阵风 ${gustTextValue}`))
  if (dewPointTextValue !== undefined) todayItems.push(fact('droplet', `露点 ${dewPointTextValue}`))
  if (pressureTextValue !== undefined) todayItems.push(fact('gauge', `气压 ${pressureTextValue}`))
  if (visibilityTextValue !== undefined) todayItems.push(fact('eye', `能见度 ${visibilityTextValue}`))
  if (cloudTextValue !== undefined) todayItems.push(fact('cloud', `云量 ${cloudTextValue}`))
  if (rainTotalText !== undefined) todayItems.push(fact('droplet', `今日雨量 ${rainTotalText}`))

  const banner = hasDanger ? BANNER.danger : BANNER.warning

  // One "retry" semantics for both error states: re-fetch the CURRENT location
  // when one exists; only when we never resolved a location does retry mean
  // "locate again" (and bypass the auto cache).
  const retry = (): void => {
    if (location === null) relocate()
    else feed.refresh()
  }

  const manualMissingCoords = effective.locationMode === 'manual'
    && (effective.latitude === undefined || effective.longitude === undefined)

  const pendingLabel = status === 'locating' ? '定位中…' : '天气加载中…'

  return (
    <div ref={barRef} className="dshw-root" style={{ position: 'relative', display: 'inline-flex', fontSize: 13 }}>
      <button
        ref={chipRef}
        type="button"
        className="dshw-bar"
        onClick={togglePopover}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={popoverId}
        title={chipTitle}
        style={chipButton}
      >
        <span style={chipIconWrap}>{barIcon}</span>
        {showTemp ? (
          <>
            <span style={chipTemp}>{fmt(data.current.temperature)}</span>
            {condition !== null && <span style={chipCondition}>{condition.label}</span>}
          </>
        ) : busyText !== null ? (
          <span style={{ fontSize: 14, lineHeight: '20px', color: TOKEN.fgMuted, whiteSpace: 'nowrap', ...(status === 'error' ? { color: TOKEN.danger } : {}) }}>
            {busyText}
          </span>
        ) : null}
        {/* Live date & time — always visible on the chip, whether the popover
            is collapsed or expanded. Rendered by its own component so the
            minute tick does not re-render the whole bar. */}
        <LiveClock />
      </button>

      {open && pop !== null && (
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-modal="false"
          aria-label="天气详情"
          tabIndex={-1}
          className="dshw-popover"
          style={{
            ...popoverStyle,
            width: pop.width,
            ...(pop.align === 'start' ? { left: 0 } : { right: 0 }),
            outline: 'none',
          }}
        >
          {status === 'error' && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: TOKEN.danger }}>{error ?? '加载失败'}</div>
              {!manualMissingCoords && (
                <button type="button" onClick={retry} style={actionButton}>
                  ⟳ 重试
                </button>
              )}
            </div>
          )}

          {/* Saved-city / drift feedback while the popover is open (the floating
              toast is hidden then, so it would otherwise be swallowed). */}
          {toast !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12.5, color: TOKEN.fg, background: TOKEN.bgSoft, border: `1px solid ${TOKEN.accent}`, borderRadius: 10, padding: '6px 10px' }}>
              📍 <span>{toast}</span>
            </div>
          )}

          {/* Header + saved-city switcher stay mounted in EVERY status (locating /
              loading / error) so the user can always switch cities or return to
              当前位置 — only the forecast body below is status-gated. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <Glyph name="pin" size={14} />
              <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              {location?.source === 'gps' && (
                <span style={{ flex: '0 0 auto', fontSize: 9.5, fontWeight: 700, color: TOKEN.accent, border: `1px solid ${TOKEN.accent}`, borderRadius: 999, padding: '0 5px', lineHeight: '14px' }}>
                  GPS
                </span>
              )}
              {location?.source === 'ip' && (
                <span style={{ flex: '0 0 auto', fontSize: 9.5, fontWeight: 700, color: TOKEN.fgMuted, border: `1px solid ${TOKEN.border}`, borderRadius: 999, padding: '0 5px', lineHeight: '14px' }}>
                  IP
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: '0 0 auto' }}>
              <button
                type="button"
                onClick={() => {
                  if (savedMatch !== undefined) saved.remove(savedMatch.id)
                  else saved.addCurrent()
                }}
                disabled={!writable}
                title={savedMatch !== undefined ? `取消收藏 ${name}` : '收藏当前城市'}
                aria-label={savedMatch !== undefined ? `取消收藏 ${name}` : '收藏当前城市'}
                aria-pressed={savedMatch !== undefined}
                style={{ ...iconButton, ...(writable ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}
              >
                <span style={{ fontSize: 15, lineHeight: '16px' }}>{savedMatch !== undefined ? '★' : '☆'}</span>
              </button>
              <button type="button" onClick={feed.refresh} title="刷新" aria-label="刷新天气" style={iconButton}>
                <Glyph name="refresh" size={14} />
              </button>
            </div>
          </div>

          {/* Saved-city switcher */}
          {saved.saved.length > 0 && (
            <div role="group" aria-label="切换城市" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
              <button
                type="button"
                onClick={saved.useCurrent}
                aria-pressed={effective.locationMode === 'auto'}
                style={effective.locationMode === 'auto' ? switchChipActive : switchChip}
              >
                当前位置
              </button>
              {saved.saved.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => saved.switchTo(entry.id)}
                  title={`${entry.latitude.toFixed(3)}, ${entry.longitude.toFixed(3)}`}
                  aria-pressed={saved.activeId === entry.id}
                  style={saved.activeId === entry.id ? switchChipActive : switchChip}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          )}

          {status === 'ready' && data !== null && (
            <>
              {day.date !== null ? (
                /* ── Day detail view ─────────────────────────────────────── */
                day.error !== null ? (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: TOKEN.danger }}>{day.error}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button type="button" onClick={day.retry} style={actionButton}>⟳ 重试</button>
                      <button type="button" onClick={day.close} style={actionButton}>← 返回</button>
                    </div>
                  </div>
                ) : day.detail !== null ? (
                  <DayDetailPanel detail={day.detail} units={units} onBack={day.close} />
                ) : (
                  <div style={{ color: TOKEN.fgMuted, textAlign: 'center', padding: 20 }}>加载当日详情…</div>
                )
              ) : (
                /* ── Normal forecast view ────────────────────────────────── */
                <>
                  {/* Stale-snapshot banner: the last refresh failed, showing cached data */}
                  {feed.stale && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, lineHeight: '17px', color: BANNER.warning.color, background: BANNER.warning.bg, border: `1px solid ${BANNER.warning.border}`, borderRadius: 10, padding: '6px 10px' }}>
                      <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                        数据更新失败{error !== null ? `（${error}）` : ''}，显示 {feed.updatedAt !== null ? `${hhmm(feed.updatedAt)} 的` : '上次'}快照
                      </span>
                      <button type="button" onClick={retry} style={actionButton}>⟳ 重试</button>
                    </div>
                  )}

                  {/* Alert banner */}
                  {alerts.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 6,
                        marginBottom: 10,
                        fontSize: 12,
                        lineHeight: '17px',
                        color: banner.color,
                        background: banner.bg,
                        border: `1px solid ${banner.border}`,
                        borderRadius: 10,
                        padding: '6px 10px',
                      }}
                    >
                      <span>⚠</span>
                      <span>{alerts.map((a) => `${a.title}：${a.detail}`).join('；')}</span>
                    </div>
                  )}

                  {/* Hero + stat grid (side by side) */}
                  <div data-block="hero-stats" style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 4 }}>
                    <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 58, height: 58, borderRadius: 16, background: TOKEN.bgSoft, border: `1px solid ${TOKEN.border}` }}>
                        <WeatherIcon code={data.current.weatherCode} isDay={data.current.isDay} size={36} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 30, fontWeight: 700, lineHeight: '34px', ...NUM }}>{fmt(data.current.temperature)}</div>
                        <div style={{ fontSize: 12.5, color: TOKEN.fgMuted, lineHeight: '17px', marginTop: 1 }}>
                          {condition?.label} · 体感 {fmt(data.current.apparentTemperature)}
                        </div>
                      </div>
                    </div>
                    <div style={{ flex: '1 1 0', minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      <StatChip
                        icon={<Glyph name="droplet" size={13} />}
                        label="湿度"
                        value={cur?.humidity !== undefined ? `${Math.round(cur.humidity)}%` : '--'}
                      />
                      <StatChip
                        icon={<Glyph name="wind" size={13} />}
                        label="风速"
                        value={windDisplayValue !== undefined ? `${Math.round(windDisplayValue)}` : '--'}
                        suffix={windDisplayValue !== undefined ? windSuffixLabel : undefined}
                      />
                      <StatChip icon={<Glyph name="umbrella" size={13} />} label="今日降水" value={data.daily[0] !== undefined ? `${data.daily[0].precipProb}%` : '--'} />
                      <StatChip
                        icon={<Glyph name="wind" size={13} />}
                        label="空气"
                        value={airInfo !== null ? `${airInfo.label} ${air?.aqi}` : '--'}
                        valueColor={airInfo?.color}
                      />
                    </div>
                  </div>

                  {/* Today facts */}
                  <TodayFacts items={todayItems} />

                  {/* 15-minute precipitation strip */}
                  {data.minutely !== undefined && data.minutely.length > 0 && (
                    <div data-block="rain" style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: TOKEN.fgMuted }}>未来 6 小时降水</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: data.rainSoon?.rainingNow === true || data.rainSoon?.onsetMinutes !== undefined ? TOKEN.accent : TOKEN.fgMuted }}>
                          {rainTimingText(data.rainSoon ?? { rainingNow: false })}
                        </span>
                      </div>
                      <RainStrip points={data.minutely} />
                    </div>
                  )}

                  {/* One-line advice */}
                  {advice !== null && (
                    <div data-block="advice" style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontSize: 12.5, color: TOKEN.fgMuted, background: TOKEN.bgSoft, borderRadius: 10, padding: '8px 12px' }}>
                      <span>{advice.icon}</span>
                      <span>{advice.text}</span>
                    </div>
                  )}

                  <div data-block="trend" style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: TOKEN.fgMuted, marginBottom: 4 }}>未来 24 小时温度</div>
                    <TrendChart
                      values={trendValues}
                      labels={trendLabels}
                      unit={unitSuffix}
                      height={56}
                    />
                  </div>

                  <HourlyStrip title="未来 12 小时" points={data.hourly.slice(0, 12)} fmt={fmt} />

                  <DailyList
                    title="未来 7 天（点击查看当日详情）"
                    points={data.daily}
                    fmt={fmt}
                    onSelectDay={day.open}
                  />
                </>
              )}

              {/* Footer controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${TOKEN.border}` }}>
                <span style={{ fontSize: 12, color: TOKEN.fgMuted }}>单位</span>
                <div role="group" aria-label="温度单位" style={{ display: 'flex', background: TOKEN.bgSoft, borderRadius: 999, padding: 2 }}>
                  <button
                    type="button"
                    disabled={!writable}
                    aria-pressed={units === 'celsius'}
                    onClick={() => { void writer.write('units', 'celsius') }}
                    title={writable ? undefined : '当前连接不支持修改设置'}
                    style={{ ...segmentButton, fontWeight: units === 'celsius' ? 700 : 400, background: units === 'celsius' ? TOKEN.bg : 'transparent', ...(writable ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}
                  >
                    °C
                  </button>
                  <button
                    type="button"
                    disabled={!writable}
                    aria-pressed={units === 'fahrenheit'}
                    onClick={() => { void writer.write('units', 'fahrenheit') }}
                    title={writable ? undefined : '当前连接不支持修改设置'}
                    style={{ ...segmentButton, fontWeight: units === 'fahrenheit' ? 700 : 400, background: units === 'fahrenheit' ? TOKEN.bg : 'transparent', ...(writable ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}
                  >
                    °F
                  </button>
                </div>
                {effective.locationMode === 'auto' && (
                  <button type="button" onClick={relocate} style={actionButton}>
                    📍 重新定位
                  </button>
                )}
              </div>
            </>
          )}

          {status !== 'ready' && status !== 'error' && (
            <div style={{ color: TOKEN.fgMuted, textAlign: 'center', padding: 20 }}>
              {pendingLabel}
            </div>
          )}
        </div>
      )}

      {/* Under-chip toast: IP-drift city switches and saved-city feedback.
          Hidden while the popover is open so they do not overlap. */}
      {toast !== null && !open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            ...(pop?.align === 'end' ? { right: 0 } : { left: 0 }),
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: TOKEN.bg,
            color: TOKEN.fg,
            border: `1px solid ${TOKEN.accent}`,
            borderRadius: 10,
            boxShadow: SHADOW.floating,
            padding: '6px 12px',
            fontSize: 12.5,
            whiteSpace: 'nowrap',
          }}
        >
          📍 <b>{toast}</b>
        </div>
      )}
    </div>
  )
}

/** Chip-level geometry/styles (kept beside the component they style). */
const chipButton: CSSProperties = {
  ...baseButton,
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  background: TOKEN.bgSoft,
  color: TOKEN.fg,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: '3px 10px 3px 5px',
  cursor: 'pointer',
  maxWidth: 'min(280px, 42vw)',
  textAlign: 'left',
}

const chipIconWrap: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: TOKEN.bg,
  border: `1px solid ${TOKEN.border}`,
  color: TOKEN.fg,
  alignSelf: 'center',
}

const chipTemp: CSSProperties = { fontSize: 17, fontWeight: 700, lineHeight: '22px', ...NUM, flex: '0 0 auto' }

const chipCondition: CSSProperties = { fontSize: 14, lineHeight: '20px', color: TOKEN.fgMuted, whiteSpace: 'nowrap', flex: '0 0 auto' }

const clockSpan: CSSProperties = {
  flex: '0 0 auto',
  fontSize: 14,
  lineHeight: '20px',
  color: TOKEN.fgMuted,
  whiteSpace: 'nowrap',
  paddingLeft: 8,
  borderLeft: `1px solid ${TOKEN.border}`,
  ...NUM,
}

const switchChip: CSSProperties = {
  ...baseButton,
  flex: '0 0 auto',
  fontSize: 12,
  lineHeight: '18px',
  color: TOKEN.fg,
  background: TOKEN.bgSoft,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: '2px 10px',
  cursor: 'pointer',
  maxWidth: 140,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const switchChipActive: CSSProperties = {
  ...switchChip,
  border: `1px solid ${TOKEN.accent}`,
  color: TOKEN.accent,
  fontWeight: 600,
}

const popoverStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  zIndex: 60,
  maxWidth: 'calc(100vw - 24px)',
  maxHeight: 'calc(100vh - 150px)',
  overflowY: 'auto',
  background: TOKEN.bg,
  color: TOKEN.fg,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 16,
  boxShadow: SHADOW.popover,
  padding: 14,
  fontSize: 13.5,
  textAlign: 'left',
}
