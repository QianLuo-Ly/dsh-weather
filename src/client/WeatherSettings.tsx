/**
 * Weather configuration page, registered into `settings.section`. Owns the
 * durable settings: visibility, location mode (auto / manual with city search),
 * saved cities, temperature unit, refresh interval and the daily-brief times.
 *
 * The page itself holds the two things every block needs — the resolved config
 * and the write discipline below — and composes one module per block:
 * `settings-toggles`, `settings-brief`, `settings-location` (which in turn uses
 * `settings-city-search` and `settings-saved-cities`), `settings-units`,
 * `settings-diagnostics`. Shared controls live in `settings-shared`.
 *
 * Write discipline:
 * - Text/number/range inputs keep a local draft and commit on blur / Enter /
 *   pointer-up, so typing never fires a settings RPC per keystroke (and a
 *   length-capped field cannot "eat" further keystrokes).
 * - Every write is verified by reading the snapshot back: the transport
 *   resolves even when the Host rejects a value, so success is never assumed.
 * - Any edit that makes the displayed location stop being a saved city clears
 *   `activeSavedId`, so the chip/list highlight can never point at another city.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_WEATHER_CONFIG, sameConfig, sanitizeConfig, type WeatherConfig } from '../config-shared'
import { useSavedLocations, writeVerified, type NoticeKind } from './hooks'
import { BriefSection } from './settings-brief'
import { DiagnosticsSection } from './settings-diagnostics'
import { LocationSection } from './settings-location'
import { TogglesSection } from './settings-toggles'
import { UnitsSection } from './settings-units'
import { DANGER, FG, MUTED, OK, useNotificationPermission, type FieldWriter, type Notify } from './settings-shared'

/**
 * Replay an already-refused write on the unfenced path and return what the
 * authority actually holds. Supplied by the plugin entry (it needs the remote
 * service, which this view does not).
 */
export interface WriteProbe {
  (fields: Array<[string, unknown]>, clears: string[]): Promise<
    { ok: true; value: unknown } | { ok: false; detail: string }
  >
}

export interface WeatherSettingsSectionProps {
  scope: SettingsScope<WeatherConfig>
  probe: WriteProbe
}

/** The page's single notice line, rendered once below every section. */
interface Notice { text: string; kind: NoticeKind }

export function WeatherSettingsSection(props: WeatherSettingsSectionProps): ReactElement {
  const { scope, probe } = props
  const [config, setConfig] = useState<WeatherConfig | undefined>(() => sanitizeConfig(scope.getSnapshot().value))
  const [notice, setNotice] = useState<Notice | null>(null)
  const { permission, request: requestNotificationPermission } = useNotificationPermission()

  const effective = config ?? DEFAULT_WEATHER_CONFIG
  const snapshot = scope.getSnapshot()

  const notify: Notify = useCallback((text, kind = 'ok'): void => {
    setNotice({ text, kind })
  }, [])

  useEffect(() => {
    const sync = (): void => {
      const next = sanitizeConfig(scope.getSnapshot().value)
      setConfig((prev) => (sameConfig(prev, next) ? prev : next))
    }
    sync()
    return scope.subscribe(sync)
  }, [scope])

  /**
   * Issue one or more settings writes and verify the resulting snapshot — a
   * Host refusal must surface as a notice, never as a silent no-op.
   *
   * `writeVerified` re-issues the batch once before reporting. When even that
   * fails the refusal is not routine, and the transport has thrown away the
   * reason (its contract settles a refused write like an accepted one), so the
   * batch is replayed through `probe`: it writes on the unfenced path and
   * returns the authority's own value.
   *
   * Rendering that returned value is the point of the fallback, not a detail.
   * The scoped transport keeps a namespace's revision in step by folding each
   * write answer into a shared mirror, and that mirror deliberately keeps its
   * held view when a refresh fails (`settings-mirror.ts`: "the held view keeps
   * serving"). A client whose revision no longer matches the Host's — the Host
   * resets `registration.revision` to 0 whenever the plugin re-registers, e.g.
   * on a `dsh web` restart — therefore keeps failing the fence, and its
   * subscription never delivers the value it just stored. Reading the value
   * back from the write answer is what makes the panel show the truth in that
   * state instead of snapping back.
   *
   * @returns whether the authority now holds the requested state — a caller
   *   with an optimistic draft uses this to keep or retract it.
   */
  const commit: FieldWriter = useCallback((fields, clears = []) => {
    if (!scope.getSnapshot().writable) {
      notify('当前连接不支持修改设置（只读）', 'err')
      return Promise.resolve(false)
    }
    const rawFields = fields.map(([field, value]) => [field as string, value] as [string, unknown])
    const rawClears = clears.map((field) => field as string)
    return writeVerified(scope, rawFields, rawClears).then((accepted) => {
      if (accepted) return true
      return probe(rawFields, rawClears).then((result) => {
        if (result.ok) {
          setConfig(sanitizeConfig(result.value as Partial<WeatherConfig> | undefined))
          notify('已保存（原写入被服务端的版本栅栏拒绝，已改用无栅栏写入）', 'ok')
          return true
        }
        notify(`该设置未被保存：${result.detail}｜客户端 rev=${scope.getSnapshot().revision ?? '?'}`, 'err')
        return false
      })
    })
  }, [scope, notify, probe])

  const set = useCallback((field: keyof WeatherConfig, value: unknown): void => {
    void commit([[field, value]])
  }, [commit])

  // Saved-city management lives in the shared hook (same code path as the chip),
  // with feedback routed into this page's notice line.
  const savedCities = useSavedLocations({ scope, effective, onNotice: notify })

  return (
    <div style={{ maxWidth: 560, padding: '4px 0 20px', color: FG }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>天气</div>
      <div style={{ color: MUTED, fontSize: 12.5, marginBottom: 16 }}>
        会话顶部操作行的天气 chip（数据来源：Open-Meteo，无需 API key）。
      </div>

      <TogglesSection
        effective={effective}
        set={set}
        permission={permission}
        onRequestPermission={requestNotificationPermission}
      />
      <BriefSection
        effective={effective}
        set={set}
        commit={commit}
        notify={notify}
        permission={permission}
        onRequestPermission={requestNotificationPermission}
      />
      <LocationSection
        effective={effective}
        commit={commit}
        notify={notify}
        setNotice={setNotice}
        savedCities={savedCities}
      />
      <UnitsSection effective={effective} set={set} />

      {notice !== null && (
        <div
          role="status"
          aria-live="polite"
          style={{ color: notice.kind === 'err' ? DANGER : OK, fontSize: 12.5, marginTop: 8 }}
        >
          {notice.text}
        </div>
      )}
      {snapshot.mode === 'memory' && (
        <div style={{ color: MUTED, fontSize: 12.5, marginTop: 8 }}>
          当前连接为进程内模式，配置仅在本次会话生效。
        </div>
      )}

      <DiagnosticsSection effective={effective} notify={notify} />
    </div>
  )
}
