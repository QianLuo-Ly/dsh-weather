/**
 * Weather behaviour hooks — location, feed, saved cities, severe notifications,
 * tab title and day detail. All hooks take the sanitized config section plus a
 * SettingsScope and return plain state; units are applied in units.ts, not here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  deepEqual,
  locationIdentityKey,
  MAX_SAVED_LOCATIONS,
  placeKey,
  REFRESH_RANGE,
  sanitizeSavedLocations,
  sanitizeText,
  type SavedLocation,
  type WeatherConfig,
} from '../config-shared'
import { evaluateAlerts } from './alerts'
import {
  cityLevelName,
  CURRENT_LOCATION_LABEL,
  resolveAutoLocation,
  resolveFreshIfDrifted,
  type GeoLocation,
} from './geolocation'
import {
  fetchDayDetail,
  fetchWeather,
  type DayDetail,
  type WeatherData,
} from './weather-api'
import { CONDITION_EMOJIS, describeCondition, rainOnsetRounded } from './condition'
import { payloadMatchesLocation } from './location-match'
import { tempText, windText } from './units'

/**
 * Minimum gap (ms) between IP-drift probes — a persist re-runs the location
 * effect, and that cascade must not fire another network probe.
 */
const DRIFT_PROBE_MIN_GAP_MS = 60_000
/** How often the open page re-checks IP drift (network moves mid-session). */
const DRIFT_PROBE_INTERVAL_MS = 60 * 60_000
/** Upper bound on the in-memory notification dedupe map. */
const NOTIFY_DEDUPE_MAX = 24

/**
 * Matches this plugin's own tab-title prefix (`<emoji> <label> <temp> <name> —`);
 * an unrecognised prefix is adopted as the base and the title grows a copy of
 * itself each write. Emoji list comes from `condition.ts`, the label segment is
 * required, and the optional sign covers sub-zero `tempText` output.
 */
const TITLE_PREFIX_RE = new RegExp(`^(?:${CONDITION_EMOJIS.join('|')}) \\S+ -?\\d+°[CF] .+? — `)

/**
 * `addCurrent` refuses to save the automatic location while its name is still
 * {@link CURRENT_LOCATION_LABEL} — `persistLocation` writes that value into
 * `autoCityName` when the geocoder returns nothing, so the stored name can be
 * indistinguishable from the built-in chip. The constant lives in geolocation.ts.
 */

/** Manual-mode display name reduced to city level (`广东省广州市番禺区` → `广东省广州市`). */
function manualDisplayName(cityName: string | undefined): string {
  const raw = cityName?.trim()
  const reduced = raw !== undefined && raw !== '' ? cityLevelName(raw) : ''
  return reduced !== '' ? reduced : CURRENT_LOCATION_LABEL
}

/**
 * Location implied by config alone: manual coordinates, or the cached auto fix.
 * Returns null for auto mode with no usable cache (the caller then resolves a
 * fresh location); throws when manual mode has incomplete coordinates.
 */
