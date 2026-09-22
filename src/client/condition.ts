/**
 * WMO weather interpretation codes → Chinese label + emoji.
 * See https://open-meteo.com/en/docs (weather variable `weather_code`).
 *
 * The emoji IS the whole icon on the browser-tab title, so each code gets the
 * glyph for the intensity it names rather than a family default: snow splits
 * ❄️ 小雪/阵雪 · 🌨️ 中雪 · ⛄ 大雪/强阵雪 · 🧊 米雪, drizzle is 🌦️ while rain is
 * 🌧️, freezing precipitation carries 🧊, and 🌩️ is reserved for the
 * hail-bearing thunderstorm codes (⛈️ stays the plain-thunder and heavy-rain
 * glyph). A shared glyph only survives where two codes name the same thing —
 * 雾/冻雾, 冻雨/冻毛毛雨/米雪, 小雨/阵雨, 中雨/强阵雨, 大雪/强阵雪.
 * The tab title prints the label too, because 🌧️ alone cannot say 小雨 vs 中雨.
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
// 99 (thunderstorm with heavy hail) belongs here: it IS a thunderstorm, and
// without it the hail code fell through `weatherAdvice`'s precipitation branch
// to "天气平稳，适合日常出行" — a hail storm announced as a calm day.
export const THUNDER_CODES = new Set([95, 96, 99])
export const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])
export const HEAVY_RAIN_CODES = new Set([65, 82, 99])
export const HEAVY_SNOW_CODES = new Set([75, 86])
/** Any code that produces precipitation on the ground — rain OR snow. */
export const PRECIP_CODES = new Set([...RAIN_CODES, ...THUNDER_CODES, ...SNOW_CODES])

/**
 * Shared rule thresholds. All values are metric (°C / km/h / mm/h) because the
 * feed is metric-only; the display unit never changes the rules.
 *
 * A WMO code alone says what kind of weather it is, never how hard it hits, so
 * every family splits into two tiers and the `danger` tier is reserved for
 * conditions that are actually hazardous. Calling an ordinary summer day
 * "danger" is how an alert feed stops being believed.
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
 * 小时雨强的分档线（mm/h）——雨的**强弱**按速率分，不按累计量分。
 *
 * 量纲必须分清，这是三套不同轴的标准：
 * - GB/T 28592-2012《降水量等级》：小雨/中雨/大雨/暴雨是 12/24 小时**累计量**
 *   （暴雨 = 24h ≥ 50 mm），标不了「此刻雨有多大」；
 * - QX/T 416-2018《强对流天气等级》表 1：小时降雨量 ≥ 20 且 < 80 mm 为「强对流
 *   天气」、≥ 80 mm 为「超强对流天气」—— 这是小时尺度上国家层面唯一有定义的分级；
 * - 中间的小/中/大雨分档用小时雨强惯例（NWS/FMH：0.25 / 2.5 / 7.6 mm/h）。
 *
 * 一场 60 mm/24h 的暴雨摊到每小时只有 2.5 mm，而一个 30 分钟的对流单体能让某一
 * 小时到 25 mm —— 累计量只在描述「今天下了多少」时出场。
 */
export const RAIN_TRACE_MMH = 0.25
export const RAIN_MODERATE_MMH = 2.5
export const RAIN_HEAVY_MMH = 7.6
/** QX/T 416-2018《强对流天气等级》：小时降雨量 ≥ 20 mm 起算强对流天气。 */
export const RAIN_TORRENTIAL_MMH = 20
/** 同上：小时降雨量 ≥ 80 mm 为超强对流天气。 */
export const RAIN_EXTREME_MMH = 80
/** GB/T 28592-2012 的 24 小时累计等级门槛（mm）：暴雨 / 大暴雨 / 特大暴雨。 */
export const DELUGE_24H_MM = 50
export const DOWNPOUR_24H_MM = 100
export const CLOUDBURST_24H_MM = 250
/**
 * 短历时暴雨：中国气象局令第 16 号《气象灾害预警信号发布与传播办法》用更短的
 * 累计量定义暴雨，这才是「几小时内下了暴雨」的合法依据 ——
 * 蓝色 12h ≥ 50 mm、黄色 6h ≥ 50 mm、橙色 3h ≥ 50 mm、红色 3h ≥ 100 mm。
 * 有逐时降水就能算这三个滚动累计，不必再拿 20 mm/h 冒充暴雨。
 */
