/**
 * dsh-weather — Host half. Registers the `weather` settings namespace on the
 * Host settings provider so the browser half can persist and observe config
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
  MAX_SAVED_LOCATIONS,
  REFRESH_RANGE,
  WEATHER_NS,
  type WeatherConfig,
} from './config-shared'
// Local shim for the runtime `ctx.settings` service (see dsh-settings.d.ts).
import type {} from './dsh-settings'

/**
 * Settings schema for the `weather` namespace. Bounds come from config-shared constants so Host validation,
 * the client fallback, the sanitizer and the settings UI cannot drift. It must also accept anything an earlier
 * version stored — a registration-time schema failure kills the inject fiber and orphans the stored config —
 * so coordinates stay unbounded, text carries no `.max()`, `refreshMinutes` only `.step(1)`, and `sanitizeConfig` bounds it.
 */
export const WeatherConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.enabled),
  locationMode: z.union([z.const('auto'), z.const('manual')]).default(DEFAULT_WEATHER_CONFIG.locationMode),
  latitude: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).required(false),
  longitude: z.number().min(LON_RANGE.min).max(LON_RANGE.max).required(false),
  // No length bound: a legacy unbounded name must not abort registration.
  cityName: z.string().required(false),
  savedLocations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
  })).max(MAX_SAVED_LOCATIONS).default([]),
  activeSavedId: z.string().required(false),
  units: z.union([z.const('celsius'), z.const('fahrenheit')]).default(DEFAULT_WEATHER_CONFIG.units),
  refreshMinutes: z.number()
    .step(1)
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
  autoCityName: z.string().required(false),
  autoSource: z.union([z.const('gps'), z.const('ip')]).required(false),
})

/** Error → one-line text for the log. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Cordis plugin entry. The loader mounts this bundle from the profile's `dsh.profile.bundles` layer stack
 * (inserted by `cordis.patch.yml`). Registration is feature-detected across the two registrar shapes in this
 * plugin's supported range: current `provider.installSection(owner, ns, schema, entry, hooks)`, older 0.1.x a
 * module-level `installSettingsSection`. Calling only the newer one throws inside `ctx.inject` and registers nothing.
 */
export function apply(ctx: Context, config: WeatherConfig): void {
  // The registration rides the settings provider's scope: our composition entry becomes the
  // namespace's base layer. Everything derived from the section lives in the browser half.
  ctx.inject(['settings'], (settingsCtx) => {
    // Change-driven behaviour lives in the browser half; these no-op hooks exist because
    // installSection requires them, not because the Host has anything to re-judge.
    const hooks = {
      setSource: () => {},
      onChange: () => {},
    }
    const provider = settingsCtx.settings as unknown as {
      installSection?: (owner: Context, ns: string, schema: unknown, entry: WeatherConfig, hooks: object) => void
    }
    if (typeof provider?.installSection === 'function') {
      try {
        provider.installSection(ctx, WEATHER_NS, WeatherConfigSchema, config, hooks)
      } catch (error) {
        // A registration-time schema failure would kill the inject fiber; contain it so the plugin
        // still loads read-only — logged, not swallowed, or the failure is undiagnosable.
        ctx.logger?.warn?.('dsh-weather: 天气设置命名空间注册失败，本次以只读模式运行：%s', errorText(error))
      }
      return
    }
    // Older provider: the registrar is a module-level export, imported lazily so a Host
    // that dropped it (or never shipped it) cannot break activation.
    void import('@deepseek-ai/dsh-settings')
      .then((mod) => {
        const legacy = (mod as unknown as {
          installSettingsSection?: (owner: Context, ns: string, schema: unknown, entry: WeatherConfig, hooks: object) => void
        }).installSettingsSection
        if (typeof legacy !== 'function') {
          throw new Error('dsh-settings 既不支持 installSection 也不支持 installSettingsSection')
        }
        legacy(ctx, WEATHER_NS, WeatherConfigSchema, config, hooks)
      })
      .catch((error: unknown) => {
        // Neither registrar exists on this Host: settings are unavailable (the client half falls
        // back to in-memory defaults and the page reads read-only). Worth logging to tell it apart.
        ctx.logger?.warn?.('dsh-weather: 该 Host 无可用的设置注册接口，设置页为只读：%s', errorText(error))
      })
  })
}
