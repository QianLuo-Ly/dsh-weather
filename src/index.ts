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
import { WEATHER_NS, type WeatherConfig } from './config-shared'
// Local shim for the runtime `ctx.settings` service (see dsh-settings.d.ts).
import type {} from './dsh-settings'

/** The composition entry this bundle ships as the namespace base. */
const BASE: WeatherConfig = {
  enabled: true,
  locationMode: 'auto',
  units: 'celsius',
  refreshMinutes: 15,
  alertsEnabled: false,
}

/** Settings schema for the `weather` namespace. */
export const WeatherConfigSchema = z.object({
  enabled: z.boolean().default(BASE.enabled),
  locationMode: z.union([z.const('auto'), z.const('manual')]).default(BASE.locationMode),
  latitude: z.number().min(-90).max(90).required(false),
  longitude: z.number().min(-180).max(180).required(false),
  cityName: z.string().required(false),
  units: z.union([z.const('celsius'), z.const('fahrenheit')]).default(BASE.units),
  refreshMinutes: z.number().step(1).min(5).max(1440).default(BASE.refreshMinutes),
  alertsEnabled: z.boolean().default(BASE.alertsEnabled),
  // Internal auto-location cache (written by the browser half, kept out of the
  // settings UI so the resolved location stays stable across refreshes).
  autoLatitude: z.number().min(-90).max(90).required(false),
  autoLongitude: z.number().min(-180).max(180).required(false),
  autoCityName: z.string().required(false),
})

/** Defaults for callers that want a fresh config object. */
export function defaultConfig(): WeatherConfig {
  return { ...BASE }
}

/**
 * Cordis plugin entry. The loader mounts this bundle from the profile's
 * `dsh.profile.bundles` layer stack (inserted by `cordis.patch.yml`).
 */
export function apply(ctx: Context, config: WeatherConfig): void {
  let current: () => WeatherConfig = () => config
  // The registration rides the settings provider's scope: while the service is
  // present, our composition entry is the namespace's base layer and `current`
  // tracks the resolved section; losing the provider falls back to the entry
  // so the plugin keeps working exactly as composed.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, WEATHER_NS, WeatherConfigSchema, config, {
      setSource: (source) => {
        current = source
      },
      // The browser half owns everything derived from the section; a committed
      // change needs no re-registration here.
      onChange: () => {},
    })
  })
}
