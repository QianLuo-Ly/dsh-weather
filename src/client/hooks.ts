/**
 * Weather behaviour hooks — the data & side-effect layer that used to live
 * inline in WeatherBar. Splitting it out keeps the component down to layout +
 * interaction, and lets each concern (location, feed, saved cities, brief,
 * notifications, tab title, day detail) be reasoned about in isolation.
 *
 * All hooks are consumer-agnostic: they take the sanitized config section and
 * a `SettingsScope`, and return plain state + actions. Display units are NOT
 * applied here — the feed is metric and components convert via units.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  MAX_SAVED_LOCATIONS,
  placeKey,
  REFRESH_RANGE,
  sanitizeSavedLocations,
  sanitizeText,
  type SavedLocation,
  type WeatherConfig,
} from '../config-shared'
import {
  cityLevelName,
  evaluateAlerts,
  fetchDayDetail,
  fetchWeather,
  resolveAutoLocation,
  resolveFreshIfDrifted,
  type DayDetail,
  type GeoLocation,
  type WeatherData,
} from './weather-api'
import { describeCondition, rainOnsetRounded } from './condition'
import { tempText, windText } from './units'

/** How long to wait (ms) before re-checking IP drift after a location persist —
 * persisting the freshly resolved auto-location re-runs the location effect,
 * and that cascade must not fire another network probe. */
const DRIFT_PROBE_MIN_GAP_MS = 60_000
/** How often the open page re-checks IP drift (network moves mid-session). */
const DRIFT_PROBE_INTERVAL_MS = 60 * 60_000

/**
 * Matches the weather prefix this plugin writes into the tab title:
 * `<condition emoji> <temp> <name> — `, plus the legacy fixed-⛅ form used by
 * older bundles. Used only to strip our own prefix when capturing the app's
 * base title. The optional sign matters: below 0 °C `tempText` yields `-5°C`,
 * and a prefix we fail to recognise is adopted as the new base — so the title
 * would grow a fresh copy of itself on every write.
 */
const TITLE_PREFIX_RE = /^(☀️|🌤️|⛅|☁️|🌧️|❄️|🌨️|⛈️|🌙|🌡️|🌫️|🌦️) -?\d+°[CF] .+? — /

/** Manual-mode display name reduced to city level (`广东省广州市番禺区` → `广东省广州市`). */
function manualDisplayName(cityName: string | undefined): string {
  const raw = cityName?.trim()
  const reduced = raw !== undefined && raw !== '' ? cityLevelName(raw) : ''
  return reduced !== '' ? reduced : '当前位置'
}

/**
 * Single source for the displayed place name: config wins (manual 显示名称 /
 * auto 缓存名) because it updates instantly and is authoritative; the resolved
 * location is only a fallback until a name is persisted.
 */
export function placeNameOf(effective: WeatherConfig, location: GeoLocation | null): string {
  if (effective.locationMode === 'manual') return manualDisplayName(effective.cityName)
  const cachedName = effective.autoCityName
  if (cachedName !== undefined && cachedName !== '') return cachedName
  return location?.name ?? '定位中…'
}

/** Generate a stable-ish id for a newly saved city. */
function newSavedId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Stable empty list: keeps the "config caught up" effect from firing every
 * render while the settings namespace has not resolved yet. */
const EMPTY_SAVED: SavedLocation[] = []

