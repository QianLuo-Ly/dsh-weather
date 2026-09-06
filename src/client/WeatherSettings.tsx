/**
 * Weather configuration page, registered into `settings.section`. Owns the
 * durable settings: visibility, location mode (auto / manual with city search),
 * temperature unit, and refresh interval. Writes go through `scope.set(...)`
 * with the settings transport's revision fencing.
 *
 * Coordinate inputs are local drafts committed on blur: typing `-`, `1e5` or
 * an out-of-range value must never be persisted mid-keystroke (the previous
 * version wrote `NaN` straight into settings on every keypress).
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_WEATHER_CONFIG, LAT_RANGE, LON_RANGE, REFRESH_RANGE, sanitizeConfig, type WeatherConfig } from '../config-shared'
import { runLocationDiagnostics, searchCity, type GeoLocation, type LocationDiagnostics } from './weather-api'
import { TOKEN } from './theme'

export interface WeatherSettingsSectionProps {
  scope: SettingsScope<WeatherConfig>
}

// Design tokens — single source is theme.ts; these aliases only shorten reads.
const FG = TOKEN.fg
const MUTED = TOKEN.fgMuted
const BORDER = TOKEN.border
const ACCENT = TOKEN.accent
const BG_ROW = TOKEN.bgSoft
const INPUT_BG = TOKEN.bgRaised
const DANGER = TOKEN.danger

export function WeatherSettingsSection(props: WeatherSettingsSectionProps): ReactElement {
  const { scope } = props
  const [config, setConfig] = useState<WeatherConfig | undefined>(() => sanitizeConfig(scope.getSnapshot().value))
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<GeoLocation[]>([])
  const [searching, setSearching] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [diag, setDiag] = useState<LocationDiagnostics | null>(null)
  const [diagBusy, setDiagBusy] = useState(false)
  // Local drafts for the coordinate inputs — committed to settings on blur.
  const [latInput, setLatInput] = useState('')
  const [lonInput, setLonInput] = useState('')
  const ids = useId()

  const effective = config ?? DEFAULT_WEATHER_CONFIG

  useEffect(() => {
    const sync = (): void => setConfig(sanitizeConfig(scope.getSnapshot().value))
    sync()
    return scope.subscribe(sync)
  }, [scope])

  // Sync each coordinate draft from the stored config, but only the field that
  // actually changed (prev-value diff). A commit/blur or an external write
  // (city search) then updates its own input without clobbering the other
  // input's uncommitted draft.
  const prevCoordsRef = useRef({ lat: effective.latitude, lon: effective.longitude })
  useEffect(() => {
    const prev = prevCoordsRef.current
    if (effective.latitude !== prev.lat) setLatInput(effective.latitude?.toString() ?? '')
    if (effective.longitude !== prev.lon) setLonInput(effective.longitude?.toString() ?? '')
    prevCoordsRef.current = { lat: effective.latitude, lon: effective.longitude }
  }, [effective.latitude, effective.longitude])

  // 250ms 防抖：避免每次击键都请求 Open-Meteo Geocoding。
  useEffect(() => {
    const trimmed = search.trim()
    if (trimmed === '') {
      setSuggestions([])
      setSearching(false)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      void searchCity(trimmed, 5)
        .then((results) => { if (!cancelled) setSuggestions(results) })
        .catch(() => { if (!cancelled) setSuggestions([]) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [search])

  const snapshot = scope.getSnapshot()
  const writable = snapshot.writable

  const set = (field: keyof WeatherConfig, value: unknown): void => {
    if (!writable) {
      // No per-field transport available (read-only connection) — do not claim
      // the change "applies for this session" because it would not.
      setNotice('当前连接不支持修改设置（只读）')
      return
    }
    void scope.set(field as string, value).catch(() => setNotice('写入失败，请重试'))
  }

  /** Commit a coordinate draft after validation (blur / Enter). Only the
   * offending draft is reset on failure — never the other, still-valid one. */
  const commitCoordinate = (kind: 'latitude' | 'longitude', text: string): void => {
    const range = kind === 'latitude' ? LAT_RANGE : LON_RANGE
    const label = kind === 'latitude' ? '纬度' : '经度'
    const trimmed = text.trim()
    const revertDraft = (): void => {
      if (kind === 'latitude') setLatInput(effective.latitude?.toString() ?? '')
      else setLonInput(effective.longitude?.toString() ?? '')
    }
    if (trimmed === '') {
      set(kind, undefined)
      return
    }
    const value = Number(trimmed)
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      setNotice(`${label}须在 ${range.min}~${range.max} 之间（当前输入未保存）`)
      revertDraft()
      return
    }
    setNotice(null)
    set(kind, value)
  }

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
            if (event.target.checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
              void Notification.requestPermission()
            }
          }}
          style={checkbox}
        />
      </Row>
      {effective.alertsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
        <div style={{ color: DANGER, fontSize: 12, margin: '-2px 0 10px 12px' }}>
          通知权限已被浏览器拒绝，请在站点设置中允许后重新开启。
        </div>
      )}
      <div style={{ color: MUTED, fontSize: 12, margin: '-2px 0 10px 12px' }}>
        强降雨 / 雷暴 / 高温 / 大风 / 强降雪时发送浏览器通知。
      </div>

      <Row label="定位方式">
        <div style={{ display: 'flex', gap: 14 }}>
          <label style={radioLabel}>
            <input
              type="radio"
              name="dsh-weather-location-mode"
              checked={effective.locationMode === 'auto'}
              onChange={() => set('locationMode', 'auto')}
            />
            自动（GPS 定位，失败回退 IP）
          </label>
          <label style={radioLabel}>
            <input
              type="radio"
              name="dsh-weather-location-mode"
              checked={effective.locationMode === 'manual'}
              onChange={() => set('locationMode', 'manual')}
            />
            手动
          </label>
        </div>
      </Row>

      {effective.locationMode === 'manual' && (
        <>
          <Row label="城市搜索" labelFor={`${ids}-search`}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                id={`${ids}-search`}
                type="text"
                value={search}
                placeholder="输入城市名，如：北京 / Beijing"
                onChange={(event) => setSearch(event.target.value)}
                style={input}
                aria-label="搜索城市"
              />
              {searching && <span style={{ position: 'absolute', right: 8, top: 7, fontSize: 12, color: MUTED }}>搜索中…</span>}
              {suggestions.length > 0 && (
                <div
                  id={`${ids}-suggestions`}
                  role="list"
                  aria-label="城市搜索结果"
                  style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: INPUT_BG, border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}
                >
                  {suggestions.map((place) => (
                    <button
                      key={`${place.latitude},${place.longitude},${place.name}`}
                      type="button"
                      onClick={() => {
                        // Write the whole manual location in one committed set —
                        // name + coordinates change together to avoid a brief
                        // "new city name at old coordinates" intermediate state.
                        set('locationMode', 'manual')
                        void scope.set('cityName', place.name).then(() =>
                          Promise.all([
                            scope.set('latitude', place.latitude),
                            scope.set('longitude', place.longitude),
                          ]),
                        ).catch(() => setNotice('写入失败，请重试'))
                        setSearch(place.name)
                        setSuggestions([])
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: FG }}
                    >
                      {place.name}
                      <span style={{ color: MUTED, fontSize: 12 }}>　{place.latitude.toFixed(2)}, {place.longitude.toFixed(2)}</span>
                    </button>
                  ))}
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
                onChange={(event) => { setNotice(null); setLatInput(event.target.value) }}
                onBlur={(event) => commitCoordinate('latitude', event.currentTarget.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') commitCoordinate('latitude', event.currentTarget.value) }}
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
                onChange={(event) => { setNotice(null); setLonInput(event.target.value) }}
                onBlur={(event) => commitCoordinate('longitude', event.currentTarget.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') commitCoordinate('longitude', event.currentTarget.value) }}
                style={{ ...input, width: 120 }}
              />
            </div>
          </Row>
          <Row label="显示名称" labelFor={`${ids}-cityname`}>
            <input
              id={`${ids}-cityname`}
              type="text"
              value={effective.cityName ?? ''}
              placeholder="如：北京"
              onChange={(event) => set('cityName', event.target.value === '' ? undefined : event.target.value)}
              style={input}
            />
          </Row>
        </>
      )}

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
          value={effective.refreshMinutes}
          onChange={(event) => set('refreshMinutes', Number(event.target.value))}
          style={{ flex: 1, accentColor: ACCENT }}
        />
      </Row>

      {notice !== null && <div style={{ color: DANGER, fontSize: 12.5, marginTop: 8 }}>{notice}</div>}
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
              setDiag(null)
              setDiagBusy(true)
              void runLocationDiagnostics()
                .then(setDiag)
                .catch(() => setNotice('定位诊断失败，请稍后重试'))
                .finally(() => setDiagBusy(false))
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
