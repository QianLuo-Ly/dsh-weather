/**
 * Describe weather from physical evidence rather than `weather_code`: the code
 * compresses precipitation, convection and cloud into one integer and loses why.
 */
import {
  CLOUD_CLEAR_PCT,
  CLOUD_OVERCAST_PCT,
  CLOUD_PARTLY_PCT,
  CLOUDBURST_24H_MM,
  DELUGE_12H_MM,
  DELUGE_24H_MM,
  DELUGE_3H_MM,
  DELUGE_6H_MM,
  DELUGE_RED_3H_MM,
  DOWNPOUR_24H_MM,
  DUST_CONCENTRATION_MIN,
  DUST_EXTREME_VIS_KM,
  DUST_FINE_RATIO_MAX,
  DUST_PM10_FLOOR,
  DUST_PM10_MIN,
  DUST_SEVERE_VIS_KM,
  FOG_VIS_KM,
  FREEZING_RAIN_CODES,
  HAZE_MILD_VIS_KM,
  HAZE_MODERATE_VIS_KM,
  HAZE_RH_MAX,
  HAZE_SLIGHT_VIS_KM,
  MIST_VIS_KM,
  RAIN_DELUGE_MMH,
  RAIN_EXTREME_MMH,
  RAIN_HEAVY_MMH,
  RAIN_MODERATE_MMH,
  RAIN_TORRENTIAL_MMH,
  RAIN_TRACE_MMH,
  SNOW_CM_PER_MM_WE,
  SNOW_HEAVY_24H_MM,
  SNOW_MODERATE_24H_MM,
  SNOWSTORM_24H_MM,
  THUNDER_CODES,
  WIND_LEVEL3_KMH,
  describeCondition,
} from './condition'
// Numeric formatting lives only in format.ts.
import { compactDistance, pctText, rateText } from '../shared/format'
import type { CurrentWeather, WeatherData } from './weather-api'

/**
 * Icon kinds, deliberately not keyed by WMO code: the icon follows the conclusion
 * we write, not the data source's category. `icons.tsx` only draws the kind.
 */
export type SkyGlyph =
  | 'clear-day'
  | 'clear-night'
  | 'partly-day'
  | 'partly-night'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain-light'
  | 'rain'
  | 'rain-heavy'
  | 'freezing-rain'
  | 'freezing-rain-heavy'
  | 'snow-light'
  | 'snow'
  | 'snow-heavy'
  | 'snow-grains'
  | 'thunder'
  | 'unknown'

/** All evidence needed to describe the sky. Missing values stay undefined, never 0. */
export interface SkyEvidence {
  /** Total precipitation rate (mm/h). */
  precipitation?: number
  /** Continuous part (mm/h, WMO steady rain). */
  rain?: number
  /** Convective part (mm/h, WMO showers). */
  showers?: number
  /** Snowfall rate (cm/h); > 0 is direct evidence of snow. */
  snowfall?: number
  /** Air temperature (°C). */
  temperature?: number
  /** Relative humidity (%). */
  humidity?: number
  /** Visibility (km). */
  visibility?: number
  /** Total cloud cover (%). */
  cloudCover?: number
  /** WMO code, used only for the freezing-rain category and the "maybe thunder" hint. */
  weatherCode?: number
  /** Sustained wind (km/h); tells 浮尘 from 扬沙 by GB/T 20480-2017. */
  windSpeed?: number
  /**
   * CAMS 沙尘浓度 (µg/m³), instantaneous — the PRIMARY dust evidence. The feed's
   * `visibility` cannot serve that role: it is a different model and does not move with
   * the particles (measured r = -0.19 over 30 h at 库尔勒, dust peaking at 997 µg/m³).
   */
  dust?: number
  /** PM10 24 h mean (µg/m³) — the fallback dust test when `dust` is unreported. */
  pm10?: number
  /** PM2.5 24 h mean (µg/m³) — the other half of that fallback. */
  pm25?: number
  isDay: boolean
}

