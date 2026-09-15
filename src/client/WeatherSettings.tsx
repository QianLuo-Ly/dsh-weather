/**
 * Weather configuration page, registered into `settings.section`. Owns the
 * durable settings: visibility, location mode (auto / manual with city search),
 * saved cities, temperature unit, refresh interval and the daily-brief times.
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
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  DEFAULT_WEATHER_CONFIG,
  LAT_RANGE,
  LON_RANGE,
  MAX_NAME_LENGTH,
  MAX_SAVED_LOCATIONS,
  parseClockTime,
  REFRESH_RANGE,
  sameConfig,
  sanitizeConfig,
  type WeatherConfig,
} from '../config-shared'
import { runLocationDiagnostics, searchCity, type GeoLocation, type LocationDiagnostics } from './weather-api'
import { Glyph } from './icons'
import { useSavedLocations, writeVerified, type NoticeKind } from './hooks'
import { SHADOW, TOKEN } from './theme'

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

// Design tokens — single source is theme.ts; these aliases only shorten reads.
const FG = TOKEN.fg
const MUTED = TOKEN.fgMuted
const BORDER = TOKEN.border
const ACCENT = TOKEN.accent
const BG_ROW = TOKEN.bgSoft
const INPUT_BG = TOKEN.bgRaised
const DANGER = TOKEN.danger
const OK = '#2f9e44'

interface Notice { text: string; kind: NoticeKind }

export function WeatherSettingsSection(props: WeatherSettingsSectionProps): ReactElement {
  const { scope, probe } = props
  const [config, setConfig] = useState<WeatherConfig | undefined>(() => sanitizeConfig(scope.getSnapshot().value))
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<GeoLocation[]>([])
  const [searching, setSearching] = useState(false)
  /** Keyboard-highlighted suggestion; mirrors the pointer on hover. */
  const [activeIndex, setActiveIndex] = useState(0)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [diag, setDiag] = useState<LocationDiagnostics | null>(null)
  const [diagBusy, setDiagBusy] = useState(false)
  // Local drafts — committed on blur / Enter / pointer-up instead of per key.
  const [latInput, setLatInput] = useState('')
  const [lonInput, setLonInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [refreshInput, setRefreshInput] = useState(DEFAULT_WEATHER_CONFIG.refreshMinutes)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [permission, setPermission] = useState<NotificationPermission>(() => (
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  ))
  const ids = useId()
  const skipNextSearchRef = useRef(false)
  const searchBoxRef = useRef<HTMLDivElement>(null)
  const diagRunRef = useRef(0)

  const effective = config ?? DEFAULT_WEATHER_CONFIG
  const snapshot = scope.getSnapshot()

  const notify = useCallback((text: string, kind: NoticeKind = 'ok'): void => {
    setNotice({ text, kind })
  }, [])
  const clearNotice = useCallback((): void => setNotice(null), [])

  useEffect(() => {
    const sync = (): void => {
      const next = sanitizeConfig(scope.getSnapshot().value)
      setConfig((prev) => (sameConfig(prev, next) ? prev : next))
    }
    sync()
    return scope.subscribe(sync)
  }, [scope])

  // Seed drafts from the stored config, but only the field that actually
  // changed — a commit (or a city search) updates its own input without
  // clobbering another input's uncommitted draft.
  const prevCoordsRef = useRef({ lat: effective.latitude, lon: effective.longitude })
  useEffect(() => {
    const prev = prevCoordsRef.current
    if (effective.latitude !== prev.lat) setLatInput(effective.latitude?.toString() ?? '')
    if (effective.longitude !== prev.lon) setLonInput(effective.longitude?.toString() ?? '')
    prevCoordsRef.current = { lat: effective.latitude, lon: effective.longitude }
  }, [effective.latitude, effective.longitude])

  useEffect(() => {
    setNameInput(effective.cityName ?? '')
  }, [effective.cityName])

  useEffect(() => {
    setRefreshInput(effective.refreshMinutes)
  }, [effective.refreshMinutes])

  // Manual↔auto switches must not leave a stale suggestion dropdown behind.
  useEffect(() => {
    setSuggestions([])
    setSearching(false)
    setActiveIndex(0)
  }, [effective.locationMode])

  // Dropdown closes on outside click (Esc is handled on the input itself).
  useEffect(() => {
    if (suggestions.length === 0) return
    const onPointerDown = (event: MouseEvent): void => {
      if (searchBoxRef.current !== null && !searchBoxRef.current.contains(event.target as Node)) {
        setSuggestions([])
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [suggestions.length])

  // Notification permission can change in browser settings; re-read on focus.
  useEffect(() => {
    const refresh = (): void => setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  // Invalidate any in-flight diagnostics when the page unmounts.
  useEffect(() => () => { diagRunRef.current += 1 }, [])

  // 250ms 防抖：避免每次击键都请求 Open-Meteo Geocoding。
  useEffect(() => {
    if (skipNextSearchRef.current) {
      // Programmatic value (a picked result) — do not re-open the dropdown.
      skipNextSearchRef.current = false
      return
    }
    const trimmed = search.trim()
    if (trimmed === '') {
      setSuggestions([])
      setSearching(false)
      setActiveIndex(0)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      void searchCity(trimmed, 5)
        .then((results) => { if (!cancelled) { setSuggestions(results); setActiveIndex(0) } })
        .catch(() => { if (!cancelled) setSuggestions([]) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [search])

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
   */
  const commit = useCallback((fields: Array<[keyof WeatherConfig, unknown]>, clears: Array<keyof WeatherConfig> = []): void => {
    if (!scope.getSnapshot().writable) {
      notify('当前连接不支持修改设置（只读）', 'err')
      return
    }
    const rawFields = fields.map(([field, value]) => [field as string, value] as [string, unknown])
    const rawClears = clears.map((field) => field as string)
    void writeVerified(scope, rawFields, rawClears).then((accepted) => {
      if (accepted) return
      void probe(rawFields, rawClears).then((result) => {
        if (result.ok) {
          setConfig(sanitizeConfig(result.value as Partial<WeatherConfig> | undefined))
          notify('已保存（原写入被服务端的版本栅栏拒绝，已改用无栅栏写入）', 'ok')
          return
        }
        notify(`该设置未被保存：${result.detail}｜客户端 rev=${scope.getSnapshot().revision ?? '?'}`, 'err')
      })
    })
  }, [scope, notify, probe])

  const set = useCallback((field: keyof WeatherConfig, value: unknown): void => {
    commit([[field, value]])
  }, [commit])

  // Saved-city management lives in the shared hook (same code path as the chip),
  // with feedback routed into this page's notice line.
  const savedCities = useSavedLocations({ scope, effective, onNotice: notify })

  const requestNotificationPermission = useCallback((): void => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return
    void Notification.requestPermission().then(() => {
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
    })
  }, [])

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

  /** Commit the refresh-interval draft. */
  const commitRefresh = (): void => {
    if (refreshInput === effective.refreshMinutes) return
    set('refreshMinutes', refreshInput)
  }

  /** Commit a `<input type="time">` value only when it parses to `HH:MM`. */
  const commitClockTime = (field: 'briefMorning' | 'briefEvening', text: string): void => {
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
    if (parsed === effective[field]) return
    clearNotice()
    set(field, parsed)
  }

  /**
   * Adopt one search result as the manual location. Selecting a place means
   * custom coordinates, so the hook writes coords+name in one batch and clears
   * any active saved id.
   */
  const pickPlace = (place: GeoLocation): void => {
    savedCities.selectPlace(place)
    // Skip the debounce re-search only when the text actually changes — a no-op
    // setState would not run the effect and would leave the guard armed.
    if (place.name !== search) {
      skipNextSearchRef.current = true
      setSearch(place.name)
    }
    setSuggestions([])
  }

  const atSavedLimit = savedCities.saved.length >= MAX_SAVED_LOCATIONS
  const permissionHint = permission === 'denied'
    ? '通知权限已被浏览器拒绝，请在站点设置中允许后重新开启。'
    : permission === 'default'
      ? '浏览器通知尚未授权——开启时请允许，否则提醒与简报不会推送。'
      : null

  return (
    <div style={{ maxWidth: 560, padding: '4px 0 20px', color: FG }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>天气</div>
      <div style={{ color: MUTED, fontSize: 12.5, marginBottom: 16 }}>
        会话顶部操作行的天气 chip（数据来源：Open-Meteo，无需 API key）。
      </div>

      <Row label="显示天气栏" labelFor={`${ids}-enabled`}>
        <input
          id={`${ids}-enabled`}
          type="checkbox"
          checked={effective.enabled}
          onChange={(event) => set('enabled', event.target.checked)}
          style={checkbox}
        />
      </Row>

      <Row label="恶劣天气提醒" labelFor={`${ids}-alerts`}>
        <input
          id={`${ids}-alerts`}
          type="checkbox"
          checked={effective.alertsEnabled}
          onChange={(event) => {
            set('alertsEnabled', event.target.checked)
            if (event.target.checked) requestNotificationPermission()
          }}
          style={checkbox}
        />
      </Row>
      {effective.alertsEnabled && permissionHint !== null && (
        <div style={{ color: permission === 'denied' ? DANGER : MUTED, fontSize: 12, margin: '-2px 0 10px 12px' }}>
          {permissionHint}
        </div>
      )}
      <div style={{ color: MUTED, fontSize: 12, margin: '-2px 0 10px 12px' }}>
        强降雨 / 雷暴 / 高温 / 大风 / 强降雪时发送浏览器通知。
      </div>

      <Row label="每日天气简报" labelFor={`${ids}-brief`}>
        <input
          id={`${ids}-brief`}
          type="checkbox"
          checked={effective.briefEnabled}
          onChange={(event) => {
            set('briefEnabled', event.target.checked)
            if (event.target.checked) requestNotificationPermission()
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
          <Row label="早上简报时间" labelFor={`${ids}-brief-morning`}>
            <input
              id={`${ids}-brief-morning`}
              type="time"
              value={effective.briefMorning}
              aria-label="早上简报时间（HH:MM）"
              onChange={(event) => commitClockTime('briefMorning', event.currentTarget.value)}
              style={{ ...input, width: 120 }}
            />
            <span style={{ color: MUTED, fontSize: 12, whiteSpace: 'nowrap' }}>推送今日天气</span>
          </Row>
          <Row label="晚间简报时间" labelFor={`${ids}-brief-evening`}>
            <input
              id={`${ids}-brief-evening`}
              type="time"
              value={effective.briefEvening}
              aria-label="晚间简报时间（HH:MM）"
              onChange={(event) => commitClockTime('briefEvening', event.currentTarget.value)}
              style={{ ...input, width: 120 }}
            />
            <span style={{ color: MUTED, fontSize: 12, whiteSpace: 'nowrap' }}>推送明日天气</span>
          </Row>
        </>
      )}
      <div style={{ color: MUTED, fontSize: 12, margin: '-2px 0 10px 12px' }}>
        到点后通过浏览器通知推送（按本机时间，最多补发 2 小时）：早上＝今日最高/最低与降水概率，晚上＝明日概况。
      </div>

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
          <Row label="城市搜索" labelFor={`${ids}-search`}>
            <div ref={searchBoxRef} style={{ position: 'relative', flex: 1 }}>
              <input
                id={`${ids}-search`}
                type="text"
                value={search}
                maxLength={MAX_NAME_LENGTH}
                placeholder="输入城市名，如：北京 / Beijing"
                onChange={(event) => { setSearch(event.target.value); setActiveIndex(0) }}
                onKeyDown={(event) => {
                  // Arrow keys drive the active row while focus stays in the
                  // input, so typing, picking and starring never fight for focus.
                  if (event.key === 'Escape') { setSuggestions([]); return }
                  if (suggestions.length === 0) return
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setActiveIndex((prev) => (prev + 1) % suggestions.length)
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
                  } else if (event.key === 'Enter') {
                    event.preventDefault()
                    const chosen = suggestions[activeIndex] ?? suggestions[0]
                    if (chosen !== undefined) pickPlace(chosen)
                  }
                }}
                style={{ ...input, paddingRight: searching ? 72 : undefined }}
                aria-label="搜索城市"
                aria-expanded={suggestions.length > 0}
                aria-controls={suggestions.length > 0 ? `${ids}-suggestions` : undefined}
                aria-activedescendant={suggestions.length > 0 ? `${ids}-suggestion-${activeIndex}` : undefined}
              />
              {searching && <span style={searchingBadge}>搜索中…</span>}
              {suggestions.length > 0 && (
                <div
                  id={`${ids}-suggestions`}
                  role="list"
                  aria-label="城市搜索结果"
                  className="dshw-ac-panel"
                  style={suggestionPanel}
                >
                  {suggestions.map((place, index) => {
                    const alreadySaved = savedCities.isSaved(place.latitude, place.longitude)
                    const saveBlocked = alreadySaved || atSavedLimit
                    const saveHint = alreadySaved
                      ? `${place.name} 已收藏`
                      : atSavedLimit
                        ? `最多收藏 ${MAX_SAVED_LOCATIONS} 个城市`
                        : `收藏 ${place.name}`
                    return (
                      <div
                        key={`${place.latitude},${place.longitude},${place.name}`}
                        id={`${ids}-suggestion-${index}`}
                        role="listitem"
                        className="dshw-ac-row"
                        data-active={index === activeIndex}
                        style={suggestionRow}
                        onMouseEnter={() => setActiveIndex(index)}
                      >
                        <button
                          type="button"
                          className="dshw-ac-pick"
                          aria-label={`切换到 ${place.name}`}
                          onClick={() => pickPlace(place)}
                          style={suggestionPick}
                        >
                          <span style={suggestionPin}><Glyph name="pin" size={14} /></span>
                          <span style={suggestionLines}>
                            <span style={suggestionName}>{place.name}</span>
                            <span style={suggestionCoords}>
                              {place.latitude.toFixed(2)}, {place.longitude.toFixed(2)}
                            </span>
                          </span>
                        </button>
                        {/* Saving must not switch the location or clear the search. */}
                        <button
                          type="button"
                          className="dshw-ac-star"
                          disabled={saveBlocked}
                          title={saveHint}
                          aria-label={saveHint}
                          aria-pressed={alreadySaved}
                          onClick={() => savedCities.addPlace({ name: place.name, latitude: place.latitude, longitude: place.longitude })}
                          style={{
                            ...suggestionStar,
                            ...(alreadySaved ? { color: ACCENT, cursor: 'default' } : {}),
                            ...(saveBlocked && !alreadySaved ? { color: MUTED, cursor: 'default' } : {}),
                          }}
                        >
                          {alreadySaved ? '★' : '☆'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Row>
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

      <div style={{ padding: '10px 12px', marginBottom: 8, background: BG_ROW, borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 13 }}>收藏城市（{savedCities.saved.length}/{MAX_SAVED_LOCATIONS}）</span>
          <button
            type="button"
            onClick={savedCities.addCurrent}
            disabled={atSavedLimit}
            title={atSavedLimit ? `最多收藏 ${MAX_SAVED_LOCATIONS} 个城市` : undefined}
            style={{ ...inputButton, padding: '5px 12px', fontSize: 12.5, ...(atSavedLimit ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
          >
            ＋ 收藏当前位置
          </button>
        </div>
        {savedCities.saved.length === 0 ? (
          <div style={{ color: MUTED, fontSize: 12 }}>
            还没有收藏城市——搜索城市后点 ☆ 收藏，或收藏当前位置。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {savedCities.saved.map((place) => {
              const active = savedCities.activeId === place.id
              const confirming = pendingDeleteId === place.id
              return (
                <div
                  key={place.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    border: `1px solid ${active ? ACCENT : BORDER}`,
                    borderRadius: 8,
                    background: active ? INPUT_BG : 'transparent',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                    {place.name}
                    <span style={{ color: MUTED, fontSize: 12 }}>　{place.latitude.toFixed(3)}, {place.longitude.toFixed(3)}</span>
                  </span>
                  {active && (
                    <span aria-current="true" style={{ fontSize: 11, color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 6, padding: '0 5px', whiteSpace: 'nowrap' }}>
                      当前
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => savedCities.switchTo(place.id)}
                    aria-label={`切换到 ${place.name}`}
                    style={{ ...inputButton, padding: '4px 10px', fontSize: 12.5 }}
                  >
                    切换
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirming) {
                        setPendingDeleteId(place.id)
                        return
                      }
                      setPendingDeleteId(null)
                      savedCities.remove(place.id)
                    }}
                    onBlur={() => setPendingDeleteId((prev) => (prev === place.id ? null : prev))}
                    aria-label={confirming ? `确认删除 ${place.name}` : `删除 ${place.name}`}
                    style={{ ...inputButton, padding: '4px 10px', fontSize: 12.5, color: DANGER, borderColor: DANGER }}
                  >
                    {confirming ? '确认删除' : '删除'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
          onKeyUp={commitRefresh}
          style={{ flex: 1, accentColor: ACCENT }}
        />
      </Row>

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

      {/* Location diagnostics */}
      <div style={{ marginTop: 20, fontSize: 12, lineHeight: '19px', color: MUTED, background: BG_ROW, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <span style={{ fontWeight: 600, color: FG }}>定位诊断</span>
          <button
            type="button"
            disabled={diagBusy}
            onClick={() => {
              if (diagBusy) return
              const run = diagRunRef.current + 1
              diagRunRef.current = run
              setDiag(null)
              setDiagBusy(true)
              void runLocationDiagnostics()
                .then((result) => { if (diagRunRef.current === run) setDiag(result) })
                .catch(() => { if (diagRunRef.current === run) notify('定位诊断失败，请稍后重试', 'err') })
                .finally(() => { if (diagRunRef.current === run) setDiagBusy(false) })
            }}
            style={inputButton}
          >
            {diagBusy ? '检测中…' : '重新检测'}
          </button>
        </div>
        <div>
          配置坐标：
          {effective.locationMode === 'manual'
            ? `${effective.latitude?.toFixed(3) ?? '--'}, ${effective.longitude?.toFixed(3) ?? '--'}（手动：${effective.cityName ?? '未设置'}）`
            : effective.autoLatitude !== undefined
              ? `${effective.autoLatitude.toFixed(3)}, ${effective.autoLongitude?.toFixed(3)}（缓存：${effective.autoCityName ?? ''}）`
              : '自动模式（尚未定位）'}
        </div>
        {diag !== null ? (
          <>
            <div>
              浏览器 GPS：
              {diag.gps.status === 'ok'
                ? `${diag.gps.latitude?.toFixed(3)}, ${diag.gps.longitude?.toFixed(3)}${diag.gps.accuracy !== undefined ? `（精度 ±${Math.round(diag.gps.accuracy)} m）` : ''}`
                : diag.gps.status === 'timeout'
                  ? '超时'
                  : `失败（${diag.gps.error ?? '未知'}）`}
            </div>
            <div>
              IP 定位：
              {diag.ip.status === 'ok'
                ? `${diag.ip.city}（${diag.ip.latitude?.toFixed(3)}, ${diag.ip.longitude?.toFixed(3)}）`
                : `失败 ${diag.ip.error ?? ''}`}
            </div>
            {diag.gpsIpDistanceKm !== undefined && <div>GPS ↔ IP 距离：{Math.round(diag.gpsIpDistanceKm)} km</div>}
            <div>采用：{diag.chosen === 'gps' ? `GPS（${precisionLabel(diag.precision)}精度）` : diag.chosen === 'ip' ? 'IP（浏览器定位缺失或过粗）' : '无'}</div>
          </>
        ) : (
          <div>点击"重新检测"查看 GPS / IP 各自的原始结果。</div>
        )}
      </div>
    </div>
  )
}

/** Chinese label for a browser-fix precision tier (see weather-api.ts). */
function precisionLabel(precision: string | undefined): string {
  if (precision === 'district') return '区级'
  if (precision === 'city') return '市级'
  return '未分级'
}

function Row(props: { label: string; labelFor?: string; children: ReactNode }): ReactElement {
  const { label, labelFor, children } = props
  const labelNode = labelFor !== undefined
    ? <label htmlFor={labelFor} style={{ flex: '0 0 auto', cursor: 'pointer' }}>{label}</label>
    : <span style={{ flex: '0 0 auto' }}>{label}</span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', marginBottom: 8, background: BG_ROW, borderRadius: 10 }}>
      {labelNode}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{children}</div>
    </div>
  )
}

const checkbox: CSSProperties = { width: 16, height: 16, accentColor: ACCENT, cursor: 'pointer' }

const radioLabel: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const input: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 13,
  color: FG,
  background: INPUT_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: '6px 10px',
  outline: 'none',
  minWidth: 0,
  boxSizing: 'border-box',
}

const inputButton: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 13,
  color: FG,
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: '6px 16px',
  cursor: 'pointer',
}

// ── City picker ─────────────────────────────────────────────────────────────
// Positioning and the two-line result layout ride inline styles; hover and
// keyboard-active states live in the injected stylesheet (`dshw-ac-*`), since
// inline styles cannot express pseudo-classes or attribute selectors.

const searchingBadge: CSSProperties = {
  position: 'absolute',
  right: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: 11.5,
  color: MUTED,
  pointerEvents: 'none',
}

const suggestionPanel: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  zIndex: 20,
  padding: 6,
  background: INPUT_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  boxShadow: SHADOW.dropdown,
  maxHeight: 288,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
}

const suggestionRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 4px 2px 0',
  borderRadius: 10,
}

const suggestionPick: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flex: 1,
  minWidth: 0,
  padding: '6px 8px',
  background: 'transparent',
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  textAlign: 'left',
  font: 'inherit',
  color: FG,
}

/** Tinted disc behind the pin, so each result has a clear visual anchor. */
const suggestionPin: CSSProperties = {
  display: 'flex',
  flex: '0 0 auto',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 9,
  color: ACCENT,
  background: 'rgba(79, 140, 255, 0.12)',
}

const suggestionLines: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
}

const suggestionName: CSSProperties = {
  fontSize: 13.5,
  lineHeight: '18px',
  fontWeight: 550,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const suggestionCoords: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontSize: 11.5,
  lineHeight: '15px',
  color: MUTED,
}

/** Icon-only bookmark toggle (★ saved / ☆ available), not a text button. */
const suggestionStar: CSSProperties = {
  fontFamily: 'inherit',
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  fontSize: 15,
  lineHeight: 1,
  color: MUTED,
  background: 'transparent',
  border: 'none',
  borderRadius: 9,
  cursor: 'pointer',
}
