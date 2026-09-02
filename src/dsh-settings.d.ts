/**
 * Local type shim for the runtime `ctx.settings` service.
 *
 * The dsh-settings package the loader resolves for host plugins lives at the
 * profile anchor (`profiles/node_modules/@deepseek-ai/dsh-settings`,
 * 0.1.2-alpha.3) and exposes `SettingsProvider.installSection(...)`. That
 * published version's npm tree has unsatisfiable dependency ranges, so this
 * package does NOT depend on `@deepseek-ai/dsh-settings`; the shape below is
 * the minimal subset the weather plugin uses, verified against that runtime.
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
