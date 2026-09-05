/**
 * dsh-weather — browser half.
 *
 * Registers a compact weather chip into `conversation.session.header.actions`
 * (declared by ui-conversation) — an app-layout seat inside the session
 * header, so the chip never floats over or collides with other plugins'
 * overlay controls — and the configuration page into `settings.section`
 * (declared by ui-settings), which appears under the Settings panel
 * (bottom-left gear). Both registrations ride `ctx.slots.inject`, so they
 * wait for the declarations to mount and unwind when this plugin unloads.
 *
 * Services required by cordis: `slots` (ui-slots) and `settingsScope`
 * (ui-settings). The module-table row for `@deepseek-ai/dsh-client-ui-settings`
 * is requested through `dsh.client.inject` in package.json.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only SlotMap merges: the slot keys below must exist on the shared
// `SlotMap` for the register calls to type-check. ui-conversation is a core
// seat of the running shell but not a compile-time dependency here, so the
// seat key is declared locally in `slotmap.d.ts` (same augmentation pattern
// the core packages use).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { WEATHER_NS, type WeatherConfig } from '../config-shared'
import { WeatherBar } from './WeatherBar'
import { WeatherSettingsSection } from './WeatherSettings'
import { ensureWeatherStyles } from './styles'

/** Cordis service injection for the client plugin fiber. */
export const inject = ['slots', 'settingsScope']

/** Client plugin entry: bind the settings scope once and mount both surfaces. */
export function apply(ctx: Context): void {
  ensureWeatherStyles()
  const scope = ctx.settingsScope.bind<WeatherConfig>({
    namespace: WEATHER_NS,
    decode: (section) => section as WeatherConfig | undefined,
  })

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'weather',
    order: 30,
    inject: () => ({ scope }),
  }, WeatherBar))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'weather',
    order: 90,
    label: '天气',
    inject: () => ({ scope }),
  }, WeatherSettingsSection))
}
