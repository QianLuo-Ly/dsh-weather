/**
 * WMO weather interpretation codes → Chinese label + emoji (Open-Meteo
 * `weather_code`). The emoji is the whole browser-tab icon, so each code gets its
 * own intensity glyph; the title also prints the label.
 */
import type { WeatherData } from './weather-api'
import { pad2 } from './format'

export interface ConditionInfo {
  label: string
  emoji: string
}

/** WMO code families — the single source of truth for weather-code semantics; do not hand-roll another list. */
export const CLEAR_CODES = new Set([0, 1])
export const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82])
// 99 (thunderstorm with heavy hail) belongs here — it IS a thunderstorm.
export const THUNDER_CODES = new Set([95, 96, 99])
export const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])
export const HEAVY_RAIN_CODES = new Set([65, 82, 99])
export const HEAVY_SNOW_CODES = new Set([75, 86])
/** Any code that produces precipitation on the ground — rain OR snow. */
export const PRECIP_CODES = new Set([...RAIN_CODES, ...THUNDER_CODES, ...SNOW_CODES])

/**
 * Shared rule thresholds, all metric (°C / km/h / mm/h); `danger` is reserved
 * for actually hazardous conditions, and the display unit never changes rules.
 */
export const HEAT_WARN_C = 35
/** 40 °C is China's red heat-wave line; below it 35 °C is merely a hot day. */
export const HEAT_DANGER_C = 40
/** Frost advisory threshold. Reaching 0 °C is a frost warning, not a cold alert. */
export const FROST_C = 0
export const COLD_WARN_C = -8
export const COLD_DANGER_C = -15
export const WIND_WARN_KMH = 60
/** Beaufort 10 sustained wind — the level that actually damages things. */
export const WIND_DANGER_KMH = 89
/** Severe-thunderstorm gust criterion (58 mph ≈ 93 km/h), rounded down. */
export const GUST_WARN_KMH = 89
export const GUST_DANGER_KMH = 118
/**
 * Hourly rain-rate tiers (mm/h) — graded by rate, not accumulation: QX/T 416-2018
 * Table 1 sets the hourly tiers (≥ 20, ≥ 80 mm/h); lower bands follow the NWS/FMH hourly convention (0.25 / 2.5 / 7.6).
 */
export const RAIN_TRACE_MMH = 0.25
export const RAIN_MODERATE_MMH = 2.5
export const RAIN_HEAVY_MMH = 7.6
/** QX/T 416-2018: hourly rain ≥ 20 mm/h starts 强对流天气. */
export const RAIN_TORRENTIAL_MMH = 20
/** Same standard: ≥ 80 mm/h is 超强对流天气. */
export const RAIN_EXTREME_MMH = 80
/** GB/T 28592-2012 24 h accumulation gates (mm): 暴雨 / 大暴雨 / 特大暴雨. */
export const DELUGE_24H_MM = 50
export const DOWNPOUR_24H_MM = 100
export const CLOUDBURST_24H_MM = 250
/**
 * 中国气象局令第 16 号 defines short-duration 暴雨 by accumulation: blue 12h ≥ 50,
 * yellow 6h ≥ 50, orange 3h ≥ 50, red 3h ≥ 100 mm.
 */
export const DELUGE_12H_MM = 50
export const DELUGE_6H_MM = 50
export const DELUGE_3H_MM = 50
export const DELUGE_RED_3H_MM = 100
/**
 * GB/T 28592-2012 降雪量 (water-equivalent mm, pure snow) 24 h grades: 小雪 0.1–2.4,
 * 中雪 2.5–4.9, 大雪 5.0–9.9, 暴雪 10.0–19.9, 大暴雪 20.0–29.9.
 */
export const SNOW_MODERATE_24H_MM = 2.5
export const SNOW_HEAVY_24H_MM = 5
export const SNOWSTORM_24H_MM = 10
/** Fresh-snow depth (cm) → water equivalent, turning the API's `snowfall_sum` into the standard's mm. */
export const SNOW_CM_PER_MM_WE = 10
/**
 * Visibility thresholds (km): ICAO/WMO FG (fog) is < 1 km, BR (mist)/HZ (haze)
 * 1–5 km; humidity tells them apart — wet or precipitating is mist, dry is haze.
 */
export const FOG_VIS_KM = 1
export const MIST_VIS_KM = 5
/** Below this relative humidity, 1–5 km visibility is 霾 rather than 轻雾. */
export const HAZE_RH_MAX = 80
/** Cloud-cover grades (%), from octas: 晴 < 2/8, 少云 < 4/8, 多云 < 7/8. */
export const CLOUD_CLEAR_PCT = 25
export const CLOUD_PARTLY_PCT = 50
export const CLOUD_OVERCAST_PCT = 87.5
/** Freezing rain/drizzle codes: 56/57/66/67. The model has no ground-icing variable, so only the code gives this category. */
export const FREEZING_RAIN_CODES = new Set([56, 57, 66, 67])
/**
 * Rain rate that upgrades a heavy-rain code from `info` to a warning. Deliberately
 * separate from {@link SNOW_WARN_MMH} (mm/h of rain ≠ snow water equivalent).
 */
