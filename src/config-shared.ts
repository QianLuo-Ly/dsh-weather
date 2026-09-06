/**
 * Shared contract between the Host half and the browser half.
 * Keep this file free of value dependencies beyond plain data — the browser
 * bundle inlines it, and the client-bundle purity gate forbids pulling
 * framework value imports into a plugin bundle.
 */

/** Settings namespace registered by the Host half and bound by the browser half. */
export const WEATHER_NS = 'weather'

/** Durable, user-facing weather plugin configuration. */
export interface WeatherConfig {
  /** Whether the weather chip in the conversation header is visible. */
  enabled: boolean
  /**
   * Location resolution mode:
   * - `auto`   — resolve the current location once per page load via IP geolocation.
   * - `manual` — use the configured `latitude` / `longitude` / `cityName`.
   */
  locationMode: 'auto' | 'manual'
  /** Manual-mode latitude (WGS84). */
  latitude?: number
  /** Manual-mode longitude (WGS84). */
  longitude?: number
  /** Display name override for the location (used in manual mode). */
  cityName?: string
  /** Temperature unit. */
  units: 'celsius' | 'fahrenheit'
  /** Auto-refresh interval in minutes. */
  refreshMinutes: number
  /** Whether severe-weather browser notifications are enabled. */
  alertsEnabled: boolean
  /** Cached auto-resolved location (set by the plugin, not user-editable). */
  autoLatitude?: number
  /** Cached auto-resolved location (set by the plugin, not user-editable). */
  autoLongitude?: number
  /** Cached auto-resolved display name (set by the plugin, not user-editable). */
  autoCityName?: string
  /** Cached auto-resolved source (`gps`/`ip`), so the badge stays truthful. */
  autoSource?: 'gps' | 'ip'
}

/**
 * Fallback configuration matching the Host schema defaults, used until the
 * settings namespace resolves so the bar never vanishes on first paint.
 * Keep in sync with `WeatherConfigSchema` defaults in src/index.ts.
 */
export const DEFAULT_WEATHER_CONFIG: WeatherConfig = {
  enabled: true,
  locationMode: 'auto',
  units: 'celsius',
  refreshMinutes: 15,
  alertsEnabled: false,
}

/**
 * Single source for the auto-refresh range. The Host schema bounds, the
 * settings slider and the runtime clamp all derive from these — keep every
 * consumer on these constants instead of re-spelling 5/120/1440 literals.
 */
export const REFRESH_RANGE = { min: 5, max: 120, step: 5 } as const

/** Coordinate bounds matching the Host schema (WGS84). */
export const LAT_RANGE = { min: -90, max: 90 } as const
export const LON_RANGE = { min: -180, max: 180 } as const

/**
 * Normalize an arbitrary stored section into a structurally valid
 * {@link WeatherConfig}. Settings documents can be hand-edited or written by an
 * older schema version, so every field is type-checked, ranged and defaulted
 * here — a missing `refreshMinutes` must never surface as `NaN` upstream.
 */
export function sanitizeConfig(input: Partial<WeatherConfig> | null | undefined): WeatherConfig {
  const raw = input ?? {}
  const pickNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined
  const pickString = (value: unknown): string | undefined =>
    typeof value === 'string' && value !== '' ? value : undefined
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

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_WEATHER_CONFIG.enabled,
    locationMode,
    latitude: latitude !== undefined ? clamp(latitude, LAT_RANGE.min, LAT_RANGE.max) : undefined,
    longitude: longitude !== undefined ? clamp(longitude, LON_RANGE.min, LON_RANGE.max) : undefined,
    cityName: pickString(raw.cityName),
    units,
    refreshMinutes: refreshMinutes === undefined
      ? DEFAULT_WEATHER_CONFIG.refreshMinutes
      : clamp(Math.round(refreshMinutes / REFRESH_RANGE.step) * REFRESH_RANGE.step, REFRESH_RANGE.min, REFRESH_RANGE.max),
    alertsEnabled: typeof raw.alertsEnabled === 'boolean' ? raw.alertsEnabled : DEFAULT_WEATHER_CONFIG.alertsEnabled,
    autoLatitude: autoLatitude !== undefined ? clamp(autoLatitude, LAT_RANGE.min, LAT_RANGE.max) : undefined,
    autoLongitude: autoLongitude !== undefined ? clamp(autoLongitude, LON_RANGE.min, LON_RANGE.max) : undefined,
    autoCityName: pickString(raw.autoCityName),
    autoSource,
  }
}
