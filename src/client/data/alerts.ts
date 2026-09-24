/**
 * Severe-weather evaluation: rule-based alerts derived from the observed and
 * forecast weather. Open-Meteo has no alert coverage for China, so alerts come
 * from the data itself — severity from measured intensity, never the WMO code.
 */
// WMO code families & rule thresholds — single source in condition.ts; the alert
// rules and the UI hints must agree on what counts as rain/thunder/etc.
import {
  COLD_DANGER_C,
  COLD_WARN_C,
  FROST_C,
  GUST_DANGER_KMH,
  GUST_WARN_KMH,
  HEAT_DANGER_C,
  HEAT_ORANGE_C,
  HEAT_WARN_C,
  HEAVY_RAIN_CODES,
  HEAVY_SNOW_CODES,
  RAIN_DELUGE_MMH,
  RAIN_TORRENTIAL_MMH,
  RAIN_WARN_MMH,
  SNOW_WARN_MMH,
  THUNDER_CODES,
  WIND_DANGER_KMH,
  WIND_WARN_KMH,
} from './condition'
// Borrows only the short-duration deluge check from the description layer; no
// thresholds are defined here.
import { shortDurationDeluge } from './describe'
import { rateText } from '../shared/format'
import type { WeatherData } from './weather-api'

/** One actionable severe-weather alert derived from the current conditions. */
export interface WeatherAlert {
  key: string
  level: 'warning' | 'danger'
  title: string
  detail: string
}

/** How many hours of hourly forecast the lead-time scan covers. */
const LEAD_HOURS = 12

/**
 * How hard a condition is actually hitting, which a WMO code alone never says.
 * `danger` takes evidence — a violent shower (82), a 暴雨 rain rate, Bft-12 wind,
 * Bft-13 gusts or 40 °C heat — so ordinary thunder, 大雨 and 大雪 stay `warning`,
 * and a code whose intensity stays light is `info` (raises no alert at all).
 */
export type AlertSeverity = 'info' | 'warning' | 'danger'

/**
 * The one code hazardous on its own: 82, a violent shower, i.e. what 暴雨 means.
 * Codes 96/99 (hail) are deliberately NOT here — Open-Meteo derives them from
 * model convective parameters, so they fire far more often than hail reaches the
 * ground; a hail code is a CATEGORY, not an observation (danger only via rate/gust).
 */
const HAZARD_CODES = new Set([82])
/** The hail-bearing codes (96/99) — reported as a possibility, never as fact. */
const HAIL_CODES = new Set([96, 99])

/**
 * Classify ONE weather code (plus the intensity evidence around it) on the
 * severity scale. A violent shower (82) is dangerous on its own, as is any code
 * whose measured rate or gust clears the danger line; everything else is a
 * `warning` at most — a plain 95 is an ordinary 雷阵雨.
 */
export function severityOfCode(code: number, precipitation?: number, gustKmh?: number): AlertSeverity {
  const hazard = HAZARD_CODES.has(code)
  const thunder = THUNDER_CODES.has(code)
  const heavyRain = HEAVY_RAIN_CODES.has(code)
  const heavySnow = HEAVY_SNOW_CODES.has(code)
  if (!hazard && !thunder && !heavyRain && !heavySnow) return 'info'
  const rate = precipitation !== undefined && Number.isFinite(precipitation) ? precipitation : undefined
  const gust = gustKmh !== undefined && Number.isFinite(gustKmh) ? gustKmh : undefined
  if (rate !== undefined && rate >= RAIN_TORRENTIAL_MMH) return 'danger'
  if (gust !== undefined && gust >= GUST_DANGER_KMH) return 'danger'
  if (hazard) return 'danger'
  if (thunder) return 'warning'
  if (heavyRain) return rate !== undefined && rate >= RAIN_WARN_MMH ? 'warning' : 'info'
  // Heavy snow: the code says 大雪/强阵雪, the rate says how much lands; with no rate
  // reported, trust the code rather than dropping the warning.
  return rate === undefined || rate >= SNOW_WARN_MMH ? 'warning' : 'info'
}