export const RAIN_WARN_MMH = 2
/** Snowfall is reported in water equivalent: ~2 mm/h ≈ 2 cm of fresh snow. */
export const SNOW_WARN_MMH = 2
export const WIND_ADVICE_KMH = 40

const DAY: Record<number, ConditionInfo> = {
  0: { label: '晴', emoji: '☀️' },
  1: { label: '大致晴朗', emoji: '🌤️' },
  2: { label: '多云', emoji: '⛅' },
  3: { label: '阴', emoji: '☁️' },
  45: { label: '雾', emoji: '🌫️' },
  48: { label: '冻雾', emoji: '🌫️' },
  51: { label: '毛毛雨', emoji: '🌦️' },
  53: { label: '细雨', emoji: '🌦️' },
  55: { label: '浓毛毛雨', emoji: '🌧️' },
  56: { label: '冻毛毛雨', emoji: '🧊' },
  57: { label: '强冻毛毛雨', emoji: '🌧️' },
  61: { label: '小雨', emoji: '🌧️' },
  63: { label: '中雨', emoji: '🌧️' },
  65: { label: '大雨', emoji: '⛈️' },
  66: { label: '冻雨', emoji: '🧊' },
  67: { label: '强冻雨', emoji: '🧊' },
  71: { label: '小雪', emoji: '❄️' },
  73: { label: '中雪', emoji: '🌨️' },
  75: { label: '大雪', emoji: '⛄' },
  77: { label: '米雪', emoji: '🧊' },
  80: { label: '阵雨', emoji: '🌦️' },
  81: { label: '强阵雨', emoji: '🌧️' },
  82: { label: '暴阵雨', emoji: '🌧️' },
  85: { label: '阵雪', emoji: '❄️' },
  86: { label: '强阵雪', emoji: '⛄' },
  95: { label: '雷阵雨', emoji: '⛈️' },
  // 96/99 officially mean hail, but we label them 雷雨: Open-Meteo's hail codes are
  // convective-parameterisation artifacts, and 冰雹 never appears in the UI.
  96: { label: '雷雨', emoji: '⛈️' },
  99: { label: '强雷雨', emoji: '⛈️' },
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

/**
 * Every emoji {@link describeCondition} can return, so consumers can recognize a
 * title this plugin wrote (hooks.ts builds its prefix pattern from this).
 */
export const CONDITION_EMOJIS: string[] = [...new Set([
  ...Object.values(DAY).map((entry) => entry.emoji),
  ...Object.values(NIGHT).map((entry) => entry.emoji),
  '🌡️',
])]

/** Short hour label like `14时` / `08时`, honoring the API's local time. */
export function hourLabel(iso: string): string {
  const match = /T(\d{2})/.exec(iso)
  if (match === null) return iso
  return `${match[1]}时`
}

/**
 * Weekday or short date label for a daily row. The feed starts its grid at the
 * location's "today", so the first rows are labelled by position, not by date.
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
  // Snow is checked before rain: "记得带伞" is wrong advice for snowfall, and a
  // snow code must never fall through to the "天气平稳" default.
  if (SNOW_CODES.has(code)) {
    return { icon: '❄️', text: '有降雪，注意路面湿滑' }
  }
  if (PRECIP_CODES.has(code)) {
    return { icon: '☂️', text: '有降水，出门记得带伞' }
  }
  if (current.temperature >= HEAT_WARN_C) {
    return { icon: '🥵', text: '高温天气，注意防暑补水' }
  }
  if (current.temperature <= COLD_WARN_C) {
    return { icon: '🧣', text: '严寒天气，注意防寒保暖' }
  }
  // Wind is checked before the clear-sky branches: a clear 50 km/h day must not be
  // advised "天气晴好", and the 40–60 km/h band surfaces nowhere else in the UI.
  if (current.windSpeed !== undefined && current.windSpeed >= WIND_ADVICE_KMH) {
    return { icon: '💨', text: '风力较大，注意高空坠物' }
  }
  if (current.temperature >= 28 && isClear) {
    return { icon: '😎', text: '晴热天气，出门做好防晒' }
  }
  if (isClear) {
    return { icon: '🌞', text: '天气晴好，适合户外活动' }
  }
  if ((today?.precipProb ?? 0) >= 60) {
    return { icon: '🌧️', text: '今日降水概率较高，备好雨具' }
  }
  if (data.air !== undefined && data.air.aqi !== undefined && data.air.aqi > 150) {
    return { icon: '😷', text: '空气质量较差，外出建议佩戴口罩' }
  }
  return { icon: '🌤️', text: '天气平稳，适合日常出行' }
}

/**
 * Short minute total like `45 分钟` / `1.5 小时`; exported so the rain strip's
 * summary describes the same span (N steps = N×15 minutes).
 */
export function durationLabel(minutes: number): string {
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
 * Rounded "minutes from now" for rain-soon messaging that never inflates a near
 * onset: sub-5 minutes reads as 1–5, everything else rounds to the nearest 5.
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
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** `7月5日` for a Date — kept short for the header row. */
export function clockDate(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/** `HH:MM` for a millisecond timestamp (e.g. the stale-snapshot "updated at"). */
export function hhmm(millis: number): string {
  return clockTime(new Date(millis))
}