/** `YYYY-MM-DD` for a Date (local) — keys the once-per-day brief dedupe. */
function dayKey(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// ── Location ────────────────────────────────────────────────────────────────

export interface AutoLocationState {
  location: GeoLocation | null
  /** True while the browser fix / IP fallback / manual coords are resolving. */
  locating: boolean
  /** Resolution failure message (null after a success). */
  error: string | null
  /** Re-run resolution, bypassing the cached auto location exactly once. */
  relocate: () => void
  /** Transient "network moved → switched to X" notice, auto-cleared. */
  driftNotice: string | null
}

/**
 * Resolve the active location from config, cache the auto result, and follow
 * IP drift while the page stays open. Everything the old inline effect did
 * (same-place early-out, GPS-trusted cache, drift adoption + toast) lives here.
 */
export function useAutoLocation(options: {
  scope: SettingsScope<WeatherConfig>
  effective: WeatherConfig
}): AutoLocationState {
  const { scope, effective } = options
  const [location, setLocation] = useState<GeoLocation | null>(null)
  // Starts true: before the resolve effect runs there is no location yet, and
  // consumers must show "定位中…" rather than a transient "加载失败".
  const [locating, setLocating] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [relocateTick, setRelocateTick] = useState(0)
  const bypassCacheRef = useRef(false)
  const lastDriftProbeRef = useRef(0)
  const driftTimerRef = useRef<number | null>(null)
  const [driftNotice, setDriftNotice] = useState<string | null>(null)
  // Latest alert preference mirrored for the async drift path, so toggling it
  // never re-runs the whole locate chain just to refresh the notify flag.
  const alertsEnabledRef = useRef(effective.alertsEnabled)
  alertsEnabledRef.current = effective.alertsEnabled

  // Persist a resolved auto location — keeps it stable across refreshes and
  // lets the location effect converge on the new coordinates. Internal cache
  // writes (no user claim attached), routed through the read-only-aware writer.
  const writer = useConfigWriter(scope)
  const persistLocation = useCallback((loc: GeoLocation): void => {
    writer.write('autoLatitude', loc.latitude)
    writer.write('autoLongitude', loc.longitude)
    // Composed from remote data (geocoder + province joining), so it can exceed
    // the display-name budget; sanitize here or the write stores a value the read
    // path then trims, leaving the stored document and the UI disagreeing.
    writer.write('autoCityName', sanitizeText(loc.name) ?? '当前位置')
    writer.write('autoSource', loc.source)
  }, [writer])

  const showDrift = useCallback((newName: string, notify: boolean): void => {
    setDriftNotice(`已切换到 ${newName}`)
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

  // Clear a pending drift-toast timer on unmount.
  useEffect(() => () => {
    if (driftTimerRef.current !== null) window.clearTimeout(driftTimerRef.current)
  }, [])

  // Resolve the location — runs once on mount and whenever the location
  // settings change or the user explicitly re-locates.
  useEffect(() => {
    if (!effective.enabled) return
    // A re-locate request is consumed exactly once, whichever mode we are in —
    // leaving it set would permanently defeat the same-place early-out and make
    // "back to auto" skip the cached coordinates.
    const bypassCache = bypassCacheRef.current
    bypassCacheRef.current = false
    // Early out for non-location churn: display metadata writes (manual
    // city-name edits, auto name/source persisted alongside unchanged
    // coordinates) re-run this effect through the config subscription but must
    // not re-resolve, re-set the location object (which would re-fetch) or
    // flash a busy state. Coordinates + mode are the only real inputs.
    const samePlace = !bypassCache
      && location !== null
      && (effective.locationMode === 'manual'
        ? location.source === 'manual' && location.latitude === effective.latitude && location.longitude === effective.longitude
        // The source must be checked too: manual→auto at identical coordinates
        // would otherwise keep `source: 'manual'` and silently drop the
        // GPS/IP badge in the popover header.
        : location.source !== 'manual' && location.latitude === effective.autoLatitude && location.longitude === effective.autoLongitude)
    if (samePlace) {
      // The early-out still owes the bookkeeping a resolve would have done: a
      // superseded run can leave `locating`/`error` set, and returning without
      // clearing them strands the chip on "定位中…" forever (the control that
      // would re-trigger a resolve lives behind the ready state).
      setLocating(false)
      setError(null)
      return
    }
    let cancelled = false
    setLocating(true)
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
          // Reuse the cached auto location unless the user explicitly re-located
          // in this pass (see `bypassCache` above).
          const cached = !bypassCache
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
          if (cancelled) return
          if (cached === null) {
            // Persist the resolved location so it stops hopping across
            // refreshes. Arming the drift gate here means the persist→effect
            // cascade (four auto* writes) cannot re-probe the fresh location.
            lastDriftProbeRef.current = Date.now()
            persistLocation(loc)
          } else if ((effective.autoSource ?? 'ip') !== 'gps'
            && Date.now() - lastDriftProbeRef.current >= DRIFT_PROBE_MIN_GAP_MS) {
            // IP-drift check: a cached IP-derived location that disagrees with
            // a fresh IP consensus (> AUTO_LOCATION_DRIFT_KM) means the network
            // has moved (VPN / roaming / ISP re-route). GPS-derived caches are
            // trusted (validated by accuracy at resolve time; this network's IP
            // rotates and would mislabel them).
            const previousGate = lastDriftProbeRef.current
            lastDriftProbeRef.current = Date.now()
            const fresh = await resolveFreshIfDrifted(cached)
            if (cancelled) {
              // A superseded probe (StrictMode double-run, config churn) must not
              // consume the gate, or a real drift found later in this pass would
              // be skipped for the whole interval.
              lastDriftProbeRef.current = previousGate
              return
            }
            if (fresh !== null) {
              loc = fresh
              persistLocation(fresh)
              showDrift(fresh.name, alertsEnabledRef.current)
            }
          }
        }
        if (cancelled) return
        setLocation(loc)
        setLocating(false)
      } catch (err) {
        if (cancelled) return
        setLocating(false)
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    // Location-affecting inputs only. `cityName`/`autoCityName`/`autoSource`
    // are display metadata written by this effect itself — re-running the
    // whole locate chain when they change would cause silent refetch churn.
    // `location` is intentionally read (not listed): the early-out must see the
    // current value without re-running on every location object identity.
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

  // Periodic IP-drift probe (auto mode with an IP-derived cache only): if the
  // network moves while the page stays open, adopt the new location so the
  // forecast follows without a manual re-locate.
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
        persistLocation(fresh)
        showDrift(fresh.name, alertsEnabledRef.current)
      })
    }
    const id = window.setInterval(probe, DRIFT_PROBE_INTERVAL_MS)
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

  /** Force one re-resolve that ignores the cached auto location (consumed once
   * by the location effect, whichever mode is active). */
  const relocate = useCallback((): void => {
    bypassCacheRef.current = true
    setRelocateTick((n) => n + 1)
  }, [])

  return { location, locating, error, relocate, driftNotice }
}

// ── Feed ────────────────────────────────────────────────────────────────────

export interface WeatherFeedState {
  data: WeatherData | null
  status: 'loading' | 'ready' | 'error'
  error: string | null
  /** True when the shown payload is the last good snapshot of this location. */
  stale: boolean
  /** Timestamp of the last successful fetch. */
  updatedAt: number | null
  /** Force a re-fetch of the current location. */
  refresh: () => void
}

/**
 * Fetch the metric payload for `location`, silently refreshing on the
 * configured interval and degrading to the last good snapshot (flagged stale)
 * when a refresh fails.
 */
export function useWeatherFeed(options: {
  effective: WeatherConfig
  location: GeoLocation | null
}): WeatherFeedState {
  const { effective, location } = options
  const [data, setData] = useState<WeatherData | null>(null)
  const [status, setStatus] = useState<WeatherFeedState['status']>('loading')
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  // Last successful payload (keyed by location only — the payload is metric,
  // so a unit switch never invalidates it).
  const lastGoodRef = useRef<{ weather: WeatherData; key: string } | null>(null)

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
    const id = window.setInterval(() => setTick((n) => n + 1), Math.max(REFRESH_RANGE.min, effective.refreshMinutes) * 60_000)
    return () => window.clearInterval(id)
  }, [effective.refreshMinutes, effective.enabled])

  const refresh = useCallback((): void => setTick((n) => n + 1), [])
  return { data, status, error, stale, updatedAt, refresh }
}

