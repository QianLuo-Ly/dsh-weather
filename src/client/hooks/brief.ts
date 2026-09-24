/**
 * Daily weather brief: a morning brief (today's outlook) and an evening brief
 * (tomorrow's) at the configured times, at most once per slot per day. All the
 * dedupe/scheduling state lives here, so `hooks.ts` never sees the storage keys.
 */
import { useEffect, useRef } from 'react'
import { parseClockTime, type WeatherConfig } from '../../config-shared'
import { describeCondition } from '../data/condition'
import { msToNextMinute } from '../shared/format'
import { dayKey, payloadMatchesLocation } from '../data/location-match'
import { tempText } from '../shared/units'
import type { GeoLocation } from '../data/geolocation'
import type { WeatherData } from '../data/weather-api'

/** localStorage key prefix for the once-per-slot brief dedupe. */
const BRIEF_KEY_PREFIX = 'dsh-weather-brief-'
/** How old a brief dedupe key may get before it is pruned. */
const BRIEF_KEY_RETENTION_DAYS = 3
/**
 * Catch-up window (minutes past the target time): a throttled tab or system
 * sleep may delay a slot past its target, but never by hours — opening the page
 * at night must not push the morning brief.
 */
const BRIEF_GRACE_MINUTES = 120

/** Once-per-day-slot dedupe survives reloads where localStorage is available. */
function briefAlreadySent(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) !== null
  } catch {
    return false
  }
}

function markBriefSent(storageKey: string): void {
  try {
    window.localStorage.setItem(storageKey, '1')
  } catch {
    // storage disabled — the in-session ref still prevents duplicates
  }
}

/** Drop dedupe keys older than the retention window (two accumulate daily). */
function pruneBriefKeys(todayKey: string): void {
  try {
    const cutoff = new Date(`${todayKey}T00:00:00`)
    cutoff.setDate(cutoff.getDate() - BRIEF_KEY_RETENTION_DAYS)
    const stale: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key === null || !key.startsWith(BRIEF_KEY_PREFIX)) continue
      const stamp = key.slice(BRIEF_KEY_PREFIX.length, BRIEF_KEY_PREFIX.length + 10)
      const parsed = new Date(`${stamp}T00:00:00`)
      if (!Number.isNaN(parsed.getTime()) && parsed < cutoff) stale.push(key)
    }
    for (const key of stale) window.localStorage.removeItem(key)
  } catch {
    // storage unavailable — nothing to prune
  }
}

/**
 * Minutes since local midnight for an `HH:MM` string, or undefined when invalid.
 * Validation rides the shared pattern via {@link parseClockTime}, and hour/minute
 * come from the NORMALIZED string — capture groups once yielded `"HH:undefined"`.
 */
function clockMinutes(clock: string): number | undefined {
  const normalized = parseClockTime(clock)
  if (normalized === undefined) return undefined
  const [hours, minutes] = normalized.split(':')
  if (hours === undefined || minutes === undefined) return undefined
  return Number(hours) * 60 + Number(minutes)
}

/**
 * Push a morning (today) and evening (tomorrow) brief at the configured times,
 * at most once per slot per day, only within {@link BRIEF_GRACE_MINUTES} of the
 * target and only from a fresh payload; the mark is written after construction,
 * so a failure retries next tick. Times are the DEVICE's, not the city's.
 */
export function useDailyBrief(options: {
  effective: WeatherConfig
  data: WeatherData | null
  location: GeoLocation | null
  placeName: string
  /** True when `data` is a stale snapshot (last refresh failed). */
  stale: boolean
}): void {
  const { effective, data, location, placeName, stale } = options
  const sentRef = useRef(new Set<string>())
  // Latest payload/staleness read by the tick, which must not restart on refresh.
  const dataRef = useRef(data)
  dataRef.current = data
  const staleRef = useRef(stale)
  staleRef.current = stale
  const locationRef = useRef(location)
  locationRef.current = location

  useEffect(() => {
    if (!effective.enabled || !effective.briefEnabled) return

    const build = (slot: 'morning' | 'evening'): { title: string; body: string } | null => {
      const current = dataRef.current
      if (current === null) return null
      // The brief names `placeName` but reads this payload — they must be the same
      // city, or a switch inside the window burns the slot on stale weather.
      if (!payloadMatchesLocation(current, locationRef.current)) return null
      const day = slot === 'morning' ? current.daily[0] : current.daily[1]
      if (day === undefined) return null
      // Skip rather than announce `0°C ~ 0°C` — the feed may omit a day's temps.
      if (day.tempMin === undefined || day.tempMax === undefined) return null
      const condition = describeCondition(day.weatherCode, true)
      const range = `${tempText(day.tempMin, effective.units)} ~ ${tempText(day.tempMax, effective.units)}`
      const rain = day.precipProb !== undefined && day.precipProb > 0 ? ` · 降水 ${day.precipProb}%` : ''
      return {
        title: `${slot === 'morning' ? '☀️ 今日天气' : '🌙 明日天气'} · ${placeName}`,
        body: `${condition.emoji} ${condition.label} ${range}${rain}`,
      }
    }

    const check = (): void => {
      const now = new Date()
      if (staleRef.current) return
      // Re-read permission every tick: the gate once sat above the timer, so
      // granting permission while enabling the brief left it silent until reload.
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      for (const slot of ['morning', 'evening'] as const) {
        const wanted = slot === 'morning' ? effective.briefMorning : effective.briefEvening
        const target = clockMinutes(wanted)
        if (target === undefined) continue
        const delta = nowMinutes - target
        // Only within the catch-up window: never fire hours late.
        if (delta < 0 || delta > BRIEF_GRACE_MINUTES) continue
        const storageKey = `${BRIEF_KEY_PREFIX}${dayKey(now)}-${slot}`
        if (sentRef.current.has(storageKey) || briefAlreadySent(storageKey)) continue
        const payload = build(slot)
        if (payload === null) continue
        try {
          new Notification(payload.title, { body: payload.body, tag: storageKey })
        } catch {
          // Construction can throw in restricted contexts — keep the slot open
          // and retry next tick instead of marking it as sent.
          continue
        }
        sentRef.current.add(storageKey)
        markBriefSent(storageKey)
      }
      pruneBriefKeys(dayKey(now))
    }

    // Minute-aligned tick; correctness comes from the window check, not the tick.
    let timer = 0
    const loop = (): void => {
      check()
      timer = window.setTimeout(loop, msToNextMinute())
    }
    loop()
    return () => window.clearTimeout(timer)
  }, [
    effective.enabled,
    effective.briefEnabled,
    effective.briefMorning,
    effective.briefEvening,
    effective.units,
    placeName,
  ])
}
