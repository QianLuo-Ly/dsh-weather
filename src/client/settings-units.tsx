/**
 * Temperature unit and refresh interval. Owns the refresh-interval draft, so a
 * slider drag never fires a settings write per pixel.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { REFRESH_RANGE, type WeatherConfig } from '../config-shared'
import { ACCENT, Row, radioLabel, type FieldSetter } from './settings-shared'

/** How long keyboard nudges are coalesced before one settings write. */
const REFRESH_KEY_COMMIT_DELAY_MS = 400

export function UnitsSection(props: { effective: WeatherConfig; set: FieldSetter }): ReactElement {
  const { effective, set } = props
  const ids = useId()
  const [refreshInput, setRefreshInput] = useState(effective.refreshMinutes)
  const commitTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setRefreshInput(effective.refreshMinutes)
  }, [effective.refreshMinutes])

  const cancelScheduledCommit = useCallback((): void => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current)
      commitTimerRef.current = null
    }
  }, [])

  /** Commit the refresh-interval draft. */
  const commitRefresh = useCallback((): void => {
    cancelScheduledCommit()
    if (refreshInput === effective.refreshMinutes) return
    set('refreshMinutes', refreshInput)
  }, [cancelScheduledCommit, refreshInput, effective.refreshMinutes, set])

  // Arrow keys emit one keyup per press: committing on each of them wrote the
  // settings document (and re-rendered the page) for every step. Coalesce them.
  const scheduleCommit = useCallback((): void => {
    cancelScheduledCommit()
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null
      commitRefresh()
    }, REFRESH_KEY_COMMIT_DELAY_MS)
  }, [cancelScheduledCommit, commitRefresh])

  useEffect(() => cancelScheduledCommit, [cancelScheduledCommit])

  return (
    <>
      <Row label="温度单位">
        <div style={{ display: 'flex', gap: 14 }}>
          <label style={radioLabel}>
            <input type="radio" name="dsh-weather-units" checked={effective.units === 'celsius'} onChange={() => set('units', 'celsius')} />
            摄氏 °C
          </label>
          <label style={radioLabel}>
            <input type="radio" name="dsh-weather-units" checked={effective.units === 'fahrenheit'} onChange={() => set('units', 'fahrenheit')} />
            华氏 °F
          </label>
        </div>
      </Row>

      <Row label={`刷新间隔（分钟，当前 ${effective.refreshMinutes}）`} labelFor={`${ids}-refresh`}>
        <input
          id={`${ids}-refresh`}
          type="range"
          min={REFRESH_RANGE.min}
          max={REFRESH_RANGE.max}
          step={REFRESH_RANGE.step}
          value={refreshInput}
          onChange={(event) => setRefreshInput(Number(event.target.value))}
          onPointerUp={commitRefresh}
          onBlur={commitRefresh}
          onKeyUp={scheduleCommit}
          style={{ flex: 1, accentColor: ACCENT }}
        />
      </Row>
    </>
  )
}