// ── Saved cities ────────────────────────────────────────────────────────────

/** Feedback kind for notices routed out of the hook. */
export type NoticeKind = 'ok' | 'err'

export interface SavedLocationsState {
  saved: SavedLocation[]
  activeId: string | undefined
  /** Switch to a saved city (writes manual coords + activeSavedId + mode). */
  switchTo: (id: string) => void
  /** Use an arbitrary place (search result) as custom coordinates. */
  selectPlace: (place: { name: string; latitude: number; longitude: number }) => void
  /** Go back to the automatic "当前位置". */
  useCurrent: () => void
  /** Save the currently effective location (manual coords or auto cache). */
  addCurrent: () => void
  /** Save a search result without switching to it. */
  addPlace: (place: { name: string; latitude: number; longitude: number }) => void
  /** Remove a saved city (an active one also reverts to 当前位置). */
  remove: (id: string) => void
  /** Whether a coordinate pair (rounded, ~100 m) is already saved. */
  isSaved: (latitude: number, longitude: number) => boolean
  /** Transient feedback for the chip ("已收藏 广州"); null when routed to onNotice. */
  notice: string | null
}

/**
 * Issue a batch of settings writes and confirm the authority actually holds
 * them, re-issuing the batch once if it does not.
 *
 * A refusal is invisible in the transport's settlement: `set()`/`unset()`
 * RESOLVE even when the Host rejected the value, because the failure is folded
 * into a recovery read (see `useConfigWriter` below). The one refusal that is
 * routine rather than exceptional is the Host's revision fence — a write is
 * addressed with the revision the client last read, so any write that landed
 * out of band (another tab, a hand-edited `settings.yaml` picked up by the
 * file watcher) makes the next one refuse with `settings/conflict`. The
 * transport's recovery read has already refreshed the revision by the time the
 * batch settles, so a single re-issue converts that whole class into a silent
 * success instead of telling the user to retry by hand.
 *
 * @param scope - the bound weather settings scope.
 * @param fields - field/value pairs to set.
 * @param clears - fields to clear.
 * @returns whether the authority holds the requested state; false when the
 *   batch could not be issued at all (transport failure).
 */
