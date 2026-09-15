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
  ) => Promise<{ ok: true } | { ok: false; error: { message: string } }>
}

/**
 * Build the refused-write probe.
 *
 * `settingsScope`'s transport deliberately swallows a Host refusal: the write
 * promise settles normally and the only signal is a snapshot that did not
 * change, so a caller cannot tell "rejected by the revision fence" from
 * "rejected by the schema" from "the gateway never took it". This probe
 * re-reads the authority and reports what the Host actually says, then attempts
 * the same edit WITHOUT the revision fence. The fence is precisely what makes a
 * refusal opaque (the transport always attaches one), and dropping it is also
 * the one remaining way to land an edit the fenced path keeps losing.
 *
 * `remote` is read lazily through `ctx.get` so a deployment without the
 * settings gateway cannot block plugin activation.
 *
 * @param ctx - the plugin's client context.
 * @returns a probe invoked with the fields/clears of an already-refused write.
 */
function createWriteProbe(ctx: Context): WriteProbe {
  const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))
  return async (fields, clears) => {
    const remote = (ctx as unknown as { get?: (name: string) => { settings?: RemoteSettingsFace } | undefined })
      .get?.('remote')
    const settings = remote?.settings
    if (settings === undefined) return { landed: false, detail: 'remote.settings 不可用' }
    let serverRevision: number | undefined
    let stored = '未知'
    try {
      const described = await settings.describe()
      if (described.ok) {
        const row = (described.value.namespaces ?? []).find((candidate) => candidate.ns === WEATHER_NS)
        serverRevision = row?.revision
        const user = row?.user as Record<string, unknown> | undefined
        stored = fields.map(([field]) => `${field}=${JSON.stringify(user?.[field])}`).join(' ') || '—'
      } else {
        stored = `describe 被拒：${described.error.message}`
      }
    } catch (error) {
      stored = `describe 异常：${message(error)}`
    }
    const ops = [
      ...fields.map(([field, value]) => ({ op: 'set' as const, path: [field], value })),
      ...clears.map((field) => ({ op: 'unset' as const, path: [field] })),
    ]
    const context = `服务端 rev=${serverRevision ?? '?'} 服务端已存 ${stored}`
    try {
      const response = await settings.mutate(WEATHER_NS, ops, undefined)
      return response.ok
        ? { landed: true, detail: context }
        : { landed: false, detail: `Host 拒绝（无栅栏）：${response.error.message}｜${context}` }
    } catch (error) {
      return { landed: false, detail: `mutate 异常：${message(error)}｜${context}` }
    }
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
