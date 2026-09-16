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
 * The schema must ACCEPT EVERYTHING A PREVIOUS VERSION OF THIS PLUGIN COULD HAVE
 * STORED. The provider resolves the stored section *during registration* and
 * rethrows a schema failure, which kills the inject fiber: the namespace is never
 * registered, the client's `sanitizeConfig` decode never runs, and the user's
 * entire configuration is orphaned (defaults shown, every write refused with
 * "namespace is not registered") — a far worse outcome than tolerating a stale
 * value. So:
 *   - array-entry coordinates are unbounded (a single bad entry would otherwise
 *     reject the whole section),
 *   - text fields carry no `.max()`: older versions stored `cityName` /
 *     `autoCityName` unbounded, and `sanitizeConfig` (which caps by the same
 *     measure the schema would) is the enforcement point on read and write,
 *   - `refreshMinutes` uses `.step(1)`: the stored value only has to be a sane
 *     number, and `sanitizeConfig` snaps it to the `REFRESH_RANGE.step` grid.
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
 * Cordis plugin entry. The loader mounts this bundle from the profile's
 * `dsh.profile.bundles` layer stack (inserted by `cordis.patch.yml`).
 *
 * The registration call is feature-detected across the two shapes dsh-settings
 * has shipped inside this plugin's supported range:
 *   - current: `provider.installSection(owner, ns, schema, entry, hooks)`
 *   - older 0.1.x: a module-level `installSettingsSection(...)` (the provider has
 *     no such method; its typings expose only register/describe/get/update/
 *     replace/mutate).
 * Calling only the newer one throws `installSection is not a function` on an
 * older Host — inside `ctx.inject`, so the namespace silently never registers
 * and every setting degrades to process memory.
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
        // The provider resolves the stored section while registering and rethrows
        // a failure. Letting that escape kills the inject fiber (and with it the
        // plugin), so contain it: the namespace stays unavailable, but the rest of
        // the plugin still loads and the settings page reports read-only.
        // Logged, not swallowed — read-only settings with an empty log is
        // undiagnosable from the outside.
        ctx.logger?.warn?.('dsh-weather: 天气设置命名空间注册失败，本次以只读模式运行：%s', errorText(error))
      }
      return
    }
    // Older provider: the registrar is a module-level export. Imported lazily so
    // a Host that has already dropped it (or never shipped it) cannot break the
    // plugin's activation.
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
        // Neither shape exists on this Host: the plugin still loads, the
        // settings namespace is simply unavailable (the client half then falls
        // back to its in-memory defaults and the settings page reports read-only).
        // Diagnosis matters here: this is the path taken when the Host is older
        // (or newer) than either registrar this plugin knows.
        ctx.logger?.warn?.('dsh-weather: 该 Host 无可用的设置注册接口，设置页为只读：%s', errorText(error))
      })
  })
}
