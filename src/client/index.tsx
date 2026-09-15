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

/**
 * Cordis service injection for the client plugin fiber.
 *
 * `remote` is declared rather than merely looked up: the fallback write has to
 * call `remote.settings` from THIS plugin's own fiber, and the settings
 * transport keeps its provider context precisely because a consumer reaching
 * the namespace needs it in its own inject list. `settingsScope` cannot exist
 * without `remote` (its mirror subscribes to the settings event stream), so
 * declaring it cannot deadlock activation.
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
    // `remote` is injected, but read through the property with a `get` fallback
    // so a naming mismatch surfaces as this probe's own diagnostic instead of an
    // activation failure.
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
     * Read the authority's CURRENT revision and send exactly that back.
     *
     * The Host refuses a write whose `expectedRevision` differs from its own
     * `registration.revision`, and the value the scoped transport carries is the
     * one it last read — which is exactly what goes stale when the namespace
     * re-registers (a `dsh web` restart resets the counter to 0) while the page
     * keeps its number. Re-reading here and echoing the authority's own revision
     * makes that mismatch impossible.
     *
     * The third parameter is passed UNCONDITIONALLY, and that is load-bearing:
     * a generated Remote method enforces its declared arity before anything
     * crosses the wire, so a two-argument call never reaches the Host — it throws
     * `client api: settings/mutate expected 3 argument(s), got 2` right here, and
     * this fallback would be dead exactly when it is needed.
     *
     * Passing `undefined` is not the same as refusing to write: `expectedRevision`
     * is declared optional, and the transport drops undefined arguments from the
     * wire args object, so the Host sees no expected revision at all and applies
     * the edit unconditionally. That is precisely what this fallback promises,
     * and it still works when `describe` itself is what is broken.
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