function baseLocationFrom(
  effective: WeatherConfig,
  bypassCache: boolean,
): { kind: 'manual' | 'cached'; loc: GeoLocation } | null {
  if (effective.locationMode === 'manual') {
    if (effective.latitude === undefined || effective.longitude === undefined) {
      throw new Error('手动模式缺少坐标，请在 设置 → 天气 中填写')
    }
    return {
      kind: 'manual',
      loc: {
        name: manualDisplayName(effective.cityName),
        latitude: effective.latitude,
        longitude: effective.longitude,
        source: 'manual',
      },
    }
  }
  if (bypassCache || effective.autoLatitude === undefined || effective.autoLongitude === undefined) return null
  return {
    kind: 'cached',
    loc: {
      // Preserve verbatim — may already carry a district (区) from a trusted fix.
      name: effective.autoCityName !== undefined && effective.autoCityName !== ''
        ? effective.autoCityName
        : CURRENT_LOCATION_LABEL,
      latitude: effective.autoLatitude,
      longitude: effective.autoLongitude,
      source: effective.autoSource ?? 'ip',
    },
  }
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

/**
 * Stable empty list — a fresh `[]` per render would re-fire the config effect
 * while the settings namespace has not resolved yet.
 */
const EMPTY_SAVED: SavedLocation[] = []

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
 * Resolve the active location from config, cache the auto result, and follow IP
 * drift while the page stays open (same-place early-out incl. GPS-trusted cache).
 */
export function useAutoLocation(options: {
  scope: SettingsScope<WeatherConfig>
  effective: WeatherConfig
}): AutoLocationState {
  const { scope, effective } = options
  const [location, setLocation] = useState<GeoLocation | null>(null)
  // Starts true so consumers show "定位中…" rather than a transient "加载失败".
  const [locating, setLocating] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [relocateTick, setRelocateTick] = useState(0)
  const bypassCacheRef = useRef(false)
  const lastDriftProbeRef = useRef(0)
  const driftTimerRef = useRef<number | null>(null)
  const [driftNotice, setDriftNotice] = useState<string | null>(null)
  // Mirrored for the async drift path — toggling must not re-run the locate chain.
  const alertsEnabledRef = useRef(effective.alertsEnabled)
  alertsEnabledRef.current = effective.alertsEnabled

  // Persist a resolved auto location so it stays stable across refreshes and the
  // location effect converges on the new coordinates (internal cache writes).
  const writer = useConfigWriter(scope)
  const persistLocation = useCallback((loc: GeoLocation): void => {
    writer.write('autoLatitude', loc.latitude)
    writer.write('autoLongitude', loc.longitude)
    // Remote-composed (geocoder + province joining) and may exceed the name
    // budget; sanitize here or stored and displayed values disagree.
    writer.write('autoCityName', sanitizeText(loc.name) ?? CURRENT_LOCATION_LABEL)
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

  /**
   * IP-drift check on a cached auto fix: a fresh IP consensus more than
   * AUTO_LOCATION_DRIFT_KM away means the network moved, so the caller adopts it.
   * GPS caches are never re-checked. The shared gate is armed before the probe and
   * rolled back when the probe was superseded, so a double-run cannot hide drift.
   */
  const probeDrift = useCallback(async (
    cached: GeoLocation,
    isCancelled: () => boolean,
  ): Promise<GeoLocation | null> => {
    if (cached.source === 'gps') return null
    if (Date.now() - lastDriftProbeRef.current < DRIFT_PROBE_MIN_GAP_MS) return null
    const previousGate = lastDriftProbeRef.current
    lastDriftProbeRef.current = Date.now()
    const fresh = await resolveFreshIfDrifted(cached)
    if (isCancelled()) {
      lastDriftProbeRef.current = previousGate
      return null
    }
    return fresh
  }, [])

  // Re-resolves on mount, on location-setting changes, and on explicit relocate.
  useEffect(() => {
    if (!effective.enabled) return
    // Consumed exactly once: leaving it set would defeat the same-place early-out
    // and make "back to auto" skip the cached coordinates.
    const bypassCache = bypassCacheRef.current
    bypassCacheRef.current = false
    // Display-metadata writes (city-name edits, name/source persisted alongside
    // unchanged coords) re-run this effect but must not re-resolve or flash a
    // busy state — coordinates + mode are the only real inputs.
    const samePlace = !bypassCache
      && location !== null
      && (effective.locationMode === 'manual'
        ? location.source === 'manual' && location.latitude === effective.latitude && location.longitude === effective.longitude
        // Source matters too: manual→auto at identical coords would keep
        // `source: 'manual'` and drop the GPS/IP badge in the popover header.
        : location.source !== 'manual' && location.latitude === effective.autoLatitude && location.longitude === effective.autoLongitude)
    if (samePlace) {
      // A superseded run can leave `locating`/`error` set; returning without
      // clearing them strands the chip on "定位中…" forever.
      setLocating(false)
      setError(null)
      return
    }
    let cancelled = false
    setLocating(true)
    setError(null)
    void (async () => {
      try {
        const base = baseLocationFrom(effective, bypassCache)
        let loc: GeoLocation
        if (base === null) {
          // No usable cache (first run or explicit re-locate): persist the result
          // so it stops hopping across refreshes, arming the drift gate first so
          // the persist→effect cascade cannot re-probe the stored location.
          loc = await resolveAutoLocation()
          if (cancelled) return
          lastDriftProbeRef.current = Date.now()
          persistLocation(loc)
        } else {
          loc = base.loc
          if (base.kind === 'cached') {
            const fresh = await probeDrift(base.loc, () => cancelled)
            if (cancelled) return
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
    // Location-affecting inputs only: the display-metadata fields are written by
    // this effect itself. `location` is read but not listed so the early-out sees
    // it without re-running on every object identity.
    effective.enabled,
    effective.locationMode,
    effective.latitude,
    effective.longitude,
    effective.autoLatitude,
    effective.autoLongitude,
    relocateTick,
    persistLocation,
    showDrift,
    probeDrift,
  ])

  // Periodic IP-drift probe (auto mode, IP-derived cache only): a network move
  // while the page stays open is adopted so the forecast follows automatically.
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
      // A hidden tab must not re-resolve (three IP providers + GPS + geocode);
      // mobile browsers keep background tabs alive for hours. The shared gate
      // also keeps tab-flipping from becoming a probe storm.
      if (document.hidden || Date.now() - lastDriftProbeRef.current < DRIFT_PROBE_MIN_GAP_MS) return
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
    const onVisibility = (): void => {
      if (!document.hidden) probe()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
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

  /**
   * Force one re-resolve that ignores the cached auto location (consumed once
   * by the location effect, whichever mode is active).
   */
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
  // Last good payload, keyed by location (metric, so a unit switch keeps it).
  const lastGoodRef = useRef<{ weather: WeatherData; key: string } | null>(null)

  useEffect(() => {
    if (!effective.enabled || location === null) return
    const controller = new AbortController()
    let cancelled = false
    const locKey = locationIdentityKey(location.latitude, location.longitude)
    const shown = lastGoodRef.current
    if (shown === null || shown.key !== locKey) {
      // No snapshot for this location yet — must not show a previous city's.
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
        // Degrade to the cached snapshot only for the SAME location — another
        // city's snapshot would mislead more than an error.
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

  // Auto-refresh on the configured interval (sanitized, always ≥ 5). A hidden
  // tab does not refresh; returning to the foreground refreshes at once instead
  // of waiting out the interval.
  useEffect(() => {
    if (!effective.enabled) return
    const id = window.setInterval(() => {
      if (!document.hidden) setTick((n) => n + 1)
    }, Math.max(REFRESH_RANGE.min, effective.refreshMinutes) * 60_000)
    const onVisibility = (): void => {
      if (!document.hidden) setTick((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
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
 * Write a batch and confirm the authority holds it, re-issuing once if not.
 * `set()`/`unset()` RESOLVE even on a Host rejection (failure is folded into a
 * recovery read), so success is read back from the snapshot. The routine refusal
 * is the revision fence (`settings/conflict`), which the re-issue clears.
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
      && fields.every(([field, value]) => deepEqual(current[field], value))
      && clears.every((field) => current[field] === undefined)
  }
  // Never rejects: a throw is "did not land", which the retry re-attempts.
  const attempt = (): Promise<boolean> => apply().then(landed, () => false)
  return attempt().then((ok) => (ok ? true : attempt()))
}

/**
 * Config write helpers honoring the SettingsScope contract: every helper reads
 * the snapshot back to report success, because `set()` RESOLVES even when the
 * Host rejected the write (the failure is folded into a recovery read).
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
      verify: (checks: Array<[string, unknown]>): boolean =>
        checks.every(([field, expected]) => deepEqual(fieldValue(field), expected)),
    }
  }, [scope])
}

/**
 * Manage the saved-city list + active city, persisted through settings. Every
 * mutation is read back before its success notice, and `activeSavedId` is cleared
 * whenever the shown location stops being that entry (custom coords, search pick,
 * mode switch) — so chip and list can never highlight a different city.
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
  // Latest list this hook wrote: two quick edits would otherwise compute from
  // the same pre-write snapshot and the second would drop the first.
  const pendingRef = useRef<SavedLocation[] | null>(null)

  // Drop the optimistic base only on an exact match (same length, same ids).
  // Identity fails because sanitizeConfig rebuilds the array every snapshot;
  // "every pending entry present" fails for a delete, whose survivors all appear
  // in the pre-write snapshot — a second delete then resurrected the first city.
  useEffect(() => {
    const pending = pendingRef.current
    if (pending === null) return
    if (pending.length === saved.length
      && pending.every((entry) => saved.some((current) => current.id === entry.id))) {
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
   * Issue several field writes in one batch (the transport publishes only the
   * final state) and verify the resulting snapshot.
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
    // Coords and name first, mode/active id last: the batch publishes once as a
    // complete manual location, never "manual without coordinates".
    void commitBatch([
      ['latitude', target.latitude],
      ['longitude', target.longitude],
      ['cityName', target.name],
      ['activeSavedId', target.id],
      ['locationMode', 'manual'],
    ]).then((ok) => showNotice(ok ? `已切换到 ${target.name}` : '切换失败，请重试', ok ? 'ok' : 'err'))
  }, [baseList, commitBatch, showNotice])

  /**
   * Use an arbitrary place (search result) as custom coordinates — it is not a
   * saved city, so any previously active saved id is cleared.
   */
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
    let place: { name: string; latitude: number; longitude: number }
    if (effective.locationMode === 'manual') {
      if (effective.latitude === undefined || effective.longitude === undefined || effective.cityName === undefined) {
        showNotice('请先填写完整的坐标与显示名称', 'err')
        return
      }
      place = {
        name: manualDisplayName(effective.cityName),
        latitude: effective.latitude,
        longitude: effective.longitude,
      }
    } else {
      if (effective.autoLatitude === undefined || effective.autoLongitude === undefined || effective.autoCityName === undefined) {
        showNotice('地名尚未解析，请稍后再试', 'err')
        return
      }
      place = {
        name: manualDisplayName(effective.autoCityName),
        latitude: effective.autoLatitude,
        longitude: effective.autoLongitude,
      }
    }
    // Test the RESOLVED name, not that the field exists: `persistLocation` stores
    // CURRENT_LOCATION_LABEL when the geocoder is empty, so an existence check
    // lets through a city indistinguishable from the built-in chip.
    if (place.name === CURRENT_LOCATION_LABEL) {
      showNotice('地名尚未解析，请稍后再试', 'err')
      return
    }
    addPlace(place)
  }, [effective, addPlace, ensureWritable, showNotice])

  const remove = useCallback((id: string): void => {
    if (!ensureWritable()) return
    const next = baseList().filter((entry) => entry.id !== id)
    const removingActive = effective.activeSavedId === id
    pendingRef.current = next
    // Deleting the active city reverts to auto, so the UI never shows a city
    // that is no longer in the list.
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
 * Notify on severe-weather alerts, at most once per combination per hour (4 h
 * for `*-soon`), plus the rain-soon reminder. Needs notification permission; the
 * dedupe map is per page lifetime, so a reload can notify again.
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
    // Never notify from a stale snapshot — its conditions may have changed.
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
    try {
      new Notification(`⚠ ${placeName} 天气提醒`, {
        body: alerts.map((alert) => `${alert.title}：${alert.detail}`).join('；'),
        tag: `dsh-weather-${key}`,
      })
    } catch {
      // Construction can throw in restricted contexts — return WITHOUT recording,
      // so the alert retries instead of being suppressed by an unseen notice.
      return
    }
    // Record only after a notice was shown. Evict the oldest key (insertion
    // order) rather than clearing wholesale, which re-arms every combination
    // mid-storm.
    if (notifiedAt.current.size >= NOTIFY_DEDUPE_MAX) {
      const oldest = notifiedAt.current.keys().next().value
      if (oldest !== undefined) notifiedAt.current.delete(oldest)
    }
    notifiedAt.current.set(key, now)
  }, [data, location, effective.alertsEnabled, effective.units, placeName, stale])
}


// ── Tab title ───────────────────────────────────────────────────────────────

/**
 * Show the weather in the tab title (`☀️ 26° 广州 — 应用标题`). `document.title`
 * is shared with the host (rewritten on session rename/switch), so each run
 * re-samples the base: a title that is neither ours nor our prefix is a host
 * value. Restore only while the title still equals what we wrote.
 */
export function useTabTitle(options: {
  effective: WeatherConfig
  data: WeatherData | null
  /** Chip status as the bar computes it (`locating` included). */
  status: 'loading' | 'ready' | 'error' | 'locating'
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
      // Host value (or first sample): strip any leftover prefix, then adopt.
      const match = current.match(TITLE_PREFIX_RE)
      baseTitleRef.current = match !== null ? current.slice(match[0].length) : current
    }
    const condition = describeCondition(data.current.weatherCode, data.current.isDay)
    // Label rides with the emoji: 🌧 alone spans 小雨 through 中雨.
    const title = `${condition.emoji} ${condition.label} ${tempText(data.current.temperature, effective.units)} ${placeName} — ${baseTitleRef.current ?? current}`
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

/**
 * Location identity key — the detail request only counts for the same city.
 * `null` in, `null` out, so callers can compare "no location" without a branch.
 */
function locationKey(location: GeoLocation | null): string | null {
  return location === null ? null : locationIdentityKey(location.latitude, location.longitude)
}

/**
 * Fetch the hourly detail for one forecast day on demand. The request is tagged
 * with its city, so switching cities closes the view without firing an "old date,
 * new city" request and aborts the in-flight one; re-opening reuses the cache.
 */
export function useDayDetail(location: GeoLocation | null): DayDetailState {
  const [request, setRequest] = useState<{ date: string; key: string; nonce: number } | null>(null)
  const [detail, setDetail] = useState<DayDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // `${cityKey}|${date}` → payload, so flipping between dates does not re-request.
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
