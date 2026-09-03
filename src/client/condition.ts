/**
 * WMO weather interpretation codes → Chinese label + emoji.
 * See https://open-meteo.com/en/docs (weather variable `weather_code`).
 */
import type { WeatherData } from './weather-api'

export interface ConditionInfo {
  label: string
  emoji: string
}

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

/** Weekday or short date label for a daily row. */
export function dayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((date.getTime() - startOfToday.getTime()) / 86_400_000)
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '明天'
  if (diffDays === 2) return '后天'
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

const RAINY_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]

/** One-line, rule-based activity advice for the current conditions. */
export function weatherAdvice(data: WeatherData): { icon: string; text: string } {
  const current = data.current
  const today = data.daily[0]
  if (RAINY_CODES.includes(current.weatherCode)) {
    return { icon: '☂️', text: '有降水，出门记得带伞' }
  }
  if (current.temperature >= 35) {
    return { icon: '🥵', text: '高温天气，注意防暑补水' }
  }
  if (current.temperature <= 0) {
    return { icon: '🧣', text: '严寒天气，注意防寒保暖' }
  }
  if (current.temperature >= 28 && (current.weatherCode === 0 || current.weatherCode === 1)) {
    return { icon: '😎', text: '晴热天气，出门做好防晒' }
  }
  if (current.weatherCode === 0 || current.weatherCode === 1) {
    return { icon: '🌞', text: '天气晴好，适合户外活动' }
  }
  if (current.windSpeed >= 40) {
    return { icon: '💨', text: '风力较大，注意高空坠物' }
  }
  if ((today?.precipProb ?? 0) >= 60) {
    return { icon: '🌧️', text: '今日降水概率较高，备好雨具' }
  }
  if (data.air !== undefined && data.air.aqi > 150) {
    return { icon: '😷', text: '空气质量较差，外出建议佩戴口罩' }
  }
  return { icon: '🌤️', text: '天气平稳，适合日常出行' }
}

/** Short minute total like `45 分钟` / `1.5 小时` / `12 小时`. */
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
 * Compact rain hint for the weather-bar subtitle — only shown when rain is
 * imminent (currently falling, or starting within 2 h).
 */
export function rainSoonShortText(rain: { rainingNow: boolean; onsetMinutes?: number }): string | undefined {
  if (rain.rainingNow) return '正在下雨'
  const onset = rain.onsetMinutes
  if (onset === undefined || onset > 120) return undefined
  const rounded = Math.max(5, Math.round(onset / 5) * 5)
  return `约 ${rounded} 分钟后有雨`
}

/** 8-point Chinese wind-direction label (`0°`→`北风`, `90°`→`东风`). */
export function windDirectionText(degrees?: number): string | undefined {
  if (degrees === undefined) return undefined
  const names = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % 8
  return `${names[index]}风`
}
