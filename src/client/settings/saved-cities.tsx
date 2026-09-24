/**
 * Saved-city list: the ＋收藏当前位置 action and one row per stored city (switch / two-step delete). All state
 * and writes live in `useSavedLocations`; this module is only the view over it.
 */
import { useState, type ReactElement } from 'react'
import { MAX_SAVED_LOCATIONS } from '../../config-shared'
import { CURRENT_LOCATION_LABEL } from '../data/geolocation'
import type { SavedLocationsState } from '../hooks/weather'
import { ACCENT, BG_ROW, BORDER, DANGER, INPUT_BG, MUTED, inputButton } from './shared'

export function SavedCitiesList(props: { savedCities: SavedLocationsState }): ReactElement {
  const { savedCities } = props
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const atSavedLimit = savedCities.saved.length >= MAX_SAVED_LOCATIONS

  return (
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
          {`＋ 收藏${CURRENT_LOCATION_LABEL}`}
        </button>
      </div>
      {savedCities.saved.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 12 }}>
          {`还没有收藏城市——搜索城市后点 ☆ 收藏，或收藏${CURRENT_LOCATION_LABEL}。`}
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
  )
}
