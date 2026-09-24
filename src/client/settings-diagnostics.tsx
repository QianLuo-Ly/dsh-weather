/**
 * Location diagnostics: run the GPS/IP probes on demand and show the results. The run counter both labels a run and invalidates it, so a slow probe cannot overwrite a newer one and unmounting drops the answer.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { WeatherConfig } from '../config-shared'
import { runLocationDiagnostics, type LocationDiagnostics } from './geolocation'
import { BG_ROW, BORDER, FG, MUTED, inputButton, type Notify } from './settings-shared'

/** Chinese label for a browser-fix precision tier (see weather-api.ts). */
function precisionLabel(precision: string | undefined): string {
  if (precision === 'district') return '区级'
  if (precision === 'city') return '市级'
  return '未分级'
}

export function DiagnosticsSection(props: { effective: WeatherConfig; notify: Notify }): ReactElement {
  const { effective, notify } = props
  const [diag, setDiag] = useState<LocationDiagnostics | null>(null)
  const [diagBusy, setDiagBusy] = useState(false)
  const diagRunRef = useRef(0)

  // Invalidate any in-flight diagnostics when the block unmounts.
  useEffect(() => () => { diagRunRef.current += 1 }, [])

  return (
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
  )
}
