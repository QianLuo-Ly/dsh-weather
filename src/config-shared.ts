/**
 * Shared contract between the Host half and the browser half: plain data only,
 * since the browser bundle inlines it and the purity gate forbids framework
 * value imports in a plugin bundle.
 */

/** Settings namespace shared by both halves. */
export const WEATHER_NS = 'weather'

/** A user-saved city for quick switching (chip switcher / settings list). */
export interface SavedLocation {
  /** Stable id for switching/removal (client-generated). */
  id: string
  /** Display name (Chinese preferred). */
  name: string
  /** WGS84 latitude. */
  latitude: number
  /** WGS84 longitude. */
  longitude: number
}

/** Durable, user-facing weather plugin configuration. */
export interface WeatherConfig {
  /** Whether the weather chip in the conversation header is visible. */
  enabled: boolean
  /**
   * `auto` resolves once per page load via IP geolocation; `manual` uses the
   * configured coordinates / city name.
   */
  locationMode: 'auto' | 'manual'
  /** Manual-mode latitude (WGS84). */
  latitude?: number
  /** Manual-mode longitude (WGS84). */
  longitude?: number
  /** Display name override for the location (used in manual mode). */
  cityName?: string
  /** User-saved cities shown in the switcher and managed in settings. */
  savedLocations?: SavedLocation[]
  /**
   * Id of the saved city currently shown; cleared when the user returns to
   * "当前位置".
   */
  activeSavedId?: string
  /** Temperature unit. */
  units: 'celsius' | 'fahrenheit'
  /** Auto-refresh interval in minutes. */
  refreshMinutes: number
  /** Whether severe-weather browser notifications are enabled. */
  alertsEnabled: boolean
  /** Whether the daily weather brief notifications are enabled. */
  briefEnabled: boolean
  /** Morning brief time `HH:MM` — today's outlook. */
  briefMorning: string
  /** Evening brief time `HH:MM` — tomorrow's outlook. */
  briefEvening: string
  /** Cached auto-resolved location (set by the plugin, not user-editable). */
  autoLatitude?: number
  /** Cached auto-resolved location (set by the plugin, not user-editable). */
  autoLongitude?: number
  /** Cached auto-resolved display name (set by the plugin, not user-editable). */
  autoCityName?: string
  /** Cached auto-resolved source (`gps`/`ip`), so the badge stays truthful. */
  autoSource?: 'gps' | 'ip'
}

/** Upper bound on saved cities — keeps the chip switcher and settings list sane. */
export const MAX_SAVED_LOCATIONS = 8

/** Longest accepted display name / id — keeps settings documents and UI sane. */
export const MAX_NAME_LENGTH = 40
/** Longest accepted saved-city id (client-generated today, hand-edited files may differ). */
export const MAX_ID_LENGTH = 64

/**
 * Default daily-brief times — the single source for the Host schema defaults,
 * the client fallback and the invalid-stored-value fallback.
 */
export const BRIEF_TIMES = { morning: '08:00', evening: '20:00' } as const

/** `HH:MM` (00:00–23:59) pattern shared by the Host schema and the client parser. */
export const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Fallback config matching the Host schema defaults, used until the settings
 * namespace resolves so the bar never vanishes on first paint. Keep in sync
 * with `WeatherConfigSchema` in src/index.ts.
 */
export const DEFAULT_WEATHER_CONFIG: WeatherConfig = {
  enabled: true,
  locationMode: 'auto',
  units: 'celsius',
  refreshMinutes: 15,
  alertsEnabled: false,
  briefEnabled: false,
  briefMorning: BRIEF_TIMES.morning,
  briefEvening: BRIEF_TIMES.evening,
}

/**
 * Accept only `HH:MM` (00:00–23:59), else undefined. The normalized value is
 * the matched text, never rebuilt from capture groups: that produced
 * `"HH:undefined"` the moment a group was missing, corrupting every write.
 */
export function parseClockTime(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return CLOCK_TIME_PATTERN.test(trimmed) ? trimmed : undefined
}

