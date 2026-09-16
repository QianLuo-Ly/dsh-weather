/**
 * 每日天气简报 switch and the two `HH:MM` time pickers. Owns the optimistic
 * clock draft, because the draft and the selects that consume it live and die
 * together.
 */
import { useCallback, useEffect, useId, useState, type ReactElement } from 'react'
import { parseClockTime, type WeatherConfig } from '../config-shared'
import { ClockField, DANGER, MUTED, Row, checkbox, type FieldSetter, type FieldWriter, type Notify } from './settings-shared'

/** The two `HH:MM` brief times, in `WeatherConfig` spelling. */
type ClockFieldName = 'briefMorning' | 'briefEvening'

export function BriefSection(props: {
  effective: WeatherConfig
  set: FieldSetter
  commit: FieldWriter
  notify: Notify
  permission: NotificationPermission
  onRequestPermission: () => void
}): ReactElement {
  const { effective, set, commit, notify, permission, onRequestPermission } = props
  const ids = useId()
  /**
   * Optimistic draft for the two brief times. Both selects are controlled by the
   * stored config, so a pick would visibly snap back for a whole write round trip
   * — and stay reverted forever when the write is refused (a stale revision fence
   * the scoped transport cannot refresh). The draft keeps the user's own choice on
   * screen until the snapshot catches up with it.
   */
  const [clockDraft, setClockDraft] = useState<Partial<Record<ClockFieldName, string>>>({})

  /** Retract one clock draft, so the control falls back to the stored value.
   * `expected` guards against dropping a newer pick that already replaced it. */
  const dropClockDraft = useCallback((field: ClockFieldName, expected?: string): void => {
    setClockDraft((prev) => {
      if (prev[field] === undefined || (expected !== undefined && prev[field] !== expected)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  // Retire each clock draft once the stored config has caught up with it (the
  // write landed), keeping only the ones still waiting. Returning the previous
  // object when nothing changed keeps this from re-rendering on every sync.
  useEffect(() => {
    setClockDraft((prev) => {
      const next: Partial<Record<ClockFieldName, string>> = {}
      if (prev.briefMorning !== undefined && prev.briefMorning !== effective.briefMorning) {
        next.briefMorning = prev.briefMorning
      }
      if (prev.briefEvening !== undefined && prev.briefEvening !== effective.briefEvening) {
        next.briefEvening = prev.briefEvening
      }
      return next.briefMorning === prev.briefMorning && next.briefEvening === prev.briefEvening ? prev : next
    })
  }, [effective.briefMorning, effective.briefEvening])

  /** Commit a `<select>`-picked clock time only when it parses to `HH:MM`. The
   * pick is echoed immediately and retracted if the write does not land, so the
   * control never reads as "my choice was ignored". */
  const commitClockTime = (field: ClockFieldName, text: string): void => {
    const parsed = parseClockTime(text)
    if (parsed === undefined) {
      notify('时间格式应为 HH:MM', 'err')
      return
    }
    const other = field === 'briefMorning' ? effective.briefEvening : effective.briefMorning
    if (parsed === other) {
      notify('早上与晚间简报时间不能相同', 'err')
      return
    }
    if (parsed === effective[field]) {
      // Already what is stored: no write — and an earlier pick of this field that
      // is still awaiting its answer must not stay on screen as the current one.
      dropClockDraft(field)
      return
    }
    setClockDraft((prev) => ({ ...prev, [field]: parsed }))
    void commit([[field, parsed]]).then((landed) => {
      // Refused: the stored value is what the control must show again.
      if (!landed) dropClockDraft(field, parsed)
    })
  }

  const permissionHint = permission === 'denied'
    ? '通知权限已被浏览器拒绝，请在站点设置中允许后重新开启。'
    : permission === 'default'
      ? '浏览器通知尚未授权——开启时请允许，否则提醒与简报不会推送。'
      : null

  return (
    <>
      <Row label="每日天气简报" labelFor={`${ids}-brief`}>
        <input
          id={`${ids}-brief`}
          type="checkbox"
          checked={effective.briefEnabled}
          onChange={(event) => {
            set('briefEnabled', event.target.checked)
            if (event.target.checked) onRequestPermission()
          }}
          style={checkbox}
        />
      </Row>
      {effective.briefEnabled && permissionHint !== null && (
        <div style={{ color: permission === 'denied' ? DANGER : MUTED, fontSize: 12, margin: '-2px 0 10px 12px' }}>
          {permissionHint}
        </div>
      )}

      {effective.briefEnabled && (
        <>
          <Row label="早上简报时间">
            <ClockField
              id={`${ids}-brief-morning`}
              label="早上简报时间"
              value={clockDraft.briefMorning ?? effective.briefMorning}
              onCommit={(text) => commitClockTime('briefMorning', text)}
            />
            <span style={{ color: MUTED, fontSize: 12, whiteSpace: 'nowrap' }}>推送今日天气</span>
          </Row>
          <Row label="晚间简报时间">
            <ClockField
              id={`${ids}-brief-evening`}
              label="晚间简报时间"
              value={clockDraft.briefEvening ?? effective.briefEvening}
              onCommit={(text) => commitClockTime('briefEvening', text)}
            />
            <span style={{ color: MUTED, fontSize: 12, whiteSpace: 'nowrap' }}>推送明日天气</span>
          </Row>
        </>
      )}
      <div style={{ color: MUTED, fontSize: 12, margin: '-2px 0 10px 12px' }}>
        到点后通过浏览器通知推送（按本机时间，最多补发 2 小时）：早上＝今日最高/最低与降水概率，晚上＝明日概况。
      </div>
    </>
  )
}
