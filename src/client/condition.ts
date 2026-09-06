/**
 * WMO weather interpretation codes → Chinese label + emoji.
 * See https://open-meteo.com/en/docs (weather variable `weather_code`).
 */
import type { WeatherData } from './weather-api'

export interface ConditionInfo {
  label: string
  emoji: string
}

/**
 * WMO code families — the single source of truth for weather-code semantics.
 * `icons.tsx` picks the glyph, `weatherAdvice` picks the umbrella hint and
 * `evaluateAlerts` (weather-api.ts) picks the severe-weather alert from these
 * sets. Do not hand-roll another code list elsewhere.
 */
export const CLEAR_CODES = new Set([0, 1])
export const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82])
export const THUNDER_CODES = new Set([95, 96])
export const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])
export const HEAVY_RAIN_CODES = new Set([65, 82, 99])
export const HEAVY_SNOW_CODES = new Set([75, 86])
/** Any code that produces liquid/solid precipitation on the ground. */
export const PRECIP_CODES = new Set([...RAIN_CODES, ...THUNDER_CODES, ...HEAVY_RAIN_CODES])
/** Heavy rain + thunder — the "强降雨/雷暴" severe family (lead-time scan). */
export const STORM_CODES = new Set([...HEAVY_RAIN_CODES, ...THUNDER_CODES])

/**
 * Shared rule thresholds. All values are metric (°C / km/h) because the feed
 * is metric-only; the display unit never changes the rules.
 */
export const HEAT_C = 35
export const COLD_C = 0
export const WIND_ALERT_KMH = 60
export const WIND_ADVICE_KMH = 40

const DAY: Record<number, ConditionInfo> = {
  0: { label: '晴', emoji: '☀️' },
  1: { label: '大致晴朗', emoji: '🌤️' },
  2: { label: '多云', emoji: '⛅' },
  3: { label: '阴', emoji: '☁️' },
  45: { label: '雾', emoji: '🌫️' },
  48: { label: '冻雾', emoji: '🌫️' },
  51: { label: '毛毛雨', emoji: '🌦️' },
  53: { label: '毛毛雨', emoji: '🌦️' },
  55: { label: '浓毛毛雨', emoji: '🌦️' },
  56: { label: '冻毛毛雨', emoji: '🌧️' },
  57: { label: '强冻毛毛雨', emoji: '🌧️' },
  61: { label: '小雨', emoji: '🌧️' },
  63: { label: '中雨', emoji: '🌧️' },
  65: { label: '大雨', emoji: '🌧️' },
  66: { label: '冻雨', emoji: '🌧️' },
  67: { label: '强冻雨', emoji: '🌧️' },
  71: { label: '小雪', emoji: '❄️' },
  73: { label: '中雪', emoji: '❄️' },
  75: { label: '大雪', emoji: '❄️' },
  77: { label: '米雪', emoji: '🌨️' },
  80: { label: '阵雨', emoji: '🌦️' },
  81: { label: '强阵雨', emoji: '🌦️' },
  82: { label: '暴阵雨', emoji: '⛈️' },
  85: { label: '阵雪', emoji: '🌨️' },
  86: { label: '强阵雪', emoji: '🌨️' },
  95: { label: '雷暴', emoji: '⛈️' },
  96: { label: '雷暴伴冰雹', emoji: '⛈️' },
  99: { label: '强雷暴伴冰雹', emoji: '⛈️' },
}

const NIGHT: Record<number, ConditionInfo> = {
  ...DAY,
  0: { label: '晴', emoji: '🌙' },
  1: { label: '大致晴朗', emoji: '🌙' },
  2: { label: '多云', emoji: '☁️' },
}

/** Map a WMO code (+ day/night flag) to a human-readable condition. */
export function describeCondition(code: number, isDay: boolean): ConditionInfo {
  const table = isDay ? DAY : NIGHT
  return table[code] ?? { label: '未知', emoji: '🌡️' }
}

/** Short hour label like `14时` / `08时`, honoring the API's local time. */
export function hourLabel(iso: string): string {
  const match = /T(\d{2})/.exec(iso)
  if (match === null) return iso
  return `${match[1]}时`
}

/**
 * Weekday or short date label for a daily row. The forecast feed always starts
 * its daily grid at the *location's* "today", so the first rows are labeled by
 * position — comparing calendar dates across browser/location timezones would
 * mislabel "today" near midnight. Later rows fall back to the parsed weekday.
 */
export function dayLabel(iso: string, index = 0): string {
  if (index === 0) return '今天'
  if (index === 1) return '明天'
  if (index === 2) return '后天'
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return weekdays[date.getDay()]
}

