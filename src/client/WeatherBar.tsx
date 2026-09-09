/**
 * Session-header weather chip. Registered into the app-reserved
 * `conversation.session.header.actions` seat (not a floating overlay), so it
 * sits in the conversation column's own chrome row and can never collide with
 * other plugins' floating controls (sidebars, whales, status pills…).
 *
 * Collapsed it is one compact chip — weather icon, temperature, and a live
 * date/time (minute-aligned clock) — that is always visible while a session
 * is open, expanded or not. Clicking it opens a popover (anchored to the chip)
 * holding the location header, current-weather hero, stat chips, the 24h
 * temperature trend, the hourly strip, the 7-day forecast, and the unit /
 * refresh controls.
 *
 * Data lifecycle notes:
 * - The feed is metric-only (°C/km/h) — see weather-api.ts. Display units are
 *   applied here via units.ts, so a unit toggle never re-fetches and a cached
 *   snapshot stays valid across unit switches.
 * - Refreshes with data already on screen are silent: the chip/popover never
 *   flicker into "加载中…"; a failed refresh degrades to the last good snapshot
 *   of the SAME location, flagged stale, instead of a blank/error bar.
 * - The clock renders in its own tiny {@link LiveClock} child so the minute
 *   tick re-renders only the time span, not the whole chart/forecast tree.
 */
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_WEATHER_CONFIG, sanitizeConfig, type WeatherConfig } from '../config-shared'
import {
  cityLevelName,
  evaluateAlerts,
  fetchWeather,
  resolveAutoLocation,
  resolveFreshIfDrifted,
  type GeoLocation,
  type WeatherData,
} from './weather-api'
import {
  aqiInfo,
  clockDate,
  clockTime,
  describeCondition,
  hhmm,
  hourLabel,
  rainOnsetRounded,
  rainTimingText,
  timeLabel,
  uvLevel,
  weatherAdvice,
  windDirectionText,
} from './condition'
import { Glyph, WeatherIcon, type GlyphName } from './icons'
import { DailyList, HourlyStrip, RainStrip, StatChip, TodayFacts, type TodayFactItem } from './panels'
import { TrendChart } from './TrendChart'
import { NUM, TOKEN, actionButton, baseButton, BANNER, iconButton, segmentButton } from './theme'
import { tempText, unitLabel, windNumber, windText, windUnitLabel } from './units'

export interface WeatherBarProps {
  scope: SettingsScope<WeatherConfig>
}

type Status = 'locating' | 'loading' | 'ready' | 'error'

/** How long to wait (ms) before re-checking IP drift after a location persist —
 * persisting the freshly resolved auto-location re-runs the location effect,
 * and that cascade must not fire another network probe. */
const DRIFT_PROBE_MIN_GAP_MS = 60_000
const POPOVER_MAX_WIDTH = 560
const POPOVER_MIN_WIDTH = 280
const POPOVER_EDGE_GAP = 16

/**
 * Matches the weather prefix this plugin writes into the tab title:
 * `<condition emoji> <temp> <name> — `, plus the legacy fixed-⛅ form used by
 * older bundles. Used only to strip our own prefix when capturing the app's
 * base title.
 */
const TITLE_PREFIX_RE = /^(☀️|🌤️|⛅|☁️|🌫️|🌦️|🌧️|❄️|🌨️|⛈️|🌙|🌡️) \d+°[CF] .+? — /

/**
 * Manual-mode display name, reduced to city level when possible
 * (`广东省广州市番禺区` → `广东省广州市`). Falls back to 当前位置.
 */