/**
 * The number a rain claim rests on, for a detail line: `（降水率 3.4 mm/h）`. Empty
 * when the feed reported no rate, so an alert says only what the code names.
 */
function rainRateNote(rate: number | undefined): string {
  return rate === undefined ? '' : `（降水率 ${rateText(rate)}）`
}

/**
 * The measurement a thunder alert rests on, in the order {@link severityOfCode}
 * checked it — the 暴雨 rate first, then the Bft-12 gust. Only the criterion that
 * actually fired is quoted, so a detail line never contradicts its own title.
 */
function thunderEvidenceNote(
  rate: number | undefined,
  gustKmh: number | undefined,
  windFmt: (kmh: number) => string,
): string {
  if (rate !== undefined && rate >= RAIN_TORRENTIAL_MMH) return rainRateNote(rate)
  if (gustKmh !== undefined && gustKmh >= GUST_DANGER_KMH) return `（阵风 ${windFmt(gustKmh)}）`
  return ''
}

/**
 * Rule-based severe-weather evaluation: current conditions, plus a
 * {@link LEAD_HOURS}-hour lead tier that skips anything already firing. Titles
 * name the code's own category; every intensity claim cites its number. Values
 * are metric; `fmt` and `windFmt` render in the active display unit.
 */
export function evaluateAlerts(
  data: WeatherData,
  fmt: (value: number) => string,
  windFmt: (kmh: number) => string = (kmh) => `${Math.round(kmh)} km/h`,
): WeatherAlert[] {
  const alerts: WeatherAlert[] = []
  const hasKey = (key: string): boolean => alerts.some((alert) => alert.key === key)
  const current = data.current
  const curSeverity = severityOfCode(current.weatherCode, current.precipitation, current.windGusts)
  // The same evidence severityOfCode saw, reused so a detail line can quote the
  // number a claim rests on, and never one it rejected as missing or NaN.
  const rainRate = Number.isFinite(current.precipitation) ? current.precipitation : undefined

  // Three tiers, mirroring 中国气象局's 黄色 35 / 橙色 37 / 红色 40 °C heat signals;
  // the scale only has two levels, so the 35 and 37 bands differ by their advice.
  if (current.temperature >= HEAT_DANGER_C) {
    alerts.push({ key: 'heat', level: 'danger', title: '酷热', detail: `当前 ${fmt(current.temperature)}，减少外出，谨防中暑` })
  } else if (current.temperature >= HEAT_ORANGE_C) {
    alerts.push({ key: 'heat', level: 'warning', title: '高温', detail: `当前 ${fmt(current.temperature)}，避免午后长时间户外活动` })
  } else if (current.temperature >= HEAT_WARN_C) {
    alerts.push({ key: 'heat', level: 'warning', title: '高温', detail: `当前 ${fmt(current.temperature)}，注意防暑` })
  } else if (current.temperature <= COLD_DANGER_C) {
    alerts.push({ key: 'cold', level: 'danger', title: '严寒', detail: `当前 ${fmt(current.temperature)}，注意防寒防冻` })
  } else if (current.temperature <= COLD_WARN_C) {
    alerts.push({ key: 'cold', level: 'warning', title: '低温', detail: `当前 ${fmt(current.temperature)}，注意保暖` })
  } else if (current.temperature <= FROST_C) {
    // Freezing is a surface-frost note for drivers and plants, not a cold alert.
    alerts.push({ key: 'frost', level: 'warning', title: '霜冻', detail: `当前 ${fmt(current.temperature)}，路面可能结霜` })
  }

  const windKmh = current.windSpeed
  const gustKmh = current.windGusts
  if (windKmh !== undefined && windKmh >= WIND_DANGER_KMH) {
    alerts.push({ key: 'wind', level: 'danger', title: '狂风', detail: `风速 ${windFmt(windKmh)}，尽量减少外出` })
  } else if (gustKmh !== undefined && gustKmh >= GUST_DANGER_KMH) {
    // A Bft-12 gust is destructive on its own, even with a calm mean wind.
    alerts.push({ key: 'wind', level: 'danger', title: '狂风', detail: `阵风 ${windFmt(gustKmh)}，尽量减少外出` })
  } else if (
    (windKmh !== undefined && windKmh >= WIND_WARN_KMH)
    || (gustKmh !== undefined && gustKmh >= GUST_WARN_KMH)
  ) {
    // Sustained wind or gusts can each be the reason on their own; report whichever fired.
    const sustainedAlert = windKmh !== undefined && windKmh >= WIND_WARN_KMH
    const gustAlert = gustKmh !== undefined && gustKmh >= GUST_WARN_KMH
    const detail = sustainedAlert && windKmh !== undefined
      ? `风速 ${windFmt(windKmh)}${gustKmh !== undefined ? `，阵风 ${windFmt(gustKmh)}` : ''}`
      : `阵风 ${windFmt(gustKmh ?? 0)}`
    alerts.push({ key: 'wind', level: 'warning', title: gustAlert ? '强阵风' : '大风', detail })
  }

  // Each branch reports the condition the code names and escalates only on
  // measured intensity: code 65 is 大雨, never 暴雨; code 95 alone is a 雷阵雨.
  if (curSeverity !== 'info') {
    const code = current.weatherCode
    const hail = HAIL_CODES.has(code)
    const gale = gustKmh !== undefined && gustKmh >= GUST_DANGER_KMH
    // 暴雨 is a rain-RATE claim, named only when a measured rate reached the
    // domestic hourly 暴雨 line (16 mm/h); code 82 alone is dangerous by
    // category, never a 暴雨.
    const deluge = rainRate !== undefined && rainRate >= RAIN_DELUGE_MMH
    if (hail || (gale && THUNDER_CODES.has(code))) {
      alerts.push({
        key: 'thunder',
        level: curSeverity,
        title: curSeverity === 'danger' ? '强雷雨' : '雷雨',
        // Hail stays a POSSIBILITY (what the code means, not an observation); the
        // danger level comes from the measured rate or gust underneath it.
        detail: hail
          ? `天气码提示雷雨${thunderEvidenceNote(rainRate, gustKmh, windFmt)}，注意防范`
          : '雷雨伴强阵风，注意防范',
      })
    } else if (HEAVY_RAIN_CODES.has(code)) {
      // 82 (violent shower) is danger by code, 65 (大雨) only by measured rate.
      alerts.push(curSeverity === 'danger'
        ? {
            key: 'heavy-rain',
            level: 'danger',
            title: deluge ? '暴雨' : '暴阵雨',
            detail: `降雨强度大${deluge ? rainRateNote(rainRate) : ''}，注意出行安全与积水`,
          }
        : { key: 'heavy-rain', level: 'warning', title: '大雨', detail: '雨势较大，注意出行安全' })
    } else if (THUNDER_CODES.has(code)) {
      alerts.push(curSeverity === 'danger'
        ? { key: 'thunder', level: 'danger', title: '雷雨', detail: `雷电伴强降雨${thunderEvidenceNote(rainRate, gustKmh, windFmt)}，注意防范` }
        : { key: 'thunder', level: 'warning', title: '雷阵雨', detail: '有雷电活动，注意避雨' })
    } else {
      alerts.push({ key: 'heavy-snow', level: 'warning', title: '强降雪', detail: '降雪明显，注意路况' })
    }
  }

  // 短历时暴雨（中国气象局令第 16 号）: hourly scanning misses a flat deluge — 10 mm/h
  // for 6 h never hits the short-time line, but 60 mm in 6 h already is 暴雨黄色预警.
  if (!hasKey('heavy-rain')) {
    const deluge = shortDurationDeluge(data.hourly.map((hour) => hour.precipitation))
    if (deluge !== undefined) {
      alerts.push({
        key: 'heavy-rain',
        level: deluge.level,
        title: '暴雨',
        detail: `未来 ${deluge.hours} 小时累计降雨量 ${deluge.sumMm.toFixed(1)} mm，达${deluge.signal}标准（≥ ${deluge.thresholdMm} mm）`,
      })
    }
  }

  // Lead-time tier: only a genuinely hazardous hour qualifies, and the wording
  // stays a forecast.
  const future = data.hourly.slice(0, LEAD_HOURS)
  if (future.length > 0) {
    let stormSoon = false
    let snowSoon = false
    let heatMaxC = Number.NEGATIVE_INFINITY
    let coldMinC = Number.POSITIVE_INFINITY
    let maxWindKmh: number | undefined
    for (const h of future) {
      if (severityOfCode(h.weatherCode) === 'danger') stormSoon = true
      if (HEAVY_SNOW_CODES.has(h.weatherCode)) snowSoon = true
      // A missing hour must not enter the extremum: `Math.max(x, undefined)` is NaN,
      // which would silently disable both the heat and the cold lead-time alerts.
      if (h.temperature !== undefined) {
        heatMaxC = Math.max(heatMaxC, h.temperature)
        coldMinC = Math.min(coldMinC, h.temperature)
      }
      if (h.windSpeed !== undefined) maxWindKmh = Math.max(maxWindKmh ?? h.windSpeed, h.windSpeed)
    }
    // Mild thunder in the window is left to the hourly strip: a 雷暴 for a rumble
    // three hours out is an overstatement.
    if (stormSoon && curSeverity !== 'danger') {
      alerts.push({
        key: 'storm-soon',
        level: 'danger',
        title: '强对流天气',
        detail: `未来 ${LEAD_HOURS} 小时可能出现强降雨或雷暴，请留意天气变化`,
      })
    }
    if (heatMaxC >= HEAT_WARN_C && !hasKey('heat')) {
      alerts.push({
        key: 'heat-soon',
        level: heatMaxC >= HEAT_DANGER_C ? 'danger' : 'warning',
        title: heatMaxC >= HEAT_DANGER_C ? '酷热' : '高温',
        detail: heatMaxC >= HEAT_ORANGE_C
          ? `未来 ${LEAD_HOURS} 小时最高可达 ${fmt(heatMaxC)}，避免午后长时间户外活动`
          : `未来 ${LEAD_HOURS} 小时最高可达 ${fmt(heatMaxC)}，注意防暑`,
      })
    }
    if (coldMinC <= COLD_WARN_C && !hasKey('cold')) {
      alerts.push({
        key: 'cold-soon',
        level: coldMinC <= COLD_DANGER_C ? 'danger' : 'warning',
        title: coldMinC <= COLD_DANGER_C ? '严寒' : '低温',
        detail: `未来 ${LEAD_HOURS} 小时最低将降至 ${fmt(coldMinC)}，注意保暖`,
      })
    }
    if (maxWindKmh !== undefined && maxWindKmh >= WIND_WARN_KMH && !hasKey('wind')) {
      alerts.push({
        key: 'wind-soon',
        level: maxWindKmh >= WIND_DANGER_KMH ? 'danger' : 'warning',
        title: maxWindKmh >= WIND_DANGER_KMH ? '狂风' : '大风',
        detail: `未来 ${LEAD_HOURS} 小时风力较大（最大 ${windFmt(maxWindKmh)}），注意高空坠物`,
      })
    }
    if (snowSoon && !hasKey('heavy-snow')) {
      alerts.push({
        key: 'snow-soon',
        level: 'warning',
        title: '强降雪',
        detail: `未来 ${LEAD_HOURS} 小时可能有明显降雪，注意路况`,
      })
    }
  }

  return alerts
}