export interface SkyDescription {
  glyph: SkyGlyph
  /** Chinese phrase shown directly in the UI. */
  label: string
  /** The quantity the conclusion rests on, e.g. `降水率 3.2 mm/h`, shown for the user to check. */
  basis?: string
  /** true means a model inference ("maybe"), not a statement. */
  uncertain: boolean
}

/** Visibility only: numeric rule from format.ts; the 公里 suffix is this file's wording. */
const visText = (km: number): string => `${compactDistance(km)} 公里`

/** `undefined` / `NaN` / negatives all count as "no such quantity". */
function finite(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined
}

/**
 * WMO code → icon kind, ONLY as a fallback when evidence is missing (and for the
 * seven-day summaries). 96/99 fall to the plain-thunder icon (hail unsupported).
 */
export function glyphForCode(code: number, isDay: boolean): SkyGlyph {
  if (code === 0 || code === 1) return isDay ? 'clear-day' : 'clear-night'
  if (code === 2) return isDay ? 'partly-day' : 'partly-night'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code === 51 || code === 53 || code === 61 || code === 80) return 'drizzle'
  if (code === 55) return 'rain-light'
  if (code === 56 || code === 66) return 'freezing-rain'
  if (code === 57 || code === 67) return 'freezing-rain-heavy'
  if (code === 63 || code === 81) return 'rain'
  if (code === 65 || code === 82) return 'rain-heavy'
  if (code === 71) return 'snow-light'
  if (code === 73 || code === 85) return 'snow'
  if (code === 75 || code === 86) return 'snow-heavy'
  if (code === 77) return 'snow-grains'
  if (code === 95 || code === 96 || code === 99) return 'thunder'
  return 'unknown'
}

/**
 * Every glyph's emoji, for the places that carry text only — the browser tab title has
 * no room for an icon component, yet must say the same thing the bar says.
 */
const GLYPH_EMOJI: Record<SkyGlyph, string> = {
  'clear-day': '☀️',
  'clear-night': '🌙',
  'partly-day': '🌤️',
  'partly-night': '☁️',
  cloudy: '☁️',
  fog: '🌫️',
  drizzle: '🌦️',
  'rain-light': '🌧️',
  rain: '🌧️',
  'rain-heavy': '🌧️',
  'freezing-rain': '🧊',
  'freezing-rain-heavy': '🧊',
  'snow-light': '❄️',
  snow: '🌨️',
  'snow-heavy': '⛄',
  'snow-grains': '🧊',
  thunder: '⛈️',
  unknown: '🌡️',
}

/** The emoji for a description's glyph — the tab title's half of {@link describeSky}. */
export function glyphEmoji(glyph: SkyGlyph): string {
  return GLYPH_EMOJI[glyph]
}

/** Every emoji {@link glyphEmoji} can return, so consumers can recognise a title they wrote. */
export const DESCRIBE_EMOJIS: string[] = [...new Set(Object.values(GLYPH_EMOJI))]

/**
 * The slice of an hourly point that describes its sky. Both hourly feeds carry these;
 * neither carries cloud cover, visibility or humidity, so the visibility and cloud
 * branches simply stay out of reach for an hourly slot.
 */
export interface HourlySky {
  weatherCode?: number
  isDay: boolean
  precipitation?: number
  showers?: number
  snowfall?: number
}

/**
 * Evidence from one hourly forecast point. Worth the detour: without it the hourly strip
 * falls back to the weather code and can label an hour 毛毛雨 while the bar — reading the
 * same hour's measured rate — calls it 小雨.
 */
export function skyEvidenceOfHourly(hour: HourlySky): SkyEvidence {
  return {
    precipitation: hour.precipitation,
    showers: hour.showers,
    snowfall: hour.snowfall,
    weatherCode: hour.weatherCode,
    isDay: hour.isDay,
  }
}

/**
 * Assemble the description evidence from the current observation plus the air-quality
 * block. The two PM fields matter only for telling 沙尘 from 霾, and they ride in on a
 * separate optional feed — with no air data the visibility branch simply grades 霾.
 */
