/**
 * dsh-weather — Host half. Since Host 0.1.7 the settings model is "the plugin's
 * cordis `Config` schema IS its settings form": the Host projects this entry's
 * Config into a settings namespace keyed by the profile row id (`dsh-weather`,
 * see `cordis.patch.yml` / `WEATHER_NS`), serves it over `remote.settings`, and
 * accepts browser writes for fields marked `.volatile()` — writing them into
 * the profile patch and hot-committing them into the running fiber. There is
 * nothing else to register server-side; everything else is a browser concern.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  BRIEF_TIMES,
  CLOCK_TIME_PATTERN,
  DEFAULT_WEATHER_CONFIG,
  LAT_RANGE,
  LON_RANGE,
  MAX_SAVED_LOCATIONS,
  REFRESH_RANGE,
} from './config-shared'

/**
 * Settings schema for the `dsh-weather` namespace. Bounds come from config-shared constants so Host validation,
 * the client fallback, the sanitizer and the settings UI cannot drift. It must also accept anything an earlier
 * version stored — a registration-time schema failure kills the inject fiber and orphans the stored config —
 * so coordinates stay unbounded, text carries no `.max()`, `refreshMinutes` only `.step(1)`, and `sanitizeConfig` bounds it.
 *
 * Every field is `.volatile()`: the Host settings provider only projects (and only accepts writes for) volatile
 * fields, and a volatile-only config change is hot-committed into the running fiber instead of forcing a restart.
 */
export const WeatherConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.enabled).volatile(),
  locationMode: z.union([z.const('auto'), z.const('manual')]).default(DEFAULT_WEATHER_CONFIG.locationMode).volatile(),
  latitude: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).required(false).volatile(),
  longitude: z.number().min(LON_RANGE.min).max(LON_RANGE.max).required(false).volatile(),
  // No length bound: a legacy unbounded name must not abort registration.
  cityName: z.string().required(false).volatile(),
  savedLocations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
  })).max(MAX_SAVED_LOCATIONS).default([]).volatile(),
  activeSavedId: z.string().required(false).volatile(),
  units: z.union([z.const('celsius'), z.const('fahrenheit')]).default(DEFAULT_WEATHER_CONFIG.units).volatile(),
  refreshMinutes: z.number()
    .step(1)
    .min(REFRESH_RANGE.min)
    .max(REFRESH_RANGE.max)
    .default(DEFAULT_WEATHER_CONFIG.refreshMinutes)
    .volatile(),
  alertsEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.alertsEnabled).volatile(),
  briefEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.briefEnabled).volatile(),
  briefMorning: z.string().pattern(CLOCK_TIME_PATTERN).default(BRIEF_TIMES.morning).volatile(),
  briefEvening: z.string().pattern(CLOCK_TIME_PATTERN).default(BRIEF_TIMES.evening).volatile(),
  // Internal auto-location cache (written by the browser half, kept out of the
  // settings UI so the resolved location stays stable across refreshes).
  autoLatitude: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).required(false).volatile(),
  autoLongitude: z.number().min(LON_RANGE.min).max(LON_RANGE.max).required(false).volatile(),
  autoCityName: z.string().required(false).volatile(),
  autoSource: z.union([z.const('gps'), z.const('ip')]).required(false).volatile(),
})

/**
 * The plugin's cordis Config, declared at module top level so the loader
 * (`runtime.Config`) resolves profile overrides with it and the Host settings
 * provider projects this entry into the settings UI.
 */
export const Config = WeatherConfigSchema

/**
 * Cordis plugin entry. The loader mounts this bundle from the profile's `dsh.profile.bundles` layer stack
 * (inserted by `cordis.patch.yml`). Config arrives already resolved against {@link Config}; the Host settings
 * provider derives the namespace from the entry itself, so activation has nothing settings-related left to do.
 */
export function apply(ctx: Context): void {
  // Settings registration is declarative now (Config above). A failure to
  // project the form is Host-side and diagnosable there; nothing to contain.
  ctx.logger?.debug?.('dsh-weather: host half active (settings form projected from Config)')
}
