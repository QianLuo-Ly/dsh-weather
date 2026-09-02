/**
 * Weather configuration page, registered into `settings.section`. Owns the
 * durable settings: visibility, location mode (auto / manual with city search),
 * temperature unit, and refresh interval. Writes go through `scope.set(...)`
 * with the settings transport's revision fencing.
 */
import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { WeatherConfig } from '../config-shared'
import { searchCity, type GeoLocation } from './weather-api'

export interface WeatherSettingsSectionProps {
  scope: SettingsScope<WeatherConfig>
  /** Shell-provided affordance to close the settings panel (may be absent). */
  close?: () => void
}

// Text colors follow .dshw-root (pure white in dark mode, see styles.ts).
const FG = 'var(--dshw-fg, #1f2328)'
const MUTED = 'var(--dshw-fg-muted, #5f6672)'
const BORDER = 'var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12))'
const BG_ROW = 'var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.03))'
const ACCENT = 'var(--dsw-alias-brand-primary, #4f8cff)'

/** Shown until the settings namespace resolves; matches the Host schema defaults. */
const FALLBACK_CONFIG: WeatherConfig = {
  enabled: true,
  locationMode: 'auto',
  units: 'celsius',
  refreshMinutes: 15,
  alertsEnabled: false,
}

export function WeatherSettingsSection(props: WeatherSettingsSectionProps): ReactElement {
  const { scope } = props
  const [config, setConfig] = useState<WeatherConfig | undefined>(() => scope.getSnapshot().value)
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<GeoLocation[]>([])
  const [searching, setSearching] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const sync = (): void => setConfig(scope.getSnapshot().value)
    sync()
    return scope.subscribe(sync)
  }, [scope])

  useEffect(() => {
    if (search.trim() === '') {
      setSuggestions([])
      return
    }
    let cancelled = false
    setSearching(true)
    void searchCity(search, 5)
      .then((results) => { if (!cancelled) setSuggestions(results) })
      .catch(() => { if (!cancelled) setSuggestions([]) })
      .finally(() => { if (!cancelled) setSearching(false) })
    return () => {
      cancelled = true
    }
  }, [search])

  const effective = config ?? FALLBACK_CONFIG
  const snapshot = scope.getSnapshot()
  const writable = snapshot.writable

  const set = (field: keyof WeatherConfig, value: unknown): void => {
    if (!writable) {
      setNotice('当前连接未开放设置持久化，改动仅在本次会话生效')
      return
    }
    void scope.set(field as string, value).catch(() => setNotice('写入失败，请重试'))
  }

  return (
    <div style={{ maxWidth: 560, padding: '4px 0 20px', color: FG }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>天气</div>
      <div style={{ color: MUTED, fontSize: 12.5, marginBottom: 16 }}>
        顶部居中的天气栏（数据来源：Open-Meteo，无需 API key）。
      </div>

      <Row label="显示天气栏">
        <input
          type="checkbox"
          checked={effective.enabled}
          onChange={(event) => set('enabled', event.target.checked)}
          style={checkbox}
        />
      </Row>

      <Row label="恶劣天气提醒">
        <input
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
        <div style={{ color: '#d43c3c', fontSize: 12, margin: '-2px 0 10px 12px' }}>
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
          <Row label="城市搜索">
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                value={search}
                placeholder="输入城市名，如：北京 / Beijing"
                onChange={(event) => setSearch(event.target.value)}
                style={input}
              />
              {searching && <span style={{ position: 'absolute', right: 8, top: 7, fontSize: 12, color: MUTED }}>搜索中…</span>}
              {suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--dsw-alias-bg-layer-1, #ffffff)', border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10, overflow: 'hidden' }}>
                  {suggestions.map((place, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        set('cityName', place.name)
                        set('latitude', place.latitude)
                        set('longitude', place.longitude)
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
                value={effective.latitude ?? ''}
                placeholder="纬度"
                onChange={(event) => set('latitude', event.target.value === '' ? undefined : Number(event.target.value))}
                style={{ ...input, width: 120 }}
              />
              <span style={{ color: MUTED }}>/</span>
              <input
                type="number"
                step="0.0001"
                value={effective.longitude ?? ''}
                placeholder="经度"
                onChange={(event) => set('longitude', event.target.value === '' ? undefined : Number(event.target.value))}
                style={{ ...input, width: 120 }}
              />
            </div>
          </Row>
          <Row label="显示名称">
            <input
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

      <Row label={`刷新间隔（分钟，当前 ${effective.refreshMinutes}）`}>
        <input
          type="range"
          min={5}
          max={120}
          step={5}
          value={effective.refreshMinutes}
          onChange={(event) => set('refreshMinutes', Number(event.target.value))}
          style={{ flex: 1, accentColor: ACCENT }}
        />
      </Row>

      {notice !== null && <div style={{ color: '#d43c3c', fontSize: 12.5, marginTop: 8 }}>{notice}</div>}
      {snapshot.mode === 'memory' && (
        <div style={{ color: MUTED, fontSize: 12.5, marginTop: 8 }}>
          当前连接为进程内模式，配置仅在本次会话生效。
        </div>
      )}
      {props.close !== undefined && (
        <button type="button" onClick={props.close} style={{ marginTop: 16, ...inputButton }}>
          完成
        </button>
      )}
    </div>
  )
}

function Row(props: { label: string; children: ReactElement | string }): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', marginBottom: 8, background: BG_ROW, borderRadius: 10 }}>
      <div style={{ fontSize: 13, flex: '0 0 auto' }}>{props.label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{props.children}</div>
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
  background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
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