function manualDisplayName(cityName: string | undefined): string {
  const raw = cityName?.trim()
  const reduced = raw !== undefined && raw !== '' ? cityLevelName(raw) : ''
  return reduced !== '' ? reduced : '当前位置'
}

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
  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.28)',
  padding: 14,
  fontSize: 13.5,
  textAlign: 'left',
}

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
  const [status, setStatus] = useState<Status>('loading')
  const [location, setLocation] = useState<GeoLocation | null>(null)
  const [data, setData] = useState<WeatherData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const [relocateTick, setRelocateTick] = useState(0)
  // Popover geometry measured when the chip opens: which side to grow from and
  // how wide it may be before touching the viewport edge.
  const [pop, setPop] = useState<{ align: 'start' | 'end'; width: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()
  // Set by the relocate/retry buttons so the NEXT locate pass bypasses the
  // cached auto location exactly once; cleared after that pass consumes it.
  const bypassCacheRef = useRef(false)
  // Last IP-drift probe time (ms): gates drift re-checks so that persisting a
  // freshly resolved location (which re-runs the location effect) does not
  // cascade into repeated probes.
  const lastDriftProbeRef = useRef(0)
  // alert key -> last notification timestamp (per-session dedupe window).
  const notifiedAt = useRef(new Map<string, number>())
  // Last successful payload (keyed by location only — the payload is metric,
  // so a unit switch never invalidates it).
  const lastGoodRef = useRef<{ weather: WeatherData; key: string } | null>(null)
  const [stale, setStale] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  // The app's own tab title, captured once so the weather prefix can be stripped.
  const appTitle = useRef<string | null>(null)

  // IP-drift notice: transient toast under the chip when the network moved and
  // the location auto-switched. Cleared by a timer; also sends a browser
  // notification when the user has granted permission AND enabled alerts.
  const [driftNotice, setDriftNotice] = useState<string | null>(null)
  const driftTimerRef = useRef<number | null>(null)
  const showDrift = useCallback((newName: string, notify: boolean): void => {
    setDriftNotice(newName)
    if (driftTimerRef.current !== null) window.clearTimeout(driftTimerRef.current)
    driftTimerRef.current = window.setTimeout(() => setDriftNotice(null), 6000)
    if (notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('📍 天气位置已自动切换', {
          body: `检测到网络变化，已切换到 ${newName}`,
          tag: 'dsh-weather-drift',
        })
      } catch {
        // notification construction can throw in restricted contexts — ignore
      }
    }
  }, [])

  // Persist a resolved auto location into settings — keeps it stable across
  // refreshes and lets the location effect converge on the new coordinates.
  const persistLocation = useCallback((loc: GeoLocation): void => {
    void scope.set('autoLatitude', loc.latitude)
    void scope.set('autoLongitude', loc.longitude)
    void scope.set('autoCityName', loc.name)
    void scope.set('autoSource', loc.source)
  }, [scope])

  // Clear a pending drift-toast timer on unmount.
  useEffect(() => () => {
    if (driftTimerRef.current !== null) window.clearTimeout(driftTimerRef.current)
  }, [])

  // Resolve the effective config — normalized so a hand-edited or older
  // settings document can never yield undefined/NaN fields (see sanitizeConfig).
  const effective = config ?? DEFAULT_WEATHER_CONFIG

  // Latest alert preference, mirrored for the async location/drift paths so
  // they need not depend on `alertsEnabled` (toggling it must not re-run the
  // whole locate+fetch chain just to refresh the notify flag).
  const alertsEnabledRef = useRef(effective.alertsEnabled)
  alertsEnabledRef.current = effective.alertsEnabled

  // Single source for the displayed place name. Config wins (manual 显示名称 /
  // auto 缓存名) because it updates instantly and is authoritative; the
  // resolved location is only a fallback until a name is persisted. Used by
  // the chip, the popover, the tab title and notification bodies so they can
  // never disagree.
  const placeName = (): string => {
    if (effective.locationMode === 'manual') return manualDisplayName(effective.cityName)
    const cachedName = effective.autoCityName
    if (cachedName !== undefined && cachedName !== '') return cachedName
    return location?.name ?? '定位中…'
  }

  // Keep the config snapshot in sync with settings changes.
  useEffect(() => {
    const sync = (): void => setConfig(sanitizeConfig(scope.getSnapshot().value))
    sync()
    return scope.subscribe(sync)
  }, [scope])

  // Restore the original tab title when the plugin unmounts.
  useEffect(() => () => {
    if (appTitle.current !== null) document.title = appTitle.current
  }, [])

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

  // Resolve the location — runs once on mount and whenever the location
  // settings change or the user explicitly re-locates. Auto refresh NEVER
  // re-locates, and the resolved auto location is cached in settings so the
  // display stays stable until "重新定位" is pressed.
  useEffect(() => {
    if (!effective.enabled) return
    // Early out for non-location churn: display metadata writes (manual
    // city-name edits, auto name/source persisted alongside unchanged
    // coordinates) re-run this effect through the config subscription but must
    // not re-resolve, re-set the location object (which would re-fetch) or
    // flash a busy state. Coordinates + mode are the only real inputs.
    const samePlace = !bypassCacheRef.current
      && location !== null
      && (effective.locationMode === 'manual'
        ? location.source === 'manual' && location.latitude === effective.latitude && location.longitude === effective.longitude
        : location.latitude === effective.autoLatitude && location.longitude === effective.autoLongitude)
    if (samePlace) return
    let cancelled = false
    setStatus(effective.locationMode === 'manual' ? 'loading' : 'locating')
    setError(null)
    void (async () => {
      try {
        let loc: GeoLocation
        if (effective.locationMode === 'manual') {
          if (effective.latitude === undefined || effective.longitude === undefined) {
            throw new Error('手动模式缺少坐标，请在 设置 → 天气 中填写')
          }
          loc = {
            name: manualDisplayName(effective.cityName),
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
                // Preserve the resolved name verbatim — it may already include a
                // district (区) resolved from a trusted browser fix.
                name: effective.autoCityName !== undefined && effective.autoCityName !== ''
                  ? effective.autoCityName
                  : '当前位置',
                latitude: effective.autoLatitude,
                longitude: effective.autoLongitude,
                source: effective.autoSource ?? 'ip',
              }
            : null
          loc = cached ?? await resolveAutoLocation()
          bypassCacheRef.current = false
          if (cancelled) return
          if (cached === null) {
            // Persist the resolved location so it stops hopping across
            // refreshes. Arming the drift gate here means the persist→effect
            // cascade (four auto* writes) cannot re-probe the fresh location.
            lastDriftProbeRef.current = Date.now()
            persistLocation(loc)
          } else {
            // IP-drift check: a cached IP-derived location that disagrees with
            // a fresh IP consensus (> AUTO_LOCATION_DRIFT_KM) means the network
            // has moved (VPN / roaming / ISP re-route). GPS-derived caches are
            // trusted (validated by accuracy at resolve time; this network's IP
            // rotates and would mislabel them). Gated so the persist→effect
            // cascade cannot fire repeated probes.
            if ((effective.autoSource ?? 'ip') !== 'gps'
              && Date.now() - lastDriftProbeRef.current >= DRIFT_PROBE_MIN_GAP_MS) {
              lastDriftProbeRef.current = Date.now()
              const fresh = await resolveFreshIfDrifted(cached)
              if (cancelled) return
              if (fresh !== null) {
                loc = fresh
                persistLocation(fresh)
                showDrift(fresh.name, alertsEnabledRef.current)
              }
            }
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
    // Location-affecting inputs only. `cityName`/`autoCityName`/`autoSource`
    // are display metadata written by this effect itself — re-running the
    // whole locate chain when they change would cause silent refetch churn
    // (e.g. every keystroke of the manual display-name field).
    effective.enabled,
    effective.locationMode,
    effective.latitude,
    effective.longitude,
    effective.autoLatitude,
    effective.autoLongitude,
    relocateTick,
    persistLocation,
    showDrift,
  ])

  // Fetch weather for the resolved location — re-runs on refresh ticks only.
  // Aborts the previous request on re-run/unmount (no stale-response races).
  // Refreshes with data already on screen are SILENT: status stays `ready` and
  // only `stale`/`error` are updated on failure.
  useEffect(() => {
    if (!effective.enabled || location === null) return
    const controller = new AbortController()
    let cancelled = false
    const locKey = `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`
    const shown = lastGoodRef.current
    if (shown === null || shown.key !== locKey) {
      // Nothing shown for this location yet (or we switched cities) — the
      // popover/chip must not keep displaying a previous city's snapshot.
      setStatus('loading')
      setData(null)
      setStale(false)
      setError(null)
    }
    void (async () => {
      try {
        const weather = await fetchWeather(location, controller.signal)
        if (cancelled) return
        lastGoodRef.current = { weather, key: locKey }
        setData(weather)
        setUpdatedAt(Date.now())
        setError(null)
        setStale(false)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        // Degrade to the cached snapshot only when it belongs to the SAME
        // location — a snapshot from another city would mislead more than an
        // error.
        const cache = lastGoodRef.current
        if (cache !== null && cache.key === locKey) {
          setData(cache.weather)
          setError(message)
          setStale(true)
          setStatus('ready')
        } else {
          setData(null)
          setError(message)
          setStale(false)
          setStatus('error')
        }
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [effective.enabled, location, tick])

  // Auto-refresh on the configured interval (sanitized, so it is always ≥ 5).
  useEffect(() => {
    if (!effective.enabled) return
    const id = window.setInterval(() => setTick((n) => n + 1), Math.max(5, effective.refreshMinutes) * 60_000)
    return () => window.clearInterval(id)
  }, [effective.refreshMinutes, effective.enabled])

  // Periodic IP-drift probe (auto mode with an IP-derived cache only): if the
  // network moves while the page stays open (VPN, roaming, ISP re-route), adopt
  // the new location so the forecast follows without a manual re-locate.
  useEffect(() => {
    if (!effective.enabled || effective.locationMode !== 'auto') return
    if (effective.autoLatitude === undefined || effective.autoLongitude === undefined) return
    if ((effective.autoSource ?? 'ip') === 'gps') return
    let cancelled = false
    const cached = {
      latitude: effective.autoLatitude,
      longitude: effective.autoLongitude,
      source: 'ip' as const,
    }
    const probe = (): void => {
      // Arm the shared gate so an adoption here (which persists + re-runs the
      // location effect) cannot trigger an immediate second probe there.
      lastDriftProbeRef.current = Date.now()
      void resolveFreshIfDrifted(cached).then((fresh) => {
        if (cancelled || fresh === null) return
        // Persisting updates the cached auto location; the location effect
        // (depends on the auto* fields) re-runs, adopts it and refetches.
        persistLocation(fresh)
        showDrift(fresh.name, alertsEnabledRef.current)
      })
    }
    const id = window.setInterval(probe, 60 * 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [
    effective.enabled,
    effective.locationMode,
    effective.autoLatitude,
    effective.autoLongitude,
    effective.autoSource,
    persistLocation,
    showDrift,
  ])

  // Ask for notification permission once when alerts are enabled.
  useEffect(() => {
    if (effective.alertsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [effective.alertsEnabled])

  // Fire a browser notification when a severe-weather alert appears, at most
  // once per alert combination per hour (4 h for lead-time `*-soon` alerts, so
  // an approaching storm does not nag on every auto-refresh). The dedupe write
  // happens only after the permission gate, so alerts seen while permission is
  // missing are still delivered once the user grants it.
  useEffect(() => {
    if (!effective.alertsEnabled || data === null) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const fmtLocal = (value: number): string => tempText(value, effective.units)
    const windFmtLocal = (kmh: number): string => windText(kmh, effective.units)
    const alerts = evaluateAlerts(data, fmtLocal, windFmtLocal)
    // Rain-soon notification: expected to start within the hour and not
    // already falling. Display-side only otherwise — never a banner/alert badge.
    const rain = data.rainSoon
    if (rain !== undefined && !rain.rainingNow && rain.onsetMinutes !== undefined && rain.onsetMinutes <= 60) {
      alerts.push({
        key: 'rain-soon',
        level: 'warning',
        title: '即将降雨',
        detail: `预计 ${rainOnsetRounded(rain.onsetMinutes)} 分钟后开始下雨，出门记得带伞`,
      })
    }
    if (alerts.length === 0) return
    const key = alerts.map((alert) => alert.key).sort().join('+')
    const now = Date.now()
    const dedupeMs = key.includes('-soon') ? 4 * 60 * 60_000 : 60 * 60_000
    const last = notifiedAt.current.get(key)
    if (last !== undefined && now - last < dedupeMs) return
    // Bound the dedupe map (worst case: one entry per alert combo per hour).
    if (notifiedAt.current.size > 24) notifiedAt.current.clear()
    notifiedAt.current.set(key, now)
    try {
      new Notification(`⚠ ${placeName()} 天气提醒`, {
        body: alerts.map((alert) => `${alert.title}：${alert.detail}`).join('；'),
        tag: `dsh-weather-${key}`,
      })
    } catch {
      // notification construction can throw in restricted contexts — ignore
    }
  }, [data, effective.alertsEnabled, effective.units, effective.locationMode, effective.cityName, effective.autoCityName, location])

  // Show the current weather in the browser tab title
  // (`☀️ 26° 广州 — 应用标题`). The app base title is captured once and the
  // prefix is fully owned by this plugin: it restores the base while disabled,
  // on unmount, and when the plugin is in a terminal error with no data — so a
  // failed city switch never leaves the previous city's weather in the tab.
  useEffect(() => {
    if (!effective.enabled) {
      if (appTitle.current !== null && appTitle.current !== document.title) {
        document.title = appTitle.current
      }
      return
    }
    if (data === null) {
      if (appTitle.current !== null && status === 'error') {
        document.title = appTitle.current
      }
      return
    }
    if (appTitle.current === null) {
      // Strip our own prefix if a previous page life left one behind (the
      // current `<emoji> <temp> <name> — ` form, or the legacy fixed-⛅ form).
      const match = document.title.match(TITLE_PREFIX_RE)
      appTitle.current = match !== null ? document.title.slice(match[0].length) : document.title
    }
    const condition = describeCondition(data.current.weatherCode, data.current.isDay)
    const title = `${condition.emoji} ${tempText(data.current.temperature, effective.units)} ${placeName()} — ${appTitle.current}`
    if (document.title !== title) document.title = title
  }, [data, effective.enabled, effective.units, effective.locationMode, effective.cityName, effective.autoCityName, location, status])

  if (!effective.enabled) return null

  const units = effective.units
  const fmt = (value: number): string => tempText(value, units)
  const condition = data !== null ? describeCondition(data.current.weatherCode, data.current.isDay) : null
  const name = placeName()
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

  const alerts = data !== null ? evaluateAlerts(data, fmt, (kmh) => windText(kmh, units)) : []
  const hasDanger = alerts.some((alert) => alert.level === 'danger')
  const air = data?.air
  const airInfo = air !== undefined && air.aqi !== undefined ? aqiInfo(air.aqi) : null
  const advice = data !== null ? weatherAdvice(data) : null

  // Derived display values for the extended environment facts.
  const cur = data?.current
  const windKmhDisplay = windNumber(cur?.windSpeed, units)
  const windDeg = cur?.windDirection
  const windTextValue = windDeg !== undefined ? windDirectionText(windDeg) : undefined
  const gustTextValue = cur?.windGusts !== undefined ? windText(cur.windGusts, units) : undefined
  const dewPointTextValue = cur?.dewPoint !== undefined ? tempText(cur.dewPoint, units) : undefined
  const pressureTextValue = cur?.pressure !== undefined ? `${Math.round(cur.pressure)} hPa` : undefined
  const visibilityTextValue = cur?.visibility !== undefined ? `${cur.visibility.toFixed(1)} km` : undefined
  const cloudTextValue = cur?.cloudCover !== undefined ? `${Math.round(cur.cloudCover)}%` : undefined
  const rainTotal = data?.daily[0]?.precipSum
  const rainTotalText = rainTotal !== undefined && rainTotal >= 0.05 ? `${rainTotal.toFixed(1)} mm` : undefined

  // "今日信息" wrap-row entries, assembled conditionally so only fields the
  // feed actually returned are shown.
  const fact = (glyph: GlyphName | undefined, text: string): TodayFactItem => ({ glyph, text })
  const todayItems: TodayFactItem[] = [
    fact('sunrise', timeLabel(data?.sunrise)),
    fact('sunset', timeLabel(data?.sunset)),
  ]
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

  // One "retry" semantics for both error states: re-fetch the CURRENT
  // location when one exists; only when we never resolved a location does
  // retry mean "locate again" (and bypass the auto cache).
  const retry = (): void => {
    if (location === null) {
      bypassCacheRef.current = true
      setRelocateTick((n) => n + 1)
    } else {
      setTick((n) => n + 1)
    }
  }

  const manualMissingCoords = effective.locationMode === 'manual'
    && (effective.latitude === undefined || effective.longitude === undefined)

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
                <button type="button" onClick={() => setTick((n) => n + 1)} title="刷新" aria-label="刷新天气" style={iconButton}>
                  <Glyph name="refresh" size={14} />
                </button>
              </div>

              {/* Stale-snapshot banner: the last refresh failed, showing cached data */}
              {stale && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12, lineHeight: '17px', color: BANNER.warning.color, background: BANNER.warning.bg, border: `1px solid ${BANNER.warning.border}`, borderRadius: 10, padding: '6px 10px' }}>
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    数据更新失败{error !== null ? `（${error}）` : ''}，显示 {updatedAt !== null ? `${hhmm(updatedAt)} 的` : '上次'}快照
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
                    value={windKmhDisplay !== undefined ? `${Math.round(windKmhDisplay)}` : '--'}
                    suffix={windKmhDisplay !== undefined ? windSuffixLabel : undefined}
                  />
                  <StatChip icon={<Glyph name="umbrella" size={13} />} label="今日降水" value={`${data.daily[0]?.precipProb ?? 0}%`} />
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
                  values={data.hourly.map((point) => point.temperature)}
                  labels={data.hourly.map((point) => hourLabel(point.time))}
                  unit={unitSuffix}
                  height={56}
                />
              </div>

              <HourlyStrip title="未来 12 小时" points={data.hourly.slice(0, 12)} fmt={fmt} />

              <DailyList title="未来 7 天" points={data.daily} fmt={fmt} />

              {/* Footer controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${TOKEN.border}` }}>
                <span style={{ fontSize: 12, color: TOKEN.fgMuted }}>单位</span>
                <div role="group" aria-label="温度单位" style={{ display: 'flex', background: TOKEN.bgSoft, borderRadius: 999, padding: 2 }}>
                  <button
                    type="button"
                    onClick={() => void scope.set('units', 'celsius')}
                    style={{ ...segmentButton, fontWeight: units === 'celsius' ? 700 : 400, background: units === 'celsius' ? TOKEN.bg : 'transparent' }}
                  >
                    °C
                  </button>
                  <button
                    type="button"
                    onClick={() => void scope.set('units', 'fahrenheit')}
                    style={{ ...segmentButton, fontWeight: units === 'fahrenheit' ? 700 : 400, background: units === 'fahrenheit' ? TOKEN.bg : 'transparent' }}
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
              </div>
            </>
          )}

          {status !== 'ready' && status !== 'error' && (
            <div style={{ color: TOKEN.fgMuted, textAlign: 'center', padding: 20 }}>
              {status === 'locating' ? '定位中…' : '天气加载中…'}
            </div>
          )}
        </div>
      )}

      {/* IP-drift toast: shown under the chip when the network moved and the
          location auto-switched (hidden while the popover is open so they do
          not overlap). Anchors to the same side as the popover. */}
      {driftNotice !== null && !open && (
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
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
            padding: '6px 12px',
            fontSize: 12.5,
            whiteSpace: 'nowrap',
          }}
        >
          📍 网络变化，已切换到 <b>{driftNotice}</b>
        </div>
      )}
    </div>
  )
}