export function writeVerified(
  scope: SettingsScope<WeatherConfig>,
  fields: Array<[string, unknown]>,
  clears: string[] = [],
): Promise<boolean> {
  const apply = (): Promise<unknown[]> => Promise.all([
    ...fields.map(([field, value]) => scope.set(field, value)),
    ...clears.map((field) => scope.unset(field)),
  ])
  const landed = (): boolean => {
    const current = scope.getSnapshot().value as Record<string, unknown> | undefined
    return current !== undefined
      && fields.every(([field, value]) => JSON.stringify(current[field]) === JSON.stringify(value))
      && clears.every((field) => current[field] === undefined)
  }
  // Never rejects: a throw is "did not land", which the retry then re-attempts
  // and the caller reports as a refused write.
  const attempt = (): Promise<boolean> => apply().then(landed, () => false)
  return attempt().then((ok) => (ok ? true : attempt()))
}

/**
 * Config write helpers honoring the SettingsScope contract.
 *
 * The transport is the only authority on whether a write was accepted: a
 * rejected write is folded into a recovery read and `set()` still RESOLVES
 * (rejections are effectively impossible to observe). Every helper therefore
 * reads the snapshot back to report success — callers must not claim success
 * from the mere fact that a write was issued.
 */
export function useConfigWriter(scope: SettingsScope<WeatherConfig>): {
  writable: () => boolean
  write: (field: string, value: unknown) => Promise<boolean>
  clear: (field: string) => Promise<boolean>
  /** Verify several fields at once (for writes issued as one synchronous batch). */
  verify: (checks: Array<[string, unknown]>) => boolean
} {
  return useMemo(() => {
    const fieldValue = (field: string): unknown => {
      const value = scope.getSnapshot().value as Record<string, unknown> | undefined
      return value === undefined ? undefined : value[field]
    }
    const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
    return {
      writable: () => scope.getSnapshot().writable,
      write: (field: string, value: unknown): Promise<boolean> => {
        if (!scope.getSnapshot().writable) return Promise.resolve(false)
        return writeVerified(scope, [[field, value]])
      },
      clear: (field: string): Promise<boolean> => {
        if (!scope.getSnapshot().writable) return Promise.resolve(false)
        return writeVerified(scope, [], [field])
      },
      verify: (checks: Array<[string, unknown]>): boolean => checks.every(([field, expected]) => same(fieldValue(field), expected)),
    }
  }, [scope])
}

/**
 * Manage the saved-city list + the active city, persisted through settings.
 *
 * Every mutation is read back before its success notice, so a Host rejection
 * (schema/validate/revision) surfaces as a failure instead of a lie. The
 * displayed location's `activeSavedId` is cleared whenever it stops being that
 * saved entry (custom coordinates, search pick, mode switch), so the chip and
 * the settings list can never highlight a city that is not the one shown.
 *
 * @param options.onNotice - Route feedback to a host (the settings page's own
 * notice line) instead of returning it for the chip's toast.
 */
