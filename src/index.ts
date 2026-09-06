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
import { DEFAULT_WEATHER_CONFIG, LAT_RANGE, LON_RANGE, REFRESH_RANGE, WEATHER_NS, type WeatherConfig } from './config-shared'
// Local shim for the runtime `ctx.settings` service (see dsh-settings.d.ts).
import type {} from './dsh-settings'

/**
 * Settings schema for the `weather` namespace. Field bounds derive from
 * config-shared constants (REFRESH_RANGE / LAT_RANGE / LON_RANGE) so the Host
 * validation, the client fallback and the settings slider can never drift.
 */
export const WeatherConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.enabled),
  locationMode: z.union([z.const('auto'), z.const('manual')]).default(DEFAULT_WEATHER_CONFIG.locationMode),
  latitude: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).required(false),
  longitude: z.number().min(LON_RANGE.min).max(LON_RANGE.max).required(false),
  cityName: z.string().required(false),
  units: z.union([z.const('celsius'), z.const('fahrenheit')]).default(DEFAULT_WEATHER_CONFIG.units),
  refreshMinutes: z.number()
    .step(REFRESH_RANGE.step)
    .min(REFRESH_RANGE.min)
    .max(REFRESH_RANGE.max)
    .default(DEFAULT_WEATHER_CONFIG.refreshMinutes),
  alertsEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.alertsEnabled),
  // Internal auto-location cache (written by the browser half, kept out of the
  // settings UI so the resolved location stays stable across refreshes).
  autoLatitude: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).required(false),
  autoLongitude: z.number().min(LON_RANGE.min).max(LON_RANGE.max).required(false),
  autoCityName: z.string().required(false),
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
