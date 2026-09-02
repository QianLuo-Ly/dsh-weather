/**
 * Top-center weather bar. Registered into the `shell.overlay` slot by the
 * browser half: a compact pill (location + current condition) with a
 * click-to-open popover holding the current-weather hero, stat chips, the
 * 24h temperature trend, the hourly strip, the 7-day forecast, and the
 * unit / refresh controls. Icons are Feather-style SVGs; the pill closes on
 * outside clicks or Escape.
 *
 * The popover lays out in two balanced columns so everything fits one screen
 * without a scrollbar on typical viewports (a scrollbar only appears as a
 * fallback on very short windows). Surfaces and text use the `--dsw-alias-*`
 * design tokens, so both light and dark mode keep solid contrast.
 *
 * Styling is inline and tokenized (with plain fallbacks) plus one injected
 * stylesheet for animations.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { WeatherConfig } from '../config-shared'
import {
  cityLevelName,
  evaluateAlerts,
  fetchWeather,
  haversineKm,
  resolveAutoLocation,
  resolveLocationByIp,
  runLocationDiagnostics,
  type GeoLocation,
  type LocationDiagnostics,
  type WeatherData,
} from './weather-api'
import { aqiInfo, dayLabel, describeCondition, hourLabel, timeLabel, uvLevel, weatherAdvice } from './condition'
import { Glyph, WeatherIcon } from './icons'
import { TrendChart } from './TrendChart'
import { WeatherSettingsSection } from './WeatherSettings'

export interface WeatherBarProps {
  scope: SettingsScope<WeatherConfig>
}

type Status = 'idle' | 'locating' | 'loading' | 'ready' | 'error'

/** Shown until the settings namespace resolves; matches the Host schema defaults. */
const FALLBACK_CONFIG: WeatherConfig = {
  enabled: true,
  locationMode: 'auto',
  units: 'celsius',
  refreshMinutes: 15,
  alertsEnabled: false,
}

const TOKEN = {
  bg: 'var(--dsw-alias-bg-layer-2, #f3f4f6)',
  bgSoft: 'var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, 0.06))',
  // Text colors flip to pure white in dark mode via .dshw-root (see styles.ts).
  fg: 'var(--dshw-fg, #1f2328)',
  fgMuted: 'var(--dshw-fg-muted, #5f6672)',
  border: 'var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12))',
  accent: 'var(--dsw-alias-brand-primary, #4f8cff)',
  danger: '#e5484d',
} as const

const NUM = { fontVariantNumeric: 'tabular-nums' as const }

