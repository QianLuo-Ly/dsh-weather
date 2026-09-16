/**
 * 定位方式 block: the auto/manual radios, the manual location editor (city
 * search + coordinate and display-name drafts) and the saved-city list.
 */
import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { LAT_RANGE, LON_RANGE, MAX_NAME_LENGTH, type WeatherConfig } from '../config-shared'
import type { SavedLocationsState } from './hooks'
import { CitySearchField } from './settings-city-search'
import { SavedCitiesList } from './settings-saved-cities'
import { MUTED, Row, input, radioLabel, type FieldWriter, type Notify } from './settings-shared'

export function LocationSection(props: {
  effective: WeatherConfig
  commit: FieldWriter
  notify: Notify
  /** Editing a draft retracts the page's previous notice. */
  setNotice: (next: null) => void
  savedCities: SavedLocationsState
}): ReactElement {
  const { effective, commit, notify, setNotice, savedCities } = props
  const ids = useId()
  // Local drafts — committed on blur / Enter / pointer-up instead of per key.
  const [latInput, setLatInput] = useState('')
  const [lonInput, setLonInput] = useState('')
  const [nameInput, setNameInput] = useState('')

  const clearNotice = (): void => setNotice(null)

  // Seed drafts from the stored config, but only the field that actually
  // changed — a commit (or a city search) updates its own input without
  // clobbering another input's uncommitted draft.
  //
  // The FIRST run must seed unconditionally. This block mounts only when the
  // settings panel is opened, long after the namespace resolved, so the stored
  // coordinates are already present on the very first render: a change-detecting
  // ref initialised from that same render can never observe a difference, which
  // left 纬度/经度 rendering EMPTY for an existing manual location — and a bare
  // focus+blur on an empty field then wrote a clear, wiping the coordinate.
  const prevCoordsRef = useRef({ lat: effective.latitude, lon: effective.longitude })
  const coordsSeededRef = useRef(false)
  useEffect(() => {
    const prev = prevCoordsRef.current
    const first = !coordsSeededRef.current
    if (first || effective.latitude !== prev.lat) setLatInput(effective.latitude?.toString() ?? '')
    if (first || effective.longitude !== prev.lon) setLonInput(effective.longitude?.toString() ?? '')
    coordsSeededRef.current = true
    prevCoordsRef.current = { lat: effective.latitude, lon: effective.longitude }
  }, [effective.latitude, effective.longitude])

  useEffect(() => {
    setNameInput(effective.cityName ?? '')
  }, [effective.cityName])

  /** Commit a coordinate draft after validation (blur / Enter). A bad parse
   * (`value === ''` from letters in a number input) is treated as invalid, not
   * as "clear the coordinate". */
  const commitCoordinate = (kind: 'latitude' | 'longitude', input: HTMLInputElement): void => {
    const range = kind === 'latitude' ? LAT_RANGE : LON_RANGE
    const label = kind === 'latitude' ? '纬度' : '经度'
    const revertDraft = (): void => {
      if (kind === 'latitude') setLatInput(effective.latitude?.toString() ?? '')
      else setLonInput(effective.longitude?.toString() ?? '')
    }
    if (input.validity.badInput) {
      notify(`${label}格式不正确（未保存）`, 'err')
      revertDraft()
      return
    }
    const text = input.value.trim()
    if (text === '') {
      // A blank field means "clear the coordinate" only when the user actually
      // emptied it. An untouched blank field is a rendering/state artefact, and
      // treating it as a deliberate clear would silently erase a stored
      // coordinate — so restore the committed value instead of writing an unset.
      const stored = effective[kind]
      if (stored !== undefined) {
        revertDraft()
        return
      }
      // Clearing coordinates also drops the saved-city highlight (custom/absent).
      commit([], [kind, 'activeSavedId'])
      return
    }
    const value = Number(text)
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      notify(`${label}须在 ${range.min}~${range.max} 之间（当前输入未保存）`, 'err')
      revertDraft()
      return
    }
    if (value === effective[kind]) return
    commit([[kind, value]], ['activeSavedId'])
  }

  /** Commit the display-name draft; renaming means custom coordinates, so the
   * saved-city highlight is cleared too. */
  const commitName = (input: HTMLInputElement): void => {
    const next = input.value.trim().slice(0, MAX_NAME_LENGTH)
    if (next === effective.cityName) return
    if (next === '') {
      commit([], ['cityName', 'activeSavedId'])
      return
    }
    commit([['cityName', next]], ['activeSavedId'])
  }

  return (
    <>
      <Row label="定位方式">
        <div style={{ display: 'flex', gap: 14 }}>
          <label style={radioLabel}>
            <input
              type="radio"
              name="dsh-weather-location-mode"
              checked={effective.locationMode === 'auto'}
              onChange={() => commit([['locationMode', 'auto']], ['activeSavedId'])}
            />
            自动（GPS 定位，失败回退 IP）
          </label>
          <label style={radioLabel}>
            <input
              type="radio"
              name="dsh-weather-location-mode"
              checked={effective.locationMode === 'manual'}
              onChange={() => commit([['locationMode', 'manual']], ['activeSavedId'])}
            />
            手动
          </label>
        </div>
      </Row>

      {effective.locationMode === 'manual' && (
        <>
          <CitySearchField effective={effective} savedCities={savedCities} onEdit={clearNotice} idPrefix={ids} />
          <Row label="纬度 / 经度">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                step="0.0001"
                min={LAT_RANGE.min}
                max={LAT_RANGE.max}
                value={latInput}
                aria-label="纬度（-90 ~ 90）"
                placeholder="纬度"
                onChange={(event) => { clearNotice(); setLatInput(event.target.value) }}
                onBlur={(event) => commitCoordinate('latitude', event.currentTarget)}
                onKeyDown={(event) => { if (event.key === 'Enter') commitCoordinate('latitude', event.currentTarget) }}
                style={{ ...input, width: 120 }}
              />
              <span style={{ color: MUTED }}>/</span>
              <input
                type="number"
                step="0.0001"
                min={LON_RANGE.min}
                max={LON_RANGE.max}
                value={lonInput}
                aria-label="经度（-180 ~ 180）"
                placeholder="经度"
                onChange={(event) => { clearNotice(); setLonInput(event.target.value) }}
                onBlur={(event) => commitCoordinate('longitude', event.currentTarget)}
                onKeyDown={(event) => { if (event.key === 'Enter') commitCoordinate('longitude', event.currentTarget) }}
                style={{ ...input, width: 120 }}
              />
            </div>
          </Row>
          <Row label="显示名称" labelFor={`${ids}-cityname`}>
            <input
              id={`${ids}-cityname`}
              type="text"
              value={nameInput}
              maxLength={MAX_NAME_LENGTH}
              placeholder="如：北京"
              onChange={(event) => { clearNotice(); setNameInput(event.target.value) }}
              onBlur={(event) => commitName(event.currentTarget)}
              onKeyDown={(event) => { if (event.key === 'Enter') commitName(event.currentTarget) }}
              style={input}
            />
          </Row>
        </>
      )}

      <SavedCitiesList savedCities={savedCities} />
    </>
  )
}
