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
  DEFAULT_WEATHER_CONFIG,
} from './config-shared'

/**
 * Settings schema for the `dsh-weather` namespace. It must accept anything an earlier version stored:
 * a registration-time schema failure kills the inject fiber and orphans the stored config, and the Host
 * refuses all further writes for that namespace. schemastery REJECTS out-of-range values rather than
 * clamping them, so every bound here is a way for a legacy or hand-edited document to brick the plugin.
 * Bounds and defaults therefore live in `config-shared.ts` only (LAT_RANGE / LON_RANGE / REFRESH_RANGE;
 * `sanitizeConfig` clamps, rounds and falls back on what it reads); this schema checks the SHAPE only.
 *
 * Every field is `.volatile()`: the Host settings provider only projects (and only accepts writes for) volatile
 * fields, and a volatile-only config change is hot-committed into the running fiber instead of forcing a restart.
 */
export const WeatherConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.enabled).volatile(),
  locationMode: z.union([z.const('auto'), z.const('manual')]).default(DEFAULT_WEATHER_CONFIG.locationMode).volatile(),
  latitude: z.number().required(false).volatile(),
  longitude: z.number().required(false).volatile(),
  // No length bound: a legacy unbounded name must not abort registration.
  cityName: z.string().required(false).volatile(),
  // No count bound: `sanitizeSavedLocations` caps at MAX_SAVED_LOCATIONS on read.
  savedLocations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
  })).default([]).volatile(),
  activeSavedId: z.string().required(false).volatile(),
  units: z.union([z.const('celsius'), z.const('fahrenheit')]).default(DEFAULT_WEATHER_CONFIG.units).volatile(),
  // No `.step()`/`.min()`/`.max()`: a stored 7.5 or 0 must not be rejected at registration.
  refreshMinutes: z.number().default(DEFAULT_WEATHER_CONFIG.refreshMinutes).volatile(),
  alertsEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.alertsEnabled).volatile(),
  briefEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.briefEnabled).volatile(),
  // No `.pattern()`: a stored `9:30` (no leading zero) must not abort registration;
  // `parseClockTime` in sanitizeConfig falls back to the default instead.
  briefMorning: z.string().default(BRIEF_TIMES.morning).volatile(),
  briefEvening: z.string().default(BRIEF_TIMES.evening).volatile(),
  // Internal auto-location cache (written by the browser half, kept out of the
  // settings UI so the resolved location stays stable across refreshes).
  autoLatitude: z.number().required(false).volatile(),
  autoLongitude: z.number().required(false).volatile(),
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