export const DELUGE_12H_MM = 50
export const DELUGE_6H_MM = 50
export const DELUGE_3H_MM = 50
export const DELUGE_RED_3H_MM = 100
/**
 * GB/T 28592-2012 的**降雪量**（水当量 mm，且只计纯雪、不含雨夹雪）24 小时等级：
 * 小雪 0.1–2.4、中雪 2.5–4.9、大雪 5.0–9.9、暴雪 10.0–19.9、大暴雪 20.0–29.9。
 * 国标只用累计量定雪的等级，所以在场雪只写「降雪」，等级留给日累计。
 */
export const SNOW_MODERATE_24H_MM = 2.5
export const SNOW_HEAVY_24H_MM = 5
export const SNOWSTORM_24H_MM = 10
/** 新雪深度（cm）→ 水当量的换算比，用于把接口的 `snowfall_sum` 折成国标要的 mm。 */
export const SNOW_CM_PER_MM_WE = 10
/**
 * 能见度分级门槛（km）。ICAO/WMO 的 FG（雾）是 < 1 km，BR（轻雾）/HZ（霾）是
 * 1–5 km —— 两者靠湿度区分：湿的（或有降水）叫轻雾，干的叫霾。
 */
export const FOG_VIS_KM = 1
export const MIST_VIS_KM = 5
/** 相对湿度低于此值时，1–5 km 的能见度判为霾而不是轻雾。 */
export const HAZE_RH_MAX = 80
/** 总云量的中文分级门槛（%），按八分云量折算：晴 < 2/8、少云 < 4/8、多云 < 7/8。 */
export const CLOUD_CLEAR_PCT = 25
export const CLOUD_PARTLY_PCT = 50
export const CLOUD_OVERCAST_PCT = 87.5
/** 冻雨/冻毛毛雨：56/57/66/67。模式里没有「地面结冰」变量，只有码能给出这个类别。 */
export const FREEZING_RAIN_CODES = new Set([56, 57, 66, 67])
/**
 * Rain rate that upgrades a heavy-rain code from `info` to a warning. Same
 * number as {@link SNOW_WARN_MMH} today, deliberately a separate constant: it
 * measures millimetres of rain per hour, not the water equivalent of snow, and
 * tuning one must not silently retune the other (the rain branch used to read
 * the snow constant).
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
  // 96/99 在 WMO 表里带「冰雹」。我们刻意只写成雷雨：Open-Meteo 的冰雹码是模式
  // 对流参数化的产物，天河区 2026-08–09 一个月里出现了 19 个 96 码小时（全部雨强
  // < 13 mm/h），而广州真正的冰雹一年只有春季那几天。宁可少说，不可把模式的类别
  // 当成落地的冰雹播报 —— 用户界面里不再出现「冰雹」二字。
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
 * Every emoji {@link describeCondition} can return, for consumers that must
 * recognize a title THIS plugin wrote (hooks.ts builds its prefix pattern from
 * this list). Derived from both tables instead of hand-listed: the old literal
 * set silently missed ⛄ / 🧊 / 🌩️, and a glyph added to a table above must not
 * be able to leave the title logic behind again.
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
  // Snow is checked before rain: "记得带伞" is the wrong advice for snowfall, and
  // a snow code must never fall through to the "天气平稳" default — which is what
  // happened while SNOW_CODES was missing from PRECIP_CODES.
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