export function skyEvidenceOf(current: CurrentWeather, air: WeatherData['air']): SkyEvidence {
  return {
    precipitation: current.precipitation,
    rain: current.rain,
    showers: current.showers,
    snowfall: current.snowfall,
    temperature: current.temperature,
    humidity: current.humidity,
    visibility: current.visibility,
    cloudCover: current.cloudCover,
    weatherCode: current.weatherCode,
    isDay: current.isDay,
    windSpeed: current.windSpeed,
    dust: air?.dust,
    pm10: air?.pm10,
    pm25: air?.pm25,
  }
}

/**
 * 沙尘判识 — GB/T 20480-2017. QX/T 113-2010 requires 霾 to be judged only after dust is
 * ruled out, and the two share the same visibility band; what separates them is particle
 * SIZE. Dust lifts PM10 while fine particles stay a minority; haze is the reverse.
 *
 * BUT the test is NOT allowed to rest on visibility. The feed's `visibility` comes from a
 * weather model while the particles come from an air-quality one, and the two disagree:
 * measured over 30 h at 库尔勒, `dust` peaked at 997 µg/m³ while visibility sat flat at
 * 26.9 km (r = -0.19). A visibility-gated dust test is therefore dead code — and a 沙尘 day
 * gets advertised as 晴. So the primary evidence is CAMS' `dust`, with the particle-size
 * test as the fallback when that field is unreported.
 *
 * Returns undefined when neither is available, so the caller grades 霾 as before.
 */
function dustDescription(e: SkyEvidence): SkyDescription | undefined {
  const dust = finite(e.dust)
  const pm10 = finite(e.pm10)
  const pm25 = finite(e.pm25)
  const coarse = pm10 !== undefined && pm10 >= DUST_PM10_MIN
    && (pm25 === undefined || pm25 / pm10 < DUST_FINE_RATIO_MAX)
  // dust 是主判，但必须由 PM10 佐证：CAMS 在沙漠边缘的背景偏高，实测张掖 dust 72 而
  // PM10 只有 17 µg/m³，单看 dust 会误报。
  const dustLead = dust !== undefined && dust >= DUST_CONCENTRATION_MIN
    && pm10 !== undefined && pm10 >= DUST_PM10_FLOOR
  if (!(dustLead || coarse)) return undefined
  // Wet air at low visibility is 雾/轻雾, not dust.
  const humidity = finite(e.humidity)
  if (humidity !== undefined && humidity >= HAZE_RH_MAX) return undefined

  // GB/T 20480-2017 的五个等级：能见度定级，浮尘与扬沙再按风力分开。能见度缺失或
  // 停在 ≥ 10 km 时仍然算沙尘 —— 颗粒物已经证明了它，不能用一个不反映沙尘的字段否认。
  const vis = finite(e.visibility)
  let label: string
  if (vis !== undefined && vis < DUST_EXTREME_VIS_KM) label = '特强沙尘暴'
  else if (vis !== undefined && vis < DUST_SEVERE_VIS_KM) label = '强沙尘暴'
  else if (vis !== undefined && vis < FOG_VIS_KM) label = '沙尘暴'
  else if (vis !== undefined && vis < MIST_VIS_KM) {
    label = e.windSpeed !== undefined && e.windSpeed > WIND_LEVEL3_KMH ? '扬沙' : '浮尘'
  } else label = '浮尘'

  // `fog` is the reduced-visibility glyph; there is no dust glyph to draw.
  // Visibility goes into the basis ONLY when it actually fell. Writing 「能见度 38 公里」
  // next to 「浮尘」 would let the evidence contradict its own conclusion — and that
  // reading means nothing anyway, since this field does not track the particles. The
  // concentration is the evidence here.
  const visShown = vis !== undefined && vis < MIST_VIS_KM
  const basis = dust !== undefined
    ? `沙尘浓度 ${Math.round(dust)} µg/m³${visShown ? `，能见度 ${visText(vis)}` : ''}`
    : `PM10 ${Math.round(pm10 ?? 0)} µg/m³，粗颗粒主导`
  return { glyph: 'fog', label, basis, uncertain: false }
}