export function useSavedLocations(options: {
  scope: SettingsScope<WeatherConfig>
  effective: WeatherConfig
  onNotice?: (text: string, kind: NoticeKind) => void
}): SavedLocationsState {
  const { scope, effective, onNotice } = options
  const writer = useConfigWriter(scope)
  const saved = effective.savedLocations ?? EMPTY_SAVED
  const [ownNotice, setOwnNotice] = useState<string | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  // The latest list this hook itself wrote. Two quick edits (two ☆ clicks, two
  // deletes) would otherwise both compute from the same pre-write snapshot and
  // the second write would silently drop the first.
  const pendingRef = useRef<SavedLocation[] | null>(null)

  // Drop the optimistic base once the authoritative list really contains every
  // pending entry. Comparing array IDENTITY would clear it on any snapshot:
  // sanitizeConfig rebuilds the array each time, including pushes that do not
  // contain our queued write yet.
  useEffect(() => {
    const pending = pendingRef.current
    if (pending === null) return
    if (pending.every((entry) => saved.some((current) => current.id === entry.id))) {
      pendingRef.current = null
    }
  }, [saved])

  const showNotice = useCallback((text: string, kind: NoticeKind = 'ok'): void => {
    if (onNotice !== undefined) {
      onNotice(text, kind)
      return
    }
    setOwnNotice(text)
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setOwnNotice(null), 6000)
  }, [onNotice])

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
  }, [])

  const baseList = useCallback((): SavedLocation[] => pendingRef.current ?? saved, [saved])

  const isSaved = useCallback((latitude: number, longitude: number): boolean => {
    const key = placeKey(latitude, longitude)
    return baseList().some((entry) => placeKey(entry.latitude, entry.longitude) === key)
  }, [baseList])

  /** Shared guard: read-only connections reject every write silently. */
  const ensureWritable = useCallback((): boolean => {
    if (writer.writable()) return true
    showNotice('当前连接不支持修改设置（只读）', 'err')
    return false
  }, [writer, showNotice])

  /**
   * Issue several field writes in one synchronous batch (the transport publishes
   * only the final state of a batch) and then verify the resulting snapshot.
   * @returns whether the Host accepted the complete end state.
   */
  const commitBatch = useCallback(async (
    fields: Array<[string, unknown]>,
    clears: string[] = [],
  ): Promise<boolean> => {
    if (!ensureWritable()) return false
    const pending: Array<Promise<boolean>> = []
    for (const [field, value] of fields) pending.push(writer.write(field, value))
    for (const field of clears) pending.push(writer.clear(field))
    await Promise.all(pending)
    const checks: Array<[string, unknown]> = fields.map(([field, value]) => [field, value])
    for (const field of clears) checks.push([field, undefined])
    return writer.verify(checks)
  }, [ensureWritable, writer])

  const switchTo = useCallback((id: string): void => {
    const target = baseList().find((entry) => entry.id === id)
    if (target === undefined) return
    // Coordinates and name first, mode/active id last: the batch is published
    // once as a complete manual location (no "manual without coordinates"
    // intermediate), and a failure reverts to the previous city.
    void commitBatch([
      ['latitude', target.latitude],
      ['longitude', target.longitude],
      ['cityName', target.name],
      ['activeSavedId', target.id],
      ['locationMode', 'manual'],
    ]).then((ok) => showNotice(ok ? `已切换到 ${target.name}` : '切换失败，请重试', ok ? 'ok' : 'err'))
  }, [baseList, commitBatch, showNotice])

  /** Use an arbitrary place (search result) as custom coordinates — it is not a
   * saved city, so any previously active saved id is cleared. */
  const selectPlace = useCallback((place: { name: string; latitude: number; longitude: number }): void => {
    const fields: Array<[string, unknown]> = [
      ['latitude', place.latitude],
      ['longitude', place.longitude],
      ['cityName', place.name],
    ]
    if (effective.locationMode !== 'manual') fields.push(['locationMode', 'manual'])
    void commitBatch(fields, ['activeSavedId']).then((ok) => {
      if (!ok) showNotice('定位写入失败，请重试', 'err')
    })
  }, [commitBatch, effective.locationMode, showNotice])

  const useCurrent = useCallback((): void => {
    void commitBatch([['locationMode', 'auto']], ['activeSavedId']).then((ok) => {
      if (!ok) showNotice('切换失败，请重试', 'err')
    })
  }, [commitBatch, showNotice])

  const addPlace = useCallback((place: { name: string; latitude: number; longitude: number }): void => {
    if (!ensureWritable()) return
    const list = baseList()
    if (list.some((entry) => placeKey(entry.latitude, entry.longitude) === placeKey(place.latitude, place.longitude))) {
      showNotice(`${place.name} 已在收藏中`, 'err')
      return
    }
    if (list.length >= MAX_SAVED_LOCATIONS) {
      showNotice(`最多收藏 ${MAX_SAVED_LOCATIONS} 个城市`, 'err')
      return
    }
    const next = sanitizeSavedLocations([...list, { id: newSavedId(), ...place }])
    pendingRef.current = next
    void writer.write('savedLocations', next).then((ok) => {
      if (ok) {
        showNotice(`已收藏 ${place.name}`)
      } else {
        pendingRef.current = null
        showNotice('收藏失败，请重试', 'err')
      }
    })
  }, [baseList, ensureWritable, writer, showNotice])

  const addCurrent = useCallback((): void => {
    if (!ensureWritable()) return
    if (effective.locationMode === 'manual') {
      if (effective.latitude === undefined || effective.longitude === undefined || effective.cityName === undefined) {
        showNotice('请先填写完整的坐标与显示名称', 'err')
        return
      }
      addPlace({
        name: manualDisplayName(effective.cityName),
        latitude: effective.latitude,
        longitude: effective.longitude,
      })
      return
    }
    if (effective.autoLatitude === undefined || effective.autoLongitude === undefined || effective.autoCityName === undefined) {
      // A placeholder name would otherwise create a saved entry literally named
      // "当前位置", indistinguishable from the built-in chip.
      showNotice('地名尚未解析，请稍后再试', 'err')
      return
    }
    addPlace({
      name: manualDisplayName(effective.autoCityName),
      latitude: effective.autoLatitude,
      longitude: effective.autoLongitude,
    })
  }, [effective, addPlace, ensureWritable, showNotice])

  const remove = useCallback((id: string): void => {
    if (!ensureWritable()) return
    const next = baseList().filter((entry) => entry.id !== id)
    const removingActive = effective.activeSavedId === id
    pendingRef.current = next
    // Deleting the active city reverts to the automatic location, so the UI
    // never keeps showing a city that is no longer in the list while no chip is
    // highlighted.
    const fields: Array<[string, unknown]> = [['savedLocations', next]]
    if (removingActive) fields.push(['locationMode', 'auto'])
    void commitBatch(fields, removingActive ? ['activeSavedId'] : []).then((ok) => {
      if (!ok) {
        pendingRef.current = null
        showNotice('删除失败，请重试', 'err')
      }
    })
  }, [baseList, ensureWritable, commitBatch, effective.activeSavedId, showNotice])

  return {
    saved,
    activeId: effective.activeSavedId,
    switchTo,
    selectPlace,
    useCurrent,
    addCurrent,
    addPlace,
    remove,
    isSaved,
    notice: onNotice !== undefined ? null : ownNotice,
  }
}

