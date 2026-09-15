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
import { sanitizeConfig, WEATHER_NS, type WeatherConfig } from '../config-shared'
import { WeatherBar } from './WeatherBar'
import { WeatherSettingsSection, type WriteProbe } from './WeatherSettings'
import { ensureWeatherStyles } from './styles'

/** Cordis service injection for the client plugin fiber. */
export const inject = ['slots', 'settingsScope']

/** Minimal `ctx.remote.settings` surface used by the refused-write probe. */
interface RemoteSettingsFace {
  describe: () => Promise<
    | { ok: true; value: { namespaces?: Array<{ ns: string; revision?: number; user?: unknown }> } }
    | { ok: false; error: { message: string } }
  >
  mutate: (
    ns: string,
    ops: Array<{ op: 'set' | 'unset'; path: string[]; value?: unknown }>,
    expectedRevision: number | undefined,
  ) => Promise<
    | { ok: true; value: { revision?: number; value?: unknown } }
    | { ok: false; error: { message: string } }
  >
}

/**
 * Build the refused-write probe.
 *
 * `settingsScope`'s transport deliberately swallows a Host refusal: the write
 * promise settles normally and the only signal is a snapshot that did not
 * change, so a caller cannot tell a stale revision fence from a schema refusal
 * from a gateway miss. The fence is also the part a plugin cannot influence —
 * the transport always attaches the revision it last read — so this probe
 * replays the edit through `remote.settings` directly, with NO fence, and
 * returns the authority's own resolved value from the write answer.
 *
 * Only reached after a verified write has already failed twice, so the normal
 * path never pays for it. `remote` is read lazily through `ctx.get` so a
 * deployment without the settings gateway cannot block plugin activation.
 *
 * @param ctx - the plugin's client context.
 * @returns probe invoked with the fields/clears of an already-refused write.
 */
function createWriteProbe(ctx: Context): WriteProbe {
  const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))
  return async (fields, clears) => {
    const remote = (ctx as unknown as { get?: (name: string) => { settings?: RemoteSettingsFace } | undefined })
      .get?.('remote')
    const settings = remote?.settings
    if (settings === undefined) return { ok: false, detail: 'remote.settings 不可用' }
    const ops = [
      ...fields.map(([field, value]) => ({ op: 'set' as const, path: [field], value })),
      ...clears.map((field) => ({ op: 'unset' as const, path: [field] })),
    ]
    let response: Awaited<ReturnType<RemoteSettingsFace['mutate']>>
    try {
      response = await settings.mutate(WEATHER_NS, ops, undefined)
    } catch (error) {
      return { ok: false, detail: `mutate 异常：${message(error)}` }
    }
    if (response.ok) return { ok: true, value: response.value.value }
    // Refused even without the fence: report the Host's own words plus the
    // state it holds, which is what separates "value rejected" from anything
    // else. Reached only on the failure path, so the extra read is free.
    let detail = `Host 拒绝（无栅栏）：${response.error.message}`
    try {
      const described = await settings.describe()
      if (described.ok) {
        const row = (described.value.namespaces ?? []).find((candidate) => candidate.ns === WEATHER_NS)
        const user = row?.user as Record<string, unknown> | undefined
        const stored = fields.map(([field]) => `${field}=${JSON.stringify(user?.[field])}`).join(' ')
        detail += `｜服务端 rev=${row?.revision ?? '?'} 服务端已存 ${stored === '' ? '—' : stored}`
      } else {
        detail += `｜describe 被拒：${described.error.message}`
      }
    } catch (error) {
      detail += `｜describe 异常：${message(error)}`
    }
    return { ok: false, detail }
  }
}

/** Client plugin entry: bind the settings scope once and mount both surfaces. */
export function apply(ctx: Context): void {
  ensureWeatherStyles()
  const scope = ctx.settingsScope.bind<WeatherConfig>({
    namespace: WEATHER_NS,
    // The stored section can be hand-edited or written by an older schema
    // version — normalize every snapshot to a structurally valid config so a
    // missing field (e.g. `refreshMinutes`) can never surface as NaN upstream.
    decode: (section) => sanitizeConfig(section as Partial<WeatherConfig> | undefined),
  })
  const probe = createWriteProbe(ctx)

  // Seat orders are relative within each slot — see ui-conversation /
  // ui-settings for the other registered entries. Keep these two deliberate:
  // the chip (30) sits among the header actions; the settings section (90)
  // stays below the more commonly used sections.
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
    inject: () => ({ scope, probe }),
  }, WeatherSettingsSection))
}
