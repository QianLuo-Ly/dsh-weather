/**
 * 天气栏 / 恶劣天气提醒 switches. Owns the notification-permission hint the switch rows share; the permission
 * value itself is held by the page because the brief section shows the same hint.
 */
import { useId, type ReactElement } from 'react'
import type { WeatherConfig } from '../../config-shared'
import { DANGER, MUTED, Row, checkbox, type FieldSetter } from './shared'

export function TogglesSection(props: {
  effective: WeatherConfig
  set: FieldSetter
  permission: NotificationPermission
  onRequestPermission: () => void
}): ReactElement {
  const { effective, set, permission, onRequestPermission } = props
  const ids = useId()
  const permissionHint = permission === 'denied'
    ? '通知权限已被浏览器拒绝，请在站点设置中允许后重新开启。'
    : permission === 'default'
      ? '浏览器通知尚未授权——开启时请允许，否则提醒与简报不会推送。'
      : null

  return (
    <>
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
            if (event.target.checked) onRequestPermission()
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
        强降雨 / 雷暴 / 高温 / 大风 / 强降雪等确实恶劣的天气时发送浏览器通知。
      </div>
    </>
  )
}
