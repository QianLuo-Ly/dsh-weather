/**
 * City search field: a debounced Open-Meteo geocoding lookup with a keyboard-
 * and pointer-driven suggestion dropdown, plus a ☆ toggle to save a result
 * without switching to it.
 *
 * All of the dropdown machinery (query, results, active row, outside-click
 * guard, debounce) is local here; the selected place is handed back through
 * `savedCities.selectPlace`.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { MAX_NAME_LENGTH, MAX_SAVED_LOCATIONS, type WeatherConfig } from '../config-shared'
import { Glyph } from './icons'
import { searchCity, type GeoLocation } from './weather-api'
import type { SavedLocationsState } from './hooks'
import {
  ACCENT,
  DANGER,
  MUTED,
  Row,
  input,
  searchingBadge,
  suggestionCoords,
  suggestionLines,
  suggestionName,
  suggestionPanel,
  suggestionPick,
  suggestionPin,
  suggestionRow,
  suggestionStar,
} from './settings-shared'

export function CitySearchField(props: {
  effective: WeatherConfig
  savedCities: SavedLocationsState
  /** Typing in the query retracts the page's previous notice. */
  onEdit: () => void
  /** Id prefix owned by the location section, so the row label can point here. */
  idPrefix: string
}): ReactElement {
  const { effective, savedCities, onEdit, idPrefix } = props
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<GeoLocation[]>([])
  const [searching, setSearching] = useState(false)
  /** A failed lookup must say so — an empty list means "no match", not "error". */
  const [searchFailed, setSearchFailed] = useState(false)
  /** Keyboard-highlighted suggestion; mirrors the pointer on hover. */
  const [activeIndex, setActiveIndex] = useState(0)
  const skipNextSearchRef = useRef(false)
  const searchBoxRef = useRef<HTMLDivElement>(null)
  const atSavedLimit = savedCities.saved.length >= MAX_SAVED_LOCATIONS

  // Manual↔auto switches must not leave a stale suggestion dropdown behind.
  useEffect(() => {
    setSuggestions([])
    setSearching(false)
    setSearchFailed(false)
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

  // 250ms 防抖：避免每次击键都请求 Open-Meteo Geocoding。
  useEffect(() => {
    if (skipNextSearchRef.current) {
      // Programmatic value (a picked result) — do not re-open the dropdown.
      // The superseded run's cleanup set `cancelled`, so its `.finally` never
      // cleared the flag; clear it here or "搜索中…" sticks until the next search.
      skipNextSearchRef.current = false
      setSearching(false)
      return
    }
    const trimmed = search.trim()
    if (trimmed === '') {
      setSuggestions([])
      setSearching(false)
      setSearchFailed(false)
      setActiveIndex(0)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      setSearchFailed(false)
      void searchCity(trimmed, 5)
        .then((results) => {
          if (!cancelled) {
            setSuggestions(results)
            setSearchFailed(false)
            setActiveIndex(0)
          }
        })
        .catch(() => {
          // Distinguish a dead lookup from an empty one: clearing the list
          // silently made a network failure look like "no such city".
          if (!cancelled) {
            setSuggestions([])
            setSearchFailed(true)
          }
        })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [search])

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
      // Same budget as the input it feeds (`maxLength`), so a long qualified
      // name cannot push a controlled value past the field's own limit.
      setSearch(place.name.slice(0, MAX_NAME_LENGTH))
    }
    setSuggestions([])
  }

  return (
    <Row label="城市搜索" labelFor={`${idPrefix}-search`}>
      <div ref={searchBoxRef} style={{ position: 'relative', flex: 1 }}>
        <input
          id={`${idPrefix}-search`}
          type="text"
          value={search}
          maxLength={MAX_NAME_LENGTH}
          placeholder="输入城市名，如：北京 / Beijing"
          onChange={(event) => { onEdit(); setSearch(event.target.value); setActiveIndex(0) }}
          onKeyDown={(event) => {
            // An IME confirming a candidate also delivers Enter (and, on
            // some browsers, a 229 keyCode). Acting on those would replace
            // the user's in-progress pinyin with whichever row is active.
            if (event.nativeEvent.isComposing || event.keyCode === 229) return
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
          aria-controls={suggestions.length > 0 ? `${idPrefix}-suggestions` : undefined}
          aria-activedescendant={suggestions.length > 0 ? `${idPrefix}-suggestion-${activeIndex}` : undefined}
        />
        {searching && <span style={searchingBadge}>搜索中…</span>}
        {searchFailed && !searching && (
          <div role="status" style={{ marginTop: 4, fontSize: 12, color: DANGER }}>
            城市搜索失败，请检查网络后重试
          </div>
        )}
        {suggestions.length > 0 && (
          <div
            id={`${idPrefix}-suggestions`}
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
                  id={`${idPrefix}-suggestion-${index}`}
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
  )
}