export function WeatherBar(props: WeatherBarProps): ReactElement | null {
  const { scope } = props
  const [config, setConfig] = useState<WeatherConfig | undefined>(() => scope.getSnapshot().value)
  const [status, setStatus] = useState<Status>('idle')
  const [location, setLocation] = useState<GeoLocation | null>(null)
  const [data, setData] = useState<WeatherData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'main' | 'settings'>('main')
  const [tick, setTick] = useState(0)
  const [relocateTick, setRelocateTick] = useState(0)
  const [diag, setDiag] = useState<LocationDiagnostics | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  // Set by the relocate/retry buttons so the NEXT locate pass bypasses the
  // cached auto location exactly once; cleared after that pass consumes it.
  const bypassCacheRef = useRef(false)
  // alert key -> last notification timestamp (per-session dedupe window).
  const notifiedAt = useRef(new Map<string, number>())
  // The app's own tab title, captured once so the weather prefix can be stripped.
  const appTitle = useRef<string | null>(null)

  const closePopover = (): void => {
    setOpen(false)
    setView('main')
  }

  // Resolve the effective config: the stored section once the namespace is
  // served, schema defaults otherwise — the bar must not vanish just because
  // the settings document has not mirrored the namespace yet.
  const effective = config ?? FALLBACK_CONFIG

  // Keep the config snapshot in sync with settings changes.
  useEffect(() => {
    const sync = (): void => setConfig(scope.getSnapshot().value)
    sync()
    return scope.subscribe(sync)
  }, [scope])

  // Close the popover when the user clicks anywhere outside it, or presses Esc.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      if (barRef.current !== null && !barRef.current.contains(event.target as Node)) {
        closePopover()
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closePopover()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Resolve the location — runs once on mount and whenever the location
  // settings change or the user explicitly re-locates. Auto refresh NEVER
  // re-locates, and the resolved auto location is cached in settings so the
  // display stays stable until "重新定位" is pressed.
  useEffect(() => {
    if (!effective.enabled) return
    let cancelled = false
    setStatus(effective.locationMode === 'manual' ? 'loading' : 'locating')
    setError(null)
    void (async () => {
      try {
        let loc: GeoLocation
        if (effective.locationMode === 'manual') {
          if (effective.latitude === undefined || effective.longitude === undefined) {
            throw new Error('手动模式缺少坐标，请在设置中填写')
          }
          loc = {
            name: cityLevelName(effective.cityName ?? '') !== '' ? cityLevelName(effective.cityName ?? '') : '当前位置',
            latitude: effective.latitude,
            longitude: effective.longitude,
            source: 'manual',
          }
        } else {
          // Reuse the cached auto location unless the user explicitly re-locates
          // (bypassCacheRef is set by the 重新定位 / 重试 buttons and consumed here).
          const cached = !bypassCacheRef.current
            && effective.autoLatitude !== undefined
            && effective.autoLongitude !== undefined
            ? {
                name: cityLevelName(effective.autoCityName ?? '') !== '' ? cityLevelName(effective.autoCityName ?? '') : '当前位置',
                latitude: effective.autoLatitude,
                longitude: effective.autoLongitude,
                source: 'ip' as const,
              }
            : null
          loc = cached ?? await resolveAutoLocation()
          bypassCacheRef.current = false
          if (cancelled) return
          if (cached === null) {
            // Persist the resolved location so it stops hopping across refreshes.
            void scope.set('autoLatitude', loc.latitude)
            void scope.set('autoLongitude', loc.longitude)
            void scope.set('autoCityName', loc.name)
          } else {
            // Sanity-heal a stale or wrong cached location: if a fresh IP
            // consensus disagrees with the cache, clear it so the next pass
            // re-resolves (this is what unsticks a garbage location cached by
            // an old build — e.g. a Qingyuan reading for a Guangzhou network;
            // Qingyuan is only ~70 km from Guangzhou, so the threshold must be
            // tighter than typical inter-city distances).
            void resolveLocationByIp().then((ip) => {
              if (cancelled) return
              if (haversineKm(cached.latitude, cached.longitude, ip.latitude, ip.longitude) > 50) {
                void scope.unset('autoLatitude')
                void scope.unset('autoLongitude')
                void scope.unset('autoCityName')
              }
            }).catch(() => {})
          }
        }
        if (cancelled) return
        setLocation(loc)
        setStatus('loading')
      } catch (err) {
        bypassCacheRef.current = false
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    effective.enabled,
    effective.locationMode,
    effective.latitude,
    effective.longitude,
    effective.cityName,
    effective.autoLatitude,
    effective.autoLongitude,
    effective.autoCityName,
    relocateTick,
  ])

  // Fetch weather for the resolved location — re-runs on refresh ticks only.
  useEffect(() => {
    if (!effective.enabled || location === null) return
    let cancelled = false
    setStatus('loading')
    void (async () => {
      try {
        const weather = await fetchWeather(location, effective.units)
        if (cancelled) return
        setData(weather)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [effective.enabled, effective.units, location, tick])

  // Auto-refresh on the configured interval.
  useEffect(() => {
    if (!effective.enabled) return
    const minutes = Math.max(5, effective.refreshMinutes)
    const id = window.setInterval(() => setTick((n) => n + 1), minutes * 60_000)
    return () => window.clearInterval(id)
  }, [effective.refreshMinutes, effective.enabled])

  // Ask for notification permission once when alerts are enabled.
  useEffect(() => {
    if (effective.alertsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [effective.alertsEnabled])

  // Fire a browser notification when a severe-weather alert appears, at most
  // once per alert combination per hour.
  useEffect(() => {
    if (!effective.alertsEnabled || data === null) return
    const unit = effective.units === 'fahrenheit' ? '°F' : '°C'
    const fmtLocal = (value: number): string => `${Math.round(value)}${unit}`
    const alerts = evaluateAlerts(data, fmtLocal)
    if (alerts.length === 0) return
    const key = alerts.map((alert) => alert.key).sort().join('+')
    const now = Date.now()
    if (now - (notifiedAt.current.get(key) ?? 0) < 60 * 60_000) return
    notifiedAt.current.set(key, now)
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    try {
      new Notification(`⚠ ${data.location.name} 天气提醒`, {
        body: alerts.map((alert) => `${alert.title}：${alert.detail}`).join('；'),
        tag: `dsh-weather-${key}`,
      })
    } catch {
      // notification construction can throw in restricted contexts — ignore
    }
  }, [data, effective.alertsEnabled, effective.units])

  // Show the current weather in the browser tab title (`⛅ 26° 城市 — 应用标题`).
  useEffect(() => {
    if (!effective.enabled || data === null) {
      if (appTitle.current !== null) document.title = appTitle.current
      return
    }
    const prefixPattern = /^⛅ .*? — /
    if (appTitle.current === null) {
      appTitle.current = prefixPattern.test(document.title)
        ? document.title.replace(prefixPattern, '')
        : document.title
    }
    const titleUnit = effective.units === 'fahrenheit' ? '°F' : '°C'
    const temp = `${Math.round(data.current.temperature)}${titleUnit}`
    document.title = `⛅ ${temp} ${data.location.name} — ${appTitle.current}`
  }, [data, effective.enabled, effective.units])

  if (!effective.enabled) return null

  const unit = effective.units === 'fahrenheit' ? '°F' : '°C'
  const fmt = (value: number): string => `${Math.round(value)}${unit}`
  const condition = data !== null
    ? describeCondition(data.current.weatherCode, data.current.isDay)
    : null
  const name = location?.name ?? (effective.locationMode === 'manual' ? (effective.cityName ?? '当前位置') : '定位中…')

  const subText = status === 'locating'
    ? '定位中…'
    : status === 'loading'
      ? '加载中…'
      : status === 'error'
        ? '⚠ 加载失败'
        : data !== null && condition !== null
          ? `${condition.label} · 体感 ${fmt(data.current.apparentTemperature)}`
          : ''

  const showTemp = status === 'ready' && data !== null
  const barIcon = status === 'ready' && data !== null
    ? <WeatherIcon code={data.current.weatherCode} isDay={data.current.isDay} size={20} />
    : <Glyph name="pin" size={18} />

  const weekly = data?.daily ?? []
  const weekMin = weekly.length > 0 ? Math.min(...weekly.map((d) => d.tempMin)) : 0
  const weekMax = weekly.length > 0 ? Math.max(...weekly.map((d) => d.tempMax)) : 1
  const weekSpan = weekMax - weekMin || 1

  const alerts = data !== null ? evaluateAlerts(data, fmt) : []
  const hasDanger = alerts.some((alert) => alert.level === 'danger')
  const air = data?.air
  const airInfo = air !== undefined ? aqiInfo(air.aqi) : null
  const advice = data !== null ? weatherAdvice(data) : null

  return (
    <div
      ref={barRef}
      className="dshw-root"
      style={{
        position: 'fixed',
        top: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        animation: 'dshw-slide-in 0.25s ease',
      }}
    >
      <button
        type="button"
        className="dshw-bar"
        onClick={() => setOpen((v) => {
          if (v) setView('main')
          return !v
        })}
        aria-expanded={open}
        title="天气详情"
        style={{
          ...baseButton,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: TOKEN.bg,
          color: TOKEN.fg,
          border: `1px solid ${TOKEN.border}`,
          borderRadius: 999,
          padding: '5px 14px 5px 6px',
          boxShadow: '0 6px 24px rgba(0, 0, 0, 0.16)',
          cursor: 'pointer',
          maxWidth: 'min(640px, 76vw)',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: TOKEN.bgSoft,
            border: `1px solid ${TOKEN.border}`,
            color: TOKEN.fg,
          }}
        >
          {barIcon}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: '1 1 auto' }}>
          <span style={{ fontSize: 13, fontWeight: 600, lineHeight: '17px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
          <span style={{ fontSize: 11.5, lineHeight: '15px', color: TOKEN.fgMuted, ...(status === 'error' ? { color: TOKEN.danger } : {}) }}>
            {subText}
          </span>
        </span>
        {alerts.length > 0 && (
          <span
            title={alerts.map((a) => `${a.title}：${a.detail}`).join('；')}
            style={{
              flex: '0 0 auto',
              fontSize: 11,
              fontWeight: 700,
              lineHeight: '17px',
              color: hasDanger ? '#d5484d' : '#b45309',
              background: hasDanger ? 'rgba(213, 72, 77, 0.12)' : 'rgba(180, 83, 9, 0.12)',
              borderRadius: 999,
              padding: '1px 9px',
              whiteSpace: 'nowrap',
            }}
          >
            ⚠ {alerts[0].title}
          </span>
        )}
        {showTemp && (
          <span style={{ fontSize: 18, fontWeight: 700, lineHeight: '22px', ...NUM, flex: '0 0 auto' }}>
            {fmt(data!.current.temperature)}
          </span>
        )}
        <span style={{ flex: '0 0 auto', fontSize: 10, color: TOKEN.fgMuted, marginLeft: 2 }}>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div
          className="dshw-popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(600px, 94vw)',
            maxHeight: 'calc(100vh - 48px)',
            overflowY: 'auto',
            background: TOKEN.bg,
            color: TOKEN.fg,
            border: `1px solid ${TOKEN.border}`,
            borderRadius: 16,
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.28)',
            padding: 14,
            fontSize: 13.5,
            textAlign: 'left',
          }}
        >
          {view === 'settings' ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <button type="button" onClick={() => setView('main')} style={iconButton} title="返回">
                  <Glyph name="chevron-left" size={16} />
                </button>
                <span style={{ fontSize: 15, fontWeight: 600 }}>天气设置</span>
              </div>
              <WeatherSettingsSection scope={scope} />

              {/* Location diagnostics */}
              <div style={{ marginTop: 14, fontSize: 12, lineHeight: '18px', color: TOKEN.fgMuted, background: TOKEN.bgSoft, borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, color: TOKEN.fg }}>定位诊断</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDiag(null)
                      void runLocationDiagnostics().then(setDiag)
                    }}
                    style={actionButton}
                  >
                    重新检测
                  </button>
                </div>
                <div>
                  当前：{name}
                  {location !== null && `（${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}）`}
                  {location !== null && ` · ${location.source === 'gps' ? 'GPS' : 'IP'}`}
                </div>
                {diag !== null ? (
                  <>
                    <div>浏览器 GPS：{diag.gps.status === 'ok' ? `${diag.gps.latitude?.toFixed(3)}, ${diag.gps.longitude?.toFixed(3)}` : diag.gps.status}</div>
                    <div>IP 定位：{diag.ip.status === 'ok' ? `${diag.ip.city}（${diag.ip.latitude?.toFixed(3)}, ${diag.ip.longitude?.toFixed(3)}）` : `失败 ${diag.ip.error ?? ''}`}</div>
                    {diag.gpsIpDistanceKm !== undefined && <div>GPS ↔ IP 距离：{Math.round(diag.gpsIpDistanceKm)} km</div>}
                    <div>采用：{diag.chosen === 'gps' ? 'GPS（与 IP 一致）' : diag.chosen === 'ip' ? 'IP（GPS 缺失或偏离过大）' : '无'}</div>
                  </>
                ) : (
                  <div>点击"重新检测"查看 GPS / IP 各自的原始结果。</div>
                )}
              </div>
            </div>
          ) : (
            <>
              {status === 'error' && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ color: TOKEN.danger }}>{error ?? '加载失败'}</div>
                  <button
                    type="button"
                    onClick={() => {
                      bypassCacheRef.current = true
                      setRelocateTick((n) => n + 1)
                    }}
                    style={actionButton}
                  >
                    ⟳ 重试
                  </button>
                </div>
              )}

              {status === 'ready' && data !== null && (
                <>
                  {/* Header: location + refresh */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
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
                    <button type="button" onClick={() => setTick((n) => n + 1)} title="刷新" style={iconButton}>
                      <Glyph name="refresh" size={14} />
                    </button>
                  </div>

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
                        color: hasDanger ? '#d5484d' : '#b45309',
                        background: hasDanger ? 'rgba(213, 72, 77, 0.1)' : 'rgba(180, 83, 9, 0.1)',
                        border: `1px solid ${hasDanger ? 'rgba(213, 72, 77, 0.3)' : 'rgba(180, 83, 9, 0.28)'}`,
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
                      <StatChip icon={<Glyph name="droplet" size={13} />} label="湿度" value={`${Math.round(data.current.humidity)}%`} />
                      <StatChip icon={<Glyph name="wind" size={13} />} label="风速" value={`${Math.round(data.current.windSpeed)}`} suffix={effective.units === 'celsius' ? 'km/h' : 'mph'} />
                      <StatChip icon={<Glyph name="umbrella" size={13} />} label="今日降水" value={`${data.daily[0]?.precipProb ?? 0}%`} />
                      <StatChip
                        icon={<Glyph name="wind" size={13} />}
                        label="空气"
                        value={airInfo !== null && air !== undefined ? `${airInfo.label} ${air.aqi}` : '--'}
                        valueColor={airInfo?.color}
                      />
                    </div>
                  </div>

                  {/* Today facts */}
                  <div data-block="today" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 12, fontSize: 12, color: TOKEN.fgMuted }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Glyph name="sunrise" size={14} /> {timeLabel(data.sunrise)}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Glyph name="sunset" size={14} /> {timeLabel(data.sunset)}
                    </span>
                    {data.uvIndexMax !== undefined && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Glyph name="sun" size={14} /> UV {Math.round(data.uvIndexMax)} {uvLevel(data.uvIndexMax)}
                      </span>
                    )}
                    {air !== undefined && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        PM2.5 {Math.round(air.pm25)}
                      </span>
                    )}
                  </div>

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
                      values={data.hourly.map((point) => point.temperature)}
                      labels={data.hourly.map((point) => hourLabel(point.time))}
                      unit={unit}
                      height={56}
                    />
                  </div>

                  <div data-block="hourly" style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: TOKEN.fgMuted, marginBottom: 6 }}>未来 12 小时</div>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                      {data.hourly.slice(0, 12).map((point, index) => {
                        return (
                          <div key={index} style={{ flex: '0 0 auto', width: 46, textAlign: 'center', background: TOKEN.bgSoft, borderRadius: 10, padding: '5px 2px' }}>
                            <div style={{ fontSize: 11, color: TOKEN.fgMuted, ...NUM }}>{hourLabel(point.time)}</div>
                            <div style={{ margin: '2px 0' }}>
                              <WeatherIcon code={point.weatherCode} isDay={true} size={18} />
                            </div>
                            <div style={{ fontSize: 12.5, fontWeight: 600, ...NUM }}>{fmt(point.temperature)}</div>
                            <div style={{ fontSize: 10, color: point.precipProb > 0 ? '#4f8cff' : 'transparent', ...NUM }}>{point.precipProb}%</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div data-block="daily" style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: TOKEN.fgMuted, marginBottom: 6 }}>未来 7 天</div>
                    <div>
                      {weekly.map((point, index) => {
                        const left = ((point.tempMin - weekMin) / weekSpan) * 100
                        const width = Math.max(8, ((point.tempMax - point.tempMin) / weekSpan) * 100)
                        return (
                          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 2px', borderBottom: index === weekly.length - 1 ? 'none' : `1px solid ${TOKEN.border}`, fontSize: 12.5 }}>
                            <span style={{ width: 44, flex: '0 0 auto', ...NUM }}>{dayLabel(point.date)}</span>
                            <span style={{ width: 20, textAlign: 'center', flex: '0 0 auto' }}>
                              <WeatherIcon code={point.weatherCode} isDay={true} size={18} />
                            </span>
                            <span style={{ width: 36, flex: '0 0 auto', textAlign: 'right', fontSize: 11, color: point.precipProb > 0 ? '#4f8cff' : TOKEN.fgMuted, ...NUM }}>
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
                                  background: `linear-gradient(90deg, ${TOKEN.accent}, #fbbf24)`,
                                }}
                              />
                            </span>
                            <span style={{ width: 38, flex: '0 0 auto', textAlign: 'right', fontWeight: 600, ...NUM }}>{fmt(point.tempMax)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Footer controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${TOKEN.border}` }}>
                    <span style={{ fontSize: 12, color: TOKEN.fgMuted }}>单位</span>
                    <div style={{ display: 'flex', background: TOKEN.bgSoft, borderRadius: 999, padding: 2 }}>
                      <button
                        type="button"
                        onClick={() => void scope.set('units', 'celsius')}
                        style={{ ...segmentButton, fontWeight: effective.units === 'celsius' ? 700 : 400, background: effective.units === 'celsius' ? TOKEN.bg : 'transparent' }}
                      >
                        °C
                      </button>
                      <button
                        type="button"
                        onClick={() => void scope.set('units', 'fahrenheit')}
                        style={{ ...segmentButton, fontWeight: effective.units === 'fahrenheit' ? 700 : 400, background: effective.units === 'fahrenheit' ? TOKEN.bg : 'transparent' }}
                      >
                        °F
                      </button>
                    </div>
                    {effective.locationMode === 'auto' && (
                      <button
                        type="button"
                        onClick={() => {
                          bypassCacheRef.current = true
                          setRelocateTick((n) => n + 1)
                        }}
                        style={actionButton}
                      >
                        📍 重新定位
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setView('settings')}
                      style={{ ...actionButton, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      <Glyph name="sliders" size={13} /> 设置
                    </button>
                  </div>
                </>
              )}

              {(status === 'idle' || status === 'locating' || status === 'loading') && (
                <div style={{ color: TOKEN.fgMuted, textAlign: 'center', padding: 20 }}>
                  {status === 'idle' ? '尚未启用' : '天气加载中…'}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function StatChip(props: {
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
          fontSize: props.compact === true ? 12.5 : 12.5,
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

const baseButton: CSSProperties = {
  fontFamily: 'inherit',
}

const iconButton: CSSProperties = {
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

const actionButton: CSSProperties = {
  ...baseButton,
  background: TOKEN.bgSoft,
  color: TOKEN.fg,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: '5px 13px',
  fontSize: 12.5,
  cursor: 'pointer',
}

const segmentButton: CSSProperties = {
  ...baseButton,
  border: 'none',
  borderRadius: 999,
  padding: '4px 13px',
  fontSize: 12.5,
  color: TOKEN.fg,
  cursor: 'pointer',
}
