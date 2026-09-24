/**
 * dsh-weather — browser half, a lazy-CJS factory (`window.__ModuleLoader__.load`) exporting `apply` / `inject`. It injects the weather chip into `conversation.session.header.actions` (ui-conversation) and the settings page into `settings.section` (ui-settings); both ride `ctx.slots.inject`, and the slot names plus the `slots` / `settingsScope` services are fixed.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only SlotMap merge: the register calls below need these keys on the shared `SlotMap`.
// ui-conversation is present at runtime but not a compile-time dep, so `slotmap.d.ts` declares the seat.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { sanitizeConfig, WEATHER_NS, type WeatherConfig } from '../config-shared'
import { WeatherBar } from './ui/WeatherBar'
import { WeatherSettingsSection, type WriteProbe } from './settings/WeatherSettings'
import { ensureWeatherStyles } from './ui/styles'

/**
 * Cordis service injection for the client fiber. `remote` is declared, not merely looked up: the fallback
 * write must call `remote.settings` from this plugin's own fiber, so it belongs in the inject list.
 * `settingsScope` cannot exist without `remote`, so declaring it cannot deadlock activation.
 */
export const inject = ['slots', 'settingsScope', 'remote']

/** Minimal `ctx.remote.settings` surface used by the refused-write probe. */
interface RemoteSettingsFace {
  describe: () => Promise<
    | { ok: true; value: { namespaces?: Array<{ ns: string; revision?: number; user?: unknown }> } }
    | { ok: false; error: { message: string } }
  >
  mutate: (
    ns: string,
    ops: Array<{ op: 'set' | 'unset'; path: string[]; value?: unknown }>,
    expectedRevision?: number,
  ) => Promise<
    | { ok: true; value: { revision?: number; value?: unknown } }
    | { ok: false; error: { message: string } }
  >
}

/**
 * Build the refused-write probe. The scoped transport settles a refused write like an accepted one, so a
 * caller cannot tell a stale revision fence from a schema refusal or a gateway miss; this replays the edit
 * through `remote.settings` with no fence and returns the authority's own value. Reached only after a
 * verified write failed twice. `remote` is read lazily via `ctx.get` so a missing gateway cannot block activation.
 */
function createWriteProbe(ctx: Context): WriteProbe {
  const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))
  return async (fields, clears) => {
    // Read `remote` through the property with a `get` fallback so a naming mismatch surfaces
    // as this probe's diagnostic instead of an activation failure.
    const remote = (ctx as unknown as {
      remote?: { settings?: RemoteSettingsFace }
      get?: (name: string) => { settings?: RemoteSettingsFace } | undefined
    })
    const settings = remote.remote?.settings ?? remote.get?.('remote')?.settings
    if (settings === undefined) return { ok: false, detail: 'remote.settings 不可用' }
    const ops = [
      ...fields.map(([field, value]) => ({ op: 'set' as const, path: [field], value })),
      ...clears.map((field) => ({ op: 'unset' as const, path: [field] })),
    ]

    /**
     * Re-read the authority's current revision and send exactly that back. The scoped transport carries the
     * revision it last read, which goes stale when the namespace re-registers (a `dsh web` restart resets it
     * to 0), so a fenced write keeps failing. The third argument is always passed: a generated Remote method
     * enforces arity before the wire and throws on a two-argument call, while `undefined` drops the fence.
     */
    let revision: number | undefined
    try {
      const described = await settings.describe()
      if (described.ok) {
        revision = (described.value.namespaces ?? []).find((row) => row.ns === WEATHER_NS)?.revision
      }
    } catch {
      revision = undefined
    }

    let response: Awaited<ReturnType<RemoteSettingsFace['mutate']>>
    try {
      response = await settings.mutate(WEATHER_NS, ops, revision)
    } catch (error) {
      return { ok: false, detail: `mutate 异常：${message(error)}` }
    }
    if (response.ok) return { ok: true, value: response.value.value }
    return { ok: false, detail: `Host 拒绝：${response.error.message}｜服务端 rev=${revision ?? '?'}` }
  }
}

/** Client plugin entry: bind the settings scope once and mount both surfaces. */
export function apply(ctx: Context): void {
  ensureWeatherStyles()
  const scope = ctx.settingsScope.bind<WeatherConfig>({
    namespace: WEATHER_NS,
    // Stored sections may be hand-edited or written by an older schema, so normalize every
    // snapshot — a missing field (e.g. `refreshMinutes`) must never surface as NaN upstream.
    decode: (section) => sanitizeConfig(section as Partial<WeatherConfig> | undefined),
  })
  const probe = createWriteProbe(ctx)

  // Seat orders are relative within each slot: the chip (30) sits among the header actions,
  // the settings section (90) below the more commonly used ones.
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