// ── Notifications: severe weather ────────────────────────────────────────────

/**
 * Whether a fetched payload belongs to the location currently displayed.
 *
 * `fetchWeather` stores the very `GeoLocation` object it was given, so identity
 * is the honest test — and it is deliberately stricter than comparing
 * coordinates, which would treat two distinct resolutions of the same place as
 * interchangeable. Consumers that re-run on a NAME or config change (a city
 * switch updates `placeName` one commit before the new payload arrives) must use
 * this, or they act on the previous city's weather: a notification titled with
 * the new city carrying the old city's conditions, and a dedupe key that then
 * suppresses the real alert.
 */
function payloadMatchesLocation(data: WeatherData | null, location: GeoLocation | null): boolean {
  return data !== null && location !== null && data.location === location
}

/**
 * Fire a browser notification when a severe-weather alert appears, at most once
 * per alert combination per hour (4 h for lead-time `*-soon` alerts), plus the
 * rain-soon reminder. Requires notification permission.
 *
 * Note: the dedupe map is per page lifetime (a reload can notify again) — the
 * "once per hour" promise applies within one loaded session.
 */
export function useWeatherNotifications(options: {
  effective: WeatherConfig
  data: WeatherData | null
  location: GeoLocation | null
  placeName: string
  /** True when `data` is a stale snapshot (last refresh failed). */
  stale: boolean
}): void {
  const { effective, data, location, placeName, stale } = options
  const notifiedAt = useRef(new Map<string, number>())

  useEffect(() => {
    if (!effective.alertsEnabled || data === null) return
    // The payload must belong to the location we are about to name in it.
    if (!payloadMatchesLocation(data, location)) return
    // Never notify from a snapshot whose refresh failed — it may describe
    // conditions that already changed.
    if (stale) return
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
      new Notification(`⚠ ${placeName} 天气提醒`, {
        body: alerts.map((alert) => `${alert.title}：${alert.detail}`).join('；'),
        tag: `dsh-weather-${key}`,
      })
    } catch {
      // notification construction can throw in restricted contexts — ignore
    }
  }, [data, location, effective.alertsEnabled, effective.units, placeName, stale])
}

// ── Notifications: daily brief ──────────────────────────────────────────────

/** localStorage key prefix for the once-per-slot brief dedupe. */
const BRIEF_KEY_PREFIX = 'dsh-weather-brief-'
/** How old a brief dedupe key may get before it is pruned. */
const BRIEF_KEY_RETENTION_DAYS = 3
/**
 * Catch-up window (minutes after the target time). A slot may still fire when a
 * throttled background tab or system sleep pushed the wake-up past its target —
 * but never hours later: simply opening the page at night must not push the
 * morning brief (and must not fire morning + evening together).
 */
const BRIEF_GRACE_MINUTES = 120

/** Once-per-day-slot dedupe survives reloads where localStorage is available. */
function briefAlreadySent(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) !== null
  } catch {
    return false
  }
}

function markBriefSent(storageKey: string): void {
  try {
    window.localStorage.setItem(storageKey, '1')
  } catch {
    // storage disabled — the in-session ref still prevents duplicates
  }
}

/** Drop dedupe keys older than the retention window (they would otherwise
 * accumulate two per day forever). */
function pruneBriefKeys(todayKey: string): void {
  try {
    const cutoff = new Date(`${todayKey}T00:00:00`)
    cutoff.setDate(cutoff.getDate() - BRIEF_KEY_RETENTION_DAYS)
    const stale: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key === null || !key.startsWith(BRIEF_KEY_PREFIX)) continue
      const stamp = key.slice(BRIEF_KEY_PREFIX.length, BRIEF_KEY_PREFIX.length + 10)
      const parsed = new Date(`${stamp}T00:00:00`)
      if (!Number.isNaN(parsed.getTime()) && parsed < cutoff) stale.push(key)
    }
    for (const key of stale) window.localStorage.removeItem(key)
  } catch {
    // storage unavailable — nothing to prune
  }
}

