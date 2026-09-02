/**
 * dsh-weather — browser half.
 *
 * Registers the top-center weather bar into `shell.overlay` (declared by
 * ui-layout). Configuration lives inside the bar's popover (设置 view), so no
 * settings-section entry is registered — the settings nav glyphs are owned by
 * the shell and unknown sections would render the generic gear.
 *
 * Services required by cordis: `slots` (ui-slots) and `settingsScope`
 * (ui-settings). The module-table row for `@deepseek-ai/dsh-client-ui-settings`
 * is requested through `dsh.client.inject` in package.json.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only SlotMap merge: the `shell.overlay` key must exist on the shared
// `SlotMap` for the register call to type-check.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { WEATHER_NS, type WeatherConfig } from '../config-shared'
import { WeatherBar } from './WeatherBar'
import { ensureWeatherStyles } from './styles'

/** Cordis service injection for the client plugin fiber. */
export const inject = ['slots', 'settingsScope']

/** Client plugin entry: bind the settings scope once and mount the weather bar. */
export function apply(ctx: Context): void {
  ensureWeatherStyles()
  const scope = ctx.settingsScope.bind<WeatherConfig>({
    namespace: WEATHER_NS,
    decode: (section) => section as WeatherConfig | undefined,
  })

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-weather',
    order: 60,
    inject: () => ({ scope }),
  }, WeatherBar))
}