/**
 * One evidence-based sky description. Order: snow → freezing rain → precipitation
 * → visibility → cloud → weather-code fallback, each carrying a `basis` the UI
 * shows ("依据 · …" or "模式推断 · …" when `uncertain`); omit it only on the fallback.
 */
export function describeSky(e: SkyEvidence): SkyDescription {
  const rate = finite(e.precipitation)
  const code = e.weatherCode ?? -1
  const showers = finite(e.showers)
  const steady = finite(e.rain)
  // Showery vs steady: the API splits precipitation into convective `showers` and
  // steady `rain`, and whichever dominates wins (QX/T 48-2007: 阵雨 = cumulonimbus rain).
  const showery = showers !== undefined && showers > 0 && showers >= (steady ?? 0)

  // 1) Snow: `snowfall > 0` is direct evidence. The grade is not set here —
  // GB/T 28592-2012 grades snow only by 12/24 h water-equivalent total.
  const snowfall = finite(e.snowfall)
  if (snowfall !== undefined && snowfall > 0) {
    const basis = rate === undefined ? '探空显示降雪' : `降水率 ${rateText(rate)}（其中降雪）`
    return { glyph: 'snow', label: showery ? '阵雪' : '降雪', basis, uncertain: false }
  }

  // 2) Freezing rain: the model has no ground-icing variable, so it takes the code
  // plus actual precipitation. 57/67 are the heavy tier.
  if (FREEZING_RAIN_CODES.has(code) && rate !== undefined && rate > 0) {
    const heavy = code === 57 || code === 67
    const drizzle = code === 56 || code === 57
    return {
      glyph: heavy ? 'freezing-rain-heavy' : 'freezing-rain',
      label: drizzle ? (heavy ? '强冻毛毛雨' : '冻毛毛雨') : (heavy ? '强冻雨' : '冻雨'),
      basis: `${rateText(rate)}，气温 ${e.temperature === undefined ? '未知' : `${Math.round(e.temperature)}°C`}`,
      uncertain: false,
    }
  }

  // 3) Precipitation present: intensity graded by hourly rain rate.
  if (rate !== undefined && rate > 0) {
    if (rate >= RAIN_TORRENTIAL_MMH) {
      // QX/T 416-2018 Table 1 splits hourly rain into two tiers: ≥ 20 < 80 mm/h
      // 强对流, ≥ 80 mm/h 超强对流 — the two never share a label.
      const extreme = rate >= RAIN_EXTREME_MMH
      return {
        glyph: 'rain-heavy',
        label: extreme ? '极端强降水' : '短时强降水',
        basis: `降水率 ${rateText(rate)}`,
        uncertain: false,
      }
    }
    // 16–20 mm/h is already 暴雨 by hourly intensity but has not reached
    // QX/T 416-2018's 短时强降水 line; the domestic rate table names it, so we do.
    if (rate >= RAIN_DELUGE_MMH) {
      return { glyph: 'rain-heavy', label: '暴雨', basis: `降水率 ${rateText(rate)}`, uncertain: false }
    }
    const thunderHint = THUNDER_CODES.has(code)
    if (thunderHint) {
      // The code itself is the only thunder evidence, so the wording stays tentative.
      return {
        glyph: 'thunder',
        label: showery ? '雷阵雨' : '雷雨',
        basis: `${showery ? '阵性' : '连续性'}降水 ${rateText(rate)}，天气码提示雷电`,
        uncertain: true,
      }
    }
    if (showery) {
      const strong = rate >= RAIN_HEAVY_MMH
      return { glyph: strong ? 'rain-heavy' : 'rain', label: strong ? '强阵雨' : '阵雨', basis: `阵性降水 ${rateText(rate)}`, uncertain: false }
    }
    const basis = `降水率 ${rateText(rate)}`
    if (rate < RAIN_TRACE_MMH) return { glyph: 'drizzle', label: '毛毛雨', basis, uncertain: false }
    if (rate < RAIN_MODERATE_MMH) return { glyph: 'rain-light', label: '小雨', basis, uncertain: false }
    if (rate < RAIN_HEAVY_MMH) return { glyph: 'rain', label: '中雨', basis, uncertain: false }
    return { glyph: 'rain-heavy', label: '大雨', basis, uncertain: false }
  }

  // 4) 沙尘 — FIRST, and deliberately OUTSIDE the visibility gate. The feed's visibility
  // does not move with the particles (measured r = -0.19 at 库尔勒 while `dust` hit
  // 997 µg/m³), so gating this on `vis < 10 km` would keep the whole branch from ever
  // running. Tested across the whole band, including < 1 km, which 雾 would otherwise
  // claim for itself.
  const dust = dustDescription(e)
  if (dust !== undefined) return dust

  // 5) No precipitation and reduced visibility: QX/T 113-2010 — 雾 (< 1 km), else 轻雾 or
  // 霾 by humidity, with 霾 graded by how far visibility fell.
  const vis = finite(e.visibility)
  if (vis !== undefined && vis < MIST_VIS_KM) {
    const humidity = finite(e.humidity)
    if (vis < FOG_VIS_KM) {
      return { glyph: 'fog', label: '雾', basis: `能见度 ${visText(vis)}`, uncertain: false }
    }
    if (humidity === undefined) {
      return { glyph: 'fog', label: '能见度偏低', basis: `能见度 ${visText(vis)}`, uncertain: false }
    }
    const basis = `能见度 ${visText(vis)}，湿度 ${pctText(humidity)}`
    // ≥ 80 % is 轻雾; the 80–95 % band is where the standard defers to PM2.5,
    // a species this layer never sees, so humidity is the whole test here.
    if (humidity >= HAZE_RH_MAX) return { glyph: 'fog', label: '轻雾', basis, uncertain: false }
    if (vis < HAZE_MODERATE_VIS_KM) return { glyph: 'fog', label: '重度霾', basis, uncertain: false }
    if (vis < HAZE_MILD_VIS_KM) return { glyph: 'fog', label: '中度霾', basis, uncertain: false }
    if (vis < HAZE_SLIGHT_VIS_KM) return { glyph: 'fog', label: '轻度霾', basis, uncertain: false }
    return { glyph: 'fog', label: '轻微霾', basis, uncertain: false }
  }

  // 6) Cloud-cover grading (GB/T 35663-2017 成数).
  const cloud = finite(e.cloudCover)
  if (cloud !== undefined) {
    const basis = `云量 ${pctText(cloud)}`
    if (cloud < CLOUD_CLEAR_PCT) return { glyph: e.isDay ? 'clear-day' : 'clear-night', label: '晴', basis, uncertain: false }
    if (cloud < CLOUD_PARTLY_PCT) return { glyph: e.isDay ? 'partly-day' : 'partly-night', label: '少云', basis, uncertain: false }
    if (cloud < CLOUD_OVERCAST_PCT) return { glyph: 'cloudy', label: '多云', basis, uncertain: false }
    return { glyph: 'cloudy', label: '阴', basis, uncertain: false }
  }

  // 7) Fallback: only the code is left — it still says whether it rains, little more.
  const info = describeCondition(code, e.isDay)
  return { glyph: glyphForCode(code, e.isDay), label: info.label, uncertain: false }
}