/** Minutes since local midnight for an `HH:MM` string, or undefined when invalid. */
function clockMinutes(clock: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock)
  if (match === null) return undefined
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * Push a morning brief (today's outlook) and an evening brief (tomorrow's) at
 * the configured times, at most once per slot per day. A slot only fires within
 * {@link BRIEF_GRACE_MINUTES} of its target (so enabling the feature or editing
 * the time at 22:00 cannot push a stale "今日天气"), the payload must be fresh
 * (a stale snapshot is skipped), and the dedupe mark is written only after the
 * notification was actually constructed — a failed construction is retried on
 * the next tick instead of burning the day's slot.
 *
 * Times are interpreted in the DEVICE's timezone (the brief is "your morning",
 * not the city's); multi-tab double-sends are collapsed by the shared storage
 * key and the identical notification `tag`.
 */
export function useDailyBrief(options: {
  effective: WeatherConfig
  data: WeatherData | null
  location: GeoLocation | null
  placeName: string
  /** True when `data` is a stale snapshot (last refresh failed). */
  stale: boolean
}): void {
  const { effective, data, location, placeName, stale } = options
  const sentRef = useRef(new Set<string>())
  // Latest payload/staleness read by the minute tick without restarting it on
  // every refresh (restarting made each auto-refresh run an immediate check).
  const dataRef = useRef(data)
  dataRef.current = data
  const staleRef = useRef(stale)
  staleRef.current = stale
  const locationRef = useRef(location)
  locationRef.current = location

  useEffect(() => {
    if (!effective.enabled || !effective.briefEnabled) return

    const build = (slot: 'morning' | 'evening'): { title: string; body: string } | null => {
      const current = dataRef.current
      if (current === null) return null
      // The brief names `placeName` but reads this payload: they must be the same
      // city, or a switch inside the catch-up window burns the day's slot with
      // the previous city's weather (and the localStorage mark then suppresses
      // the correct brief).
      if (!payloadMatchesLocation(current, locationRef.current)) return null
      const day = slot === 'morning' ? current.daily[0] : current.daily[1]
      if (day === undefined) return null
      const condition = describeCondition(day.weatherCode, true)
      const range = `${tempText(day.tempMin, effective.units)} ~ ${tempText(day.tempMax, effective.units)}`
      const rain = day.precipProb > 0 ? ` · 降水 ${day.precipProb}%` : ''
      return {
        title: `${slot === 'morning' ? '☀️ 今日天气' : '🌙 明日天气'} · ${placeName}`,
        body: `${condition.label} ${range}${rain}`,
      }
    }

    const check = (): void => {
      const now = new Date()
      if (staleRef.current) return
      // The permission is re-read on every tick, not only when the effect mounts.
      // The gate used to sit above the timer, so granting permission while the
      // brief was being enabled (the common first-run path: the write lands while
      // the permission dialog is still open) left the effect armed with
      // 'default' and no timer at all — the brief stayed silent until a reload.
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      for (const slot of ['morning', 'evening'] as const) {
        const wanted = slot === 'morning' ? effective.briefMorning : effective.briefEvening
        const target = clockMinutes(wanted)
        if (target === undefined) continue
        const delta = nowMinutes - target
        // Only within the catch-up window: never fire hours late.
        if (delta < 0 || delta > BRIEF_GRACE_MINUTES) continue
        const storageKey = `${BRIEF_KEY_PREFIX}${dayKey(now)}-${slot}`
        if (sentRef.current.has(storageKey) || briefAlreadySent(storageKey)) continue
        const payload = build(slot)
        if (payload === null) continue
        try {
          new Notification(payload.title, { body: payload.body, tag: storageKey })
        } catch {
          // Construction can throw in restricted contexts — keep the slot open
          // and retry on the next tick instead of marking it as sent.
          continue
        }
        sentRef.current.add(storageKey)
        markBriefSent(storageKey)
      }
      pruneBriefKeys(dayKey(now))
    }

    // Minute-aligned tick keeps the check cheap; correctness comes from the
    // window comparison above, not from the tick landing exactly.
    let timer = 0
    const loop = (): void => {
      check()
      timer = window.setTimeout(loop, 60_000 - (Date.now() % 60_000) + 20)
    }
    loop()
    return () => window.clearTimeout(timer)
  }, [
    effective.enabled,
    effective.briefEnabled,
    effective.briefMorning,
    effective.briefEvening,
    effective.units,
    placeName,
  ])
}

// ── Tab title ───────────────────────────────────────────────────────────────

/**
 * Show the current weather in the browser tab title
 * (`☀️ 26° 广州 — 应用标题`).
 *
 * `document.title` is a shared global: the host (ui-layout's DocumentTitle)
 * rewrites it on session rename/switch, so the base title cannot be sampled
 * once. Every run reconciles instead — if the current title is neither the one
 * this hook wrote nor one carrying our own prefix, it is a host value and
 * becomes the new base. Restoration (disable / error / unmount) only happens
 * while the title is still the string we wrote, so the plugin never clobbers a
 * title the host changed in the meantime.
 */
