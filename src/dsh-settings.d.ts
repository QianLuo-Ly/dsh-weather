/**
 * Local type shim for the runtime `ctx.settings` service. dsh-settings ships two registrar shapes — current `SettingsProvider.installSection(owner, ns, schema, entry, hooks)` (declared below) and older 0.1.1-rc.x module-level `installSettingsSection`, which the provider's typings do not expose — and the peer range must span both. Local types only: the published package's npm tree has unsatisfiable dependency ranges, so this is the minimal subset the plugin uses.
 */
import type { Context } from '@deepseek-ai/cordis'

/** Hooks passed to `settings.installSection` (mirrors dsh-settings' type). */
export interface SettingsSectionHooks<T> {
  /** Receive the authoritative configuration source thunk. */
  setSource(current: () => T): void
  /** Re-judge anything derived from the source after attach/detach/change. */
  onChange(): void
  /** Reject a resolved section this consumer cannot act on. */
  validate?(value: T): void
}

/** Minimal `ctx.settings` service surface used by dsh-weather. */
export interface WeatherSettingsService {
  installSection<const N extends string, T>(
    owner: Context,
    ns: N,
    schema: unknown,
    entry: T,
    hooks: SettingsSectionHooks<T>,
  ): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    settings: WeatherSettingsService
  }
}
