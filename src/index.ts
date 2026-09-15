/**
 * dsh-weather — Host half.
 *
 * Registers the `weather` settings namespace through the Host settings
 * provider, so the browser half can persist and observe configuration
 * (visibility, location mode, manual coordinates, units, refresh interval)
 * through `ctx.settingsScope`. Everything else is a browser-half concern.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  BRIEF_TIMES,
  CLOCK_TIME_PATTERN,
  DEFAULT_WEATHER_CONFIG,
  LAT_RANGE,
  LON_RANGE,
  MAX_ID_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SAVED_LOCATIONS,
  REFRESH_RANGE,
  WEATHER_NS,
  type WeatherConfig,
} from './config-shared'
// Local shim for the runtime `ctx.settings` service (see dsh-settings.d.ts).
import type {} from './dsh-settings'

/**
 * Settings schema for the `weather` namespace. Every bound derives from a
 * config-shared constant (REFRESH_RANGE / LAT_RANGE / LON_RANGE / MAX_* /
 * BRIEF_TIMES / CLOCK_TIME_PATTERN) so the Host validation, the client
 * fallback, the sanitizer and the settings UI can never drift apart.
 *
 * Note: the array entry coordinates are intentionally NOT range-bounded here.
 * A hand-edited document with one bad entry would otherwise reject the whole
 * section (and the plugin registration along with it); the client drops bad
 * entries individually in `sanitizeSavedLocations`.
 */
export const WeatherConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.enabled),
  locationMode: z.union([z.const('auto'), z.const('manual')]).default(DEFAULT_WEATHER_CONFIG.locationMode),
  latitude: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).required(false),
  longitude: z.number().min(LON_RANGE.min).max(LON_RANGE.max).required(false),
  cityName: z.string().max(MAX_NAME_LENGTH).required(false),
  savedLocations: z.array(z.object({
    id: z.string().max(MAX_ID_LENGTH),
    name: z.string().max(MAX_NAME_LENGTH),
    latitude: z.number(),
    longitude: z.number(),
  })).max(MAX_SAVED_LOCATIONS).default([]),
  activeSavedId: z.string().max(MAX_ID_LENGTH).required(false),
  units: z.union([z.const('celsius'), z.const('fahrenheit')]).default(DEFAULT_WEATHER_CONFIG.units),
  refreshMinutes: z.number()
    .step(REFRESH_RANGE.step)
    .min(REFRESH_RANGE.min)
    .max(REFRESH_RANGE.max)
    .default(DEFAULT_WEATHER_CONFIG.refreshMinutes),
  alertsEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.alertsEnabled),
  briefEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.briefEnabled),
  briefMorning: z.string().pattern(CLOCK_TIME_PATTERN).default(BRIEF_TIMES.morning),
  briefEvening: z.string().pattern(CLOCK_TIME_PATTERN).default(BRIEF_TIMES.evening),
  // Internal auto-location cache (written by the browser half, kept out of the
  // settings UI so the resolved location stays stable across refreshes).
  autoLatitude: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).required(false),
  autoLongitude: z.number().min(LON_RANGE.min).max(LON_RANGE.max).required(false),
  autoCityName: z.string().max(MAX_NAME_LENGTH).required(false),
  autoSource: z.union([z.const('gps'), z.const('ip')]).required(false),
})

/** Defaults for callers that want a fresh config object. */
export function defaultConfig(): WeatherConfig {
  return { ...DEFAULT_WEATHER_CONFIG }
}

/**
 * Cordis plugin entry. The loader mounts this bundle from the profile's
 * `dsh.profile.bundles` layer stack (inserted by `cordis.patch.yml`).
 */
export function apply(ctx: Context, config: WeatherConfig): void {
  // The registration rides the settings provider's scope: while the service is
  // present, our composition entry is the namespace's base layer. The browser
  // half owns everything derived from the section; a committed change needs no
  // re-registration here.
  ctx.inject(['settings'], (settingsCtx) => {
    // All change-driven behaviour lives in the browser half (it observes the
    // namespace through its settingsScope); the Host has nothing to re-judge on
    // attach/detach/change, hence the no-op hooks — they are part of the
    // dsh-settings installSection contract, not dead configuration.
    settingsCtx.settings.installSection(ctx, WEATHER_NS, WeatherConfigSchema, config, {
      setSource: () => {},
      onChange: () => {},
    })
  })
}
