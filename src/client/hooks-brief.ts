/**
 * Daily weather brief: push a morning brief (today's outlook) and an evening
 * brief (tomorrow's) at the configured times, at most once per slot per day.
 *
 * Everything the brief needs to dedupe and schedule lives here — the localStorage
 * key prefix/retention, the catch-up window and the minute-aligned tick — so the
 * rest of `hooks.ts` never has to know about `dsh-weather-brief-*` keys.
 */
import { useEffect, useRef } from 'react'
import { parseClockTime, type WeatherConfig } from '../config-shared'
import { describeCondition } from './condition'
import { dayKey, payloadMatchesLocation } from './location-match'
import { tempText } from './units'
import type { GeoLocation, WeatherData } from './weather-api'

/** localStorage key prefix for the once-per-slot brief dedupe. */
const BRIEF_KEY_PREFIX = 'dsh-weather-brief-'
/** How old a brief dedupe key may get before it is pruned. */
const BRIEF_KEY_RETENTION_DAYS = 3
/**
 * Catch-up window (minutes after the target time). A slot may still fire when a
 * throttled background tab or system sleep pushed the wake-up past its target —
 * but never hours later: simply opening the page at night must not push the
 * morning brief (and must not fire morning + evening together).
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

/** Drop dedupe keys older than the retention window (they would otherwise
 * accumulate two per day forever). */
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
 *
 * Validation rides the shared `CLOCK_TIME_PATTERN` through {@link parseClockTime}
 * rather than a second copy of the regex (config-shared declares itself the
 * single source), and the hour/minute come from the NORMALIZED string — never
 * from capture groups, which once produced the value `"HH:undefined"`.
 */
function clockMinutes(clock: string): number | undefined {
  const normalized = parseClockTime(clock)
  if (normalized === undefined) return undefined
  const [hours, minutes] = normalized.split(':')
  if (hours === undefined || minutes === undefined) return undefined
  return Number(hours) * 60 + Number(minutes)
}

/**
 * Push a morning brief (today's outlook) and an evening brief (tomorrow's) at
 * the configured times, at most once per slot per day. A slot only fires within
 * {@link BRIEF_GRACE_MINUTES} of its target (so enabling the feature or editing
 * the time at 22:00 cannot push a stale "今日天气"), the payload must be fresh
 * (a stale snapshot is skipped), and the dedupe mark is written only after the
 * notification was actually constructed — a failed construction is retried on
 * the next tick instead of burning the day's slot.
 *
 * Times are interpreted in the DEVICE's timezone (the brief is "your morning",
 * not the city's); multi-tab double-sends are collapsed by the shared storage
 * key and the identical notification `tag`.
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
  // Latest payload/staleness read by the minute tick without restarting it on
  // every refresh (restarting made each auto-refresh run an immediate check).
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
      // The brief names `placeName` but reads this payload: they must be the same
      // city, or a switch inside the catch-up window burns the day's slot with
      // the previous city's weather (and the localStorage mark then suppresses
      // the correct brief).
      if (!payloadMatchesLocation(current, locationRef.current)) return null
      const day = slot === 'morning' ? current.daily[0] : current.daily[1]
      if (day === undefined) return null
      // Skip the slot rather than announce `0°C ~ 0°C`: the feed may omit a
      // day's temperatures, and a fabricated range is worse than a silent brief.
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
      // The permission is re-read on every tick, not only when the effect mounts.
      // The gate used to sit above the timer, so granting permission while the
      // brief was being enabled (the common first-run path: the write lands while
      // the permission dialog is still open) left the effect armed with
      // 'default' and no timer at all — the brief stayed silent until a reload.
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
          // and retry on the next tick instead of marking it as sent.
          continue
        }
        sentRef.current.add(storageKey)
        markBriefSent(storageKey)
      }
      pruneBriefKeys(dayKey(now))
    }

    // Minute-aligned tick keeps the check cheap; correctness comes from the
    // window comparison above, not from the tick landing exactly.
    let timer = 0
    const loop = (): void => {
      check()
      timer = window.setTimeout(loop, 60_000 - (Date.now() % 60_000) + 20)
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