/**
 * GB/T 28592-2012 24 h 雨量 grades (mm): 微量 < 0.1, 小雨 0.1–9.9, 中雨 10–24.9,
 * 大雨 25–49.9, 暴雨 50–99.9, 大暴雨 100–249.9, 特大暴雨 ≥ 250.
 */
export function rainGrade24h(sumMm: number | undefined): string | undefined {
  if (sumMm === undefined || !Number.isFinite(sumMm)) return undefined
  // Zero and the trace band differ: "did not rain" vs "barely rained" — a 0.05 mm
  // day must not read as dry.
  if (sumMm <= 0) return '无降水'
  if (sumMm < 0.1) return '微量'
  if (sumMm < 10) return '小雨'
  if (sumMm < 25) return '中雨'
  if (sumMm < DELUGE_24H_MM) return '大雨'
  if (sumMm < DOWNPOUR_24H_MM) return '暴雨'
  if (sumMm < CLOUDBURST_24H_MM) return '大暴雨'
  return '特大暴雨'
}

/**
 * GB/T 28592-2012 24 h 降雪量 grades (pure snow, water equivalent); the API gives
 * fresh-snow depth (cm), converted via {@link SNOW_CM_PER_MM_WE}. 微量 < 0.1,
 * 小雪 0.1–2.4, 中雪 2.5–4.9, 大雪 5.0–9.9, 暴雪 10.0–19.9, 大暴雪 20.0–29.9.
 */