/**
 * Single source for the auto-refresh range: the Host schema bounds, the
 * settings slider and the runtime clamp all derive from these.
 */
export const REFRESH_RANGE = { min: 5, max: 120, step: 5 } as const

/** Coordinate bounds matching the Host schema (WGS84). */
export const LAT_RANGE = { min: -90, max: 90 } as const
export const LON_RANGE = { min: -180, max: 180 } as const

/**
 * Control / invisible characters that must not reach a settings document:
 * C0 + C1 controls, DEL, zero-width characters and bidi overrides.
 */
const UNSAFE_TEXT_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

/**
 * Normalize a user-facing text field at the trust boundary: drop control /
 * invisible characters, trim, cap by code point (never splitting a surrogate).
 * Undefined for empty/non-string. The cap is deliberately not a Host `.max()` —
 * that, measured in UTF-16 units, would reject a value this function blessed.
 */
export function sanitizeText(value: unknown, maxLength = MAX_NAME_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(UNSAFE_TEXT_RE, '').trim()
  if (cleaned === '') return undefined
  if (cleaned.length <= maxLength) return cleaned
  return Array.from(cleaned).slice(0, maxLength).join('')
}

/**
 * Canonical place quantum, in decimal places (~100 m) — the saved-city dedupe
 * grid, shared with the coordinate rounding in `geolocation.ts`. It is not 4: a
 * finer key stops recognising the same place, letting one city be saved twice
 * (a search hit keeps full precision; an auto fix already sits on this grid).
 */
export const PLACE_DECIMALS = 3

/**
 * Canonical place key for deduping saved cities. `-0` is normalized so it
 * cannot yield a second key next to `0` for the same spot.
 */
export function placeKey(latitude: number, longitude: number): string {
  const fixed = (value: number): string => (value === 0 ? 0 : value).toFixed(PLACE_DECIMALS)
  return `${fixed(latitude)},${fixed(longitude)}`
}

/**
 * Exact-coordinate identity key (5 decimals, ~1 m) for tagging a request or a
 * cached payload with its location. Deliberately NOT {@link placeKey}: that
 * snaps to the ~100 m display quantum, so keying a day-detail request by it
 * would let a search-picked city and an auto-resolved one share a payload.
 */