/** US AQI level label + badge color (US EPA bands). */
export function aqiInfo(aqi: number): { label: string; color: string } {
  if (aqi <= 50) return { label: '优', color: '#4ade80' }
  if (aqi <= 100) return { label: '良', color: '#facc15' }
  if (aqi <= 150) return { label: '轻度', color: '#fb923c' }
  if (aqi <= 200) return { label: '中度', color: '#f87171' }
  if (aqi <= 300) return { label: '重度', color: '#c084fc' }
  return { label: '严重', color: '#d97757' }
}

/** WHO UV index exposure level label. */
export function uvLevel(uv: number): string {
  if (uv < 3) return '低'
  if (uv < 6) return '中'
  if (uv < 8) return '高'
  if (uv < 11) return '很高'
  return '极高'
}

/** `2026-09-01T06:09` → `06:09`. */
export function timeLabel(iso: string | undefined): string {
  if (iso === undefined) return '--:--'
  const match = /T(\d{2}:\d{2})/.exec(iso)
  return match === null ? iso : match[1]
}

/** One-line, rule-based activity advice for the current conditions. */
export function weatherAdvice(data: WeatherData): { icon: string; text: string } {
  const current = data.current
  const today = data.daily[0]
  const code = current.weatherCode
  const isClear = CLEAR_CODES.has(code)
  const hasPrecip = PRECIP_CODES.has(code)
  if (hasPrecip) {
    return { icon: '☂️', text: '有降水，出门记得带伞' }
  }
  if (current.temperature >= HEAT_C) {
    return { icon: '🥵', text: '高温天气，注意防暑补水' }
  }
  if (current.temperature <= COLD_C) {
    return { icon: '🧣', text: '严寒天气，注意防寒保暖' }
  }
  if (current.temperature >= 28 && isClear) {
    return { icon: '😎', text: '晴热天气，出门做好防晒' }
  }
  if (isClear) {
    return { icon: '🌞', text: '天气晴好，适合户外活动' }
  }
  if (current.windSpeed !== undefined && current.windSpeed >= WIND_ADVICE_KMH) {
    return { icon: '💨', text: '风力较大，注意高空坠物' }
  }
  if ((today?.precipProb ?? 0) >= 60) {
    return { icon: '🌧️', text: '今日降水概率较高，备好雨具' }
  }
  if (data.air !== undefined && data.air.aqi !== undefined && data.air.aqi > 150) {
    return { icon: '😷', text: '空气质量较差，外出建议佩戴口罩' }
  }
  return { icon: '🌤️', text: '天气平稳，适合日常出行' }
}

/** Short minute total like `45 分钟` / `1.5 小时` / `12 小时`. */
function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = minutes / 60
  if (hours >= 10) return `${Math.round(hours)} 小时`
  return `${Math.round(hours * 2) / 2} 小时`
}

/**
 * One-line summary of the upcoming rain, for the popover rain-strip header:
 * `正在下雨，预计持续 45 分钟` / `约 30 分钟后开始下雨` / `近期无明显降雨`.
 */
export function rainTimingText(rain: { rainingNow: boolean; onsetMinutes?: number; durationMinutes?: number }): string {
  if (rain.rainingNow) {
    const duration = rain.durationMinutes
    if (duration !== undefined && duration >= 15 && duration <= 180) {
      return `正在下雨，预计持续 ${durationLabel(duration)}`
    }
    return '正在下雨'
  }
  const onset = rain.onsetMinutes
  if (onset === undefined) return '近期无明显降雨'
  if (onset <= 15) return '即将开始下雨'
  const rounded = onset >= 180 ? `${Math.round(onset / 60)} 小时` : `${onset} 分钟`
  return `约 ${rounded}后开始下雨`
}

/**
 * Rounded "minutes from now" for rain-soon messaging. Never inflates a near
 * onset: sub-5-minute reads as 1–5, anything else rounds to the nearest
 * 5-minute mark (8 → 10), so a notice cannot claim a rain that is minutes
 * away is a quarter of an hour away.
 */
export function rainOnsetRounded(minutes: number): number {
  if (minutes < 1) return 1
  if (minutes < 5) return 5
  return Math.max(5, Math.round(minutes / 5) * 5)
}

/** 8-point Chinese wind-direction label (`0°`→`北风`, `90°`→`东风`). */
export function windDirectionText(degrees?: number): string | undefined {
  if (degrees === undefined) return undefined
  const names = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % 8
  return `${names[index]}风`
}

/** `HH:MM` (24 h) for a Date — used by the chip's live clock. */
export function clockTime(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `7月5日` for a Date — kept short for the header row. */
export function clockDate(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/** `HH:MM` for a millisecond timestamp (e.g. the stale-snapshot "updated at"). */
export function hhmm(millis: number): string {
  return clockTime(new Date(millis))
}