export function snowGrade24h(snowfallCm: number | undefined): string | undefined {
  if (snowfallCm === undefined || !Number.isFinite(snowfallCm) || snowfallCm <= 0) return undefined
  const we = snowfallCm / SNOW_CM_PER_MM_WE
  // Without the floor, any dusting under 2.4 mm water equivalent graded 小雪.
  if (we < 0.1) return '微量'
  if (we < SNOW_MODERATE_24H_MM) return '小雪'
  if (we < SNOW_HEAVY_24H_MM) return '中雪'
  if (we < SNOWSTORM_24H_MM) return '大雪'
  if (we < 20) return '暴雪'
  if (we < 30) return '大暴雪'
  return '特大暴雪'
}

/**
 * Rolling `windowHours`-hour accumulated precipitation (mm) from the current hour;
 * any missing hour abandons the window (undefined) rather than understating it.
 */
export function rollingRainSum(hourlyRates: (number | undefined)[], windowHours: number): number | undefined {
  if (windowHours <= 0 || hourlyRates.length < windowHours) return undefined
  let sum = 0
  for (let i = 0; i < windowHours; i += 1) {
    const value = hourlyRates[i]
    if (value === undefined || !Number.isFinite(value)) return undefined
    sum += value
  }
  return sum
}

/** Short-duration deluge result: one tier of 中国气象局令第 16 号's warning signals. */
export interface DelugeWarning {
  level: 'warning' | 'danger'
  /** Warning-signal name, e.g. `暴雨橙色`. */
  signal: string
  /** Accumulation window judged (hours). */
  hours: number
  /** Accumulated precipitation in that window (mm). */
  sumMm: number
  /** Standard threshold hit (mm). */
  thresholdMm: number
}

/**
 * Short-duration deluge: 中国气象局令第 16 号 — blue 12h ≥ 50, yellow 6h ≥ 50,
 * orange 3h ≥ 50, red 3h ≥ 100 mm — the gap between GB/T 28592-2012 (24 h) and
 * QX/T 416-2018 (one hour). Severer tier tested first; a missing hour skips the window.
 */
export function shortDurationDeluge(hourlyRates: (number | undefined)[]): DelugeWarning | undefined {
  const sum3 = rollingRainSum(hourlyRates, 3)
  if (sum3 !== undefined && sum3 >= DELUGE_RED_3H_MM) {
    return { level: 'danger', signal: '暴雨红色', hours: 3, sumMm: sum3, thresholdMm: DELUGE_RED_3H_MM }
  }
  if (sum3 !== undefined && sum3 >= DELUGE_3H_MM) {
    return { level: 'danger', signal: '暴雨橙色', hours: 3, sumMm: sum3, thresholdMm: DELUGE_3H_MM }
  }
  const sum6 = rollingRainSum(hourlyRates, 6)
  if (sum6 !== undefined && sum6 >= DELUGE_6H_MM) {
    return { level: 'warning', signal: '暴雨黄色', hours: 6, sumMm: sum6, thresholdMm: DELUGE_6H_MM }
  }
  const sum12 = rollingRainSum(hourlyRates, 12)
  if (sum12 !== undefined && sum12 >= DELUGE_12H_MM) {
    return { level: 'warning', signal: '暴雨蓝色', hours: 12, sumMm: sum12, thresholdMm: DELUGE_12H_MM }
  }
  return undefined
}