export function locationIdentityKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`
}

/**
 * Structural equality for plain JSON-shaped values (a config or saved-city
 * array). Replaces the `JSON.stringify(a) === JSON.stringify(b)` idiom, which
 * reads as equality but really means "same keys, same ORDER" — it held only
 * because `sanitizeConfig` rebuilds objects with a fixed key order.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((entry, index) => deepEqual(entry, b[index]))
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) =>
    Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]))
}

/**
 * Normalize a stored saved-city list: drop entries with a missing id/name or
 * out-of-range coordinates, dedupe by id and by rounded coordinates, cap at
 * {@link MAX_SAVED_LOCATIONS}.
 */
export function sanitizeSavedLocations(input: unknown): SavedLocation[] {
  if (!Array.isArray(input)) return []
  const seenIds = new Set<string>()
  const seenPlaces = new Set<string>()
  const out: SavedLocation[] = []
  for (const entry of input) {
    if (typeof entry !== 'object' || entry === null) continue
    const candidate = entry as Partial<SavedLocation>
    const id = sanitizeText(candidate.id, MAX_ID_LENGTH)
    const name = sanitizeText(candidate.name)
    const latitude = typeof candidate.latitude === 'number' && Number.isFinite(candidate.latitude) ? candidate.latitude : NaN
    const longitude = typeof candidate.longitude === 'number' && Number.isFinite(candidate.longitude) ? candidate.longitude : NaN
    if (id === undefined || name === undefined || Number.isNaN(latitude) || Number.isNaN(longitude)) continue
    if (latitude < LAT_RANGE.min || latitude > LAT_RANGE.max) continue
    if (longitude < LON_RANGE.min || longitude > LON_RANGE.max) continue
    if (seenIds.has(id)) continue
    const key = placeKey(latitude, longitude)
    if (seenPlaces.has(key)) continue
    seenIds.add(id)
    seenPlaces.add(key)
    out.push({ id, name, latitude, longitude })
    if (out.length >= MAX_SAVED_LOCATIONS) break
  }
  return out
}

/**
 * Structural equality for two sanitized configs, so components skip re-render
 * on snapshots that carry no change (`sanitizeConfig` rebuilds the object).
 */
export function sameConfig(a: WeatherConfig | undefined, b: WeatherConfig | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  return deepEqual(a, b)
}

/**
 * Normalize an arbitrary stored section into a valid {@link WeatherConfig}.
 * Documents can be hand-edited or written by an older schema, so every field is
 * type-checked, ranged and defaulted — a missing value stays undefined, never a
 * fabricated 0 (`refreshMinutes` must not surface as `NaN`).
 */
export function sanitizeConfig(input: Partial<WeatherConfig> | null | undefined): WeatherConfig {
  const raw = input ?? {}
  const pickNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined
  const pickString = (value: unknown, maxLength = MAX_NAME_LENGTH): string | undefined =>
    sanitizeText(value, maxLength)
  const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value))

  const latitude = pickNumber(raw.latitude)
  const longitude = pickNumber(raw.longitude)
  const autoLatitude = pickNumber(raw.autoLatitude)
  const autoLongitude = pickNumber(raw.autoLongitude)
  const refreshMinutes = pickNumber(raw.refreshMinutes)
  const units = raw.units === 'celsius' || raw.units === 'fahrenheit' ? raw.units : DEFAULT_WEATHER_CONFIG.units
  const locationMode = raw.locationMode === 'auto' || raw.locationMode === 'manual' ? raw.locationMode : DEFAULT_WEATHER_CONFIG.locationMode
  const autoSource = raw.autoSource === 'gps' || raw.autoSource === 'ip' ? raw.autoSource : undefined

  const savedLocations = sanitizeSavedLocations(raw.savedLocations)
  const activeSavedId = pickString(raw.activeSavedId, MAX_ID_LENGTH)
  const briefMorning = parseClockTime(raw.briefMorning) ?? BRIEF_TIMES.morning
  const briefEvening = parseClockTime(raw.briefEvening) ?? BRIEF_TIMES.evening

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_WEATHER_CONFIG.enabled,
    locationMode,
    latitude: latitude !== undefined ? clamp(latitude, LAT_RANGE.min, LAT_RANGE.max) : undefined,
    longitude: longitude !== undefined ? clamp(longitude, LON_RANGE.min, LON_RANGE.max) : undefined,
    cityName: pickString(raw.cityName),
    savedLocations,
    // Drop an activeSavedId whose entry vanished (deleting the active city falls back).
    activeSavedId: activeSavedId !== undefined && savedLocations.some((entry) => entry.id === activeSavedId)
      ? activeSavedId
      : undefined,
    units,
    refreshMinutes: refreshMinutes === undefined
      ? DEFAULT_WEATHER_CONFIG.refreshMinutes
      : clamp(Math.round(refreshMinutes / REFRESH_RANGE.step) * REFRESH_RANGE.step, REFRESH_RANGE.min, REFRESH_RANGE.max),
    alertsEnabled: typeof raw.alertsEnabled === 'boolean' ? raw.alertsEnabled : DEFAULT_WEATHER_CONFIG.alertsEnabled,
    briefEnabled: typeof raw.briefEnabled === 'boolean' ? raw.briefEnabled : DEFAULT_WEATHER_CONFIG.briefEnabled,
    briefMorning,
    briefEvening,
    autoLatitude: autoLatitude !== undefined ? clamp(autoLatitude, LAT_RANGE.min, LAT_RANGE.max) : undefined,
    autoLongitude: autoLongitude !== undefined ? clamp(autoLongitude, LON_RANGE.min, LON_RANGE.max) : undefined,
    autoCityName: pickString(raw.autoCityName),
    autoSource,
  }
}