export function useTabTitle(options: {
  effective: WeatherConfig
  data: WeatherData | null
  status: string
  placeName: string
}): void {
  const { effective, data, status, placeName } = options
  const baseTitleRef = useRef<string | null>(null)
  const lastWrittenRef = useRef<string | null>(null)

  useEffect(() => () => {
    if (baseTitleRef.current !== null
      && lastWrittenRef.current !== null
      && document.title === lastWrittenRef.current) {
      document.title = baseTitleRef.current
    }
    lastWrittenRef.current = null
  }, [])

  useEffect(() => {
    const ours = lastWrittenRef.current
    if (!effective.enabled) {
      if (baseTitleRef.current !== null && ours !== null && document.title === ours) {
        document.title = baseTitleRef.current
      }
      lastWrittenRef.current = null
      return
    }
    if (data === null) {
      if (status === 'error' && baseTitleRef.current !== null && ours !== null && document.title === ours) {
        document.title = baseTitleRef.current
        lastWrittenRef.current = null
      }
      return
    }
    const current = document.title
    if (baseTitleRef.current === null || (current !== ours && !TITLE_PREFIX_RE.test(current))) {
      // Host value (or the first sample): strip our own prefix if a previous
      // page life left one behind, then adopt it as the base.
      const match = current.match(TITLE_PREFIX_RE)
      baseTitleRef.current = match !== null ? current.slice(match[0].length) : current
    }
    const condition = describeCondition(data.current.weatherCode, data.current.isDay)
    const title = `${condition.emoji} ${tempText(data.current.temperature, effective.units)} ${placeName} — ${baseTitleRef.current ?? current}`
    if (document.title !== title) document.title = title
    lastWrittenRef.current = title
  }, [data, effective.enabled, effective.units, placeName, status])
}

// ── Day detail ──────────────────────────────────────────────────────────────

export interface DayDetailState {
  /** Date currently opened (`YYYY-MM-DD`), or null when the popover is on the normal view. */
  date: string | null
  detail: DayDetail | null
  busy: boolean
  error: string | null
  open: (date: string) => void
  close: () => void
  /** Re-fetch the opened date after a failure (bypasses the cache). */
  retry: () => void
}

/** Location identity key — the detail request only counts for the same city. */
function locationKey(location: GeoLocation | null): string | null {
  return location === null ? null : `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`
}

/**
 * Fetch (on demand) the hourly detail for one forecast day. The request is
 * tagged with the city it was opened for: switching cities closes the view
 * without firing a doomed "old date, new city" request, and an in-flight
 * request is aborted on change. Re-opening the same day is a no-op (the cached
 * payload is reused); a retry bypasses the cache.
 */
export function useDayDetail(location: GeoLocation | null): DayDetailState {
  const [request, setRequest] = useState<{ date: string; key: string; nonce: number } | null>(null)
  const [detail, setDetail] = useState<DayDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // `${cityKey}|${date}` → payload, so来回切换日期不会重复请求。
  const cacheRef = useRef(new Map<string, DayDetail>())
  const currentKey = locationKey(location)
  const active = request !== null && currentKey !== null && request.key === currentKey

  useEffect(() => {
    if (request === null || location === null) return
    // Another city's view: the payload must not be requested at all.
    if (locationKey(location) !== request.key) return
    const cacheId = `${request.key}|${request.date}`
    const cached = request.nonce === 0 ? cacheRef.current.get(cacheId) : undefined
    if (cached !== undefined) {
      setDetail(cached)
      setError(null)
      setBusy(false)
      return
    }
    const controller = new AbortController()
    let cancelled = false
    setBusy(true)
    setError(null)
    setDetail(null)
    void fetchDayDetail(location, request.date, controller.signal)
      .then((result) => {
        if (cancelled) return
        cacheRef.current.set(cacheId, result)
        setDetail(result)
      })
      .catch((err) => {
        // An aborted request is a superseded view, not a user-facing failure.
        if (cancelled || controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [request, location])

  const open = useCallback((next: string): void => {
    const key = locationKey(location)
    if (key === null) return
    setRequest((prev) => (
      prev !== null && prev.key === key && prev.date === next && prev.nonce === 0
        ? prev
        : { date: next, key, nonce: 0 }
    ))
  }, [location])

  const close = useCallback((): void => {
    setRequest(null)
    setDetail(null)
    setError(null)
  }, [])

  const retry = useCallback((): void => {
    setRequest((prev) => (prev === null ? null : { ...prev, nonce: prev.nonce + 1 }))
  }, [])

  return {
    date: active && request !== null ? request.date : null,
    detail: active ? detail : null,
    busy: active && busy,
    error: active ? error : null,
    open,
    close,
    retry,
  }
}
