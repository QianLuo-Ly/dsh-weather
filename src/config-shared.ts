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
  /** Whether the top-center weather bar is visible. */
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
}
