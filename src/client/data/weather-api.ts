/**
 * Forecast data layer: the Open-Meteo current/hourly/daily/minutely payload, the
 * per-day detail request, and their mapping into {@link WeatherData}. Fetched in
 * metric (°C / km/h / mm / hPa); display units are applied client-side.
 */
import { apiFetch, withTimeout } from '../shared/http'
import type { GeoLocation } from './geolocation'

export interface CurrentWeather {
  temperature: number
  apparentTemperature: number
  /** Relative humidity (%), absent when unreported. */
  humidity?: number
  /** Sustained wind speed (km/h), absent when unreported. */
  windSpeed?: number
  weatherCode: number
  isDay: boolean
  /** Wind direction (0–360°, the direction the wind blows *from*). */
  windDirection?: number
  /** Wind gust speed (km/h). */
  windGusts?: number
  /** Surface air pressure (hPa). */
  pressure?: number
  /** Total cloud cover (0–100 %). */
  cloudCover?: number
  /** Visibility (km); the feed reports metres and this is converted on ingest. */
  visibility?: number
  /** Dew point temperature (°C). */
  dewPoint?: number
  /**
   * Current precipitation RATE (mm/h); the feed's accumulation over the preceding
   * `current.interval` seconds (900 = 15 min) is normalized on ingest.
   */
  precipitation?: number
  /** STRATIFORM part of {@link precipitation} (mm/h) — WMO's 连续性降水; distinguishes 阵雨 from 小雨, which `weather_code` cannot. */
  rain?: number
  /** The CONVECTIVE part of {@link precipitation} (mm/h) — WMO's 阵性降水. */
  showers?: number
  /** Snowfall rate (cm/h), water equivalent; 0 outside snow. */
  snowfall?: number
  /** CAPE (J/kg) — necessary but never sufficient for thunder: 天河区 stays above 2000 J/kg all September, clear hours included. */
  cape?: number
  /** Lifted index (K); negative is unstable. Same caveat as {@link cape}. */
  liftedIndex?: number
  /** 0 °C level height (m); decides rain-vs-snow more directly than a weather code. */
  freezingLevel?: number
}

export interface HourlyPoint {
  /** ISO instant as returned by the API (local time with `timezone=auto`). */
  time: string
  /** Temperature (°C), absent when unreported; never defaulted to 0, which would fabricate a reading. */
  temperature?: number
  weatherCode: number
  /** Precipitation probability (%), absent when unreported. */
  precipProb?: number
  /** Precipitation rate for this hour (mm/h); absent when unreported. */
  precipitation?: number
  /** Convective part of {@link precipitation} (mm/h) — 阵性. */
  showers?: number
  /** Snowfall rate for this hour (cm/h, water equivalent). */
  snowfall?: number
  /** CAPE (J/kg) at this hour — instability context, never proof of thunder. */
  cape?: number
  /** Whether the hour is daylight (derived from the feed's `is_day`). */
  isDay: boolean
  /** Sustained wind speed at this hour (km/h). */
  windSpeed?: number
}

export interface DailyPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string
  weatherCode: number
  /** Day-max temperature (°C), absent when unreported. */
  tempMax?: number
  /** Day-min temperature (°C), absent when unreported. */
  tempMin?: number
  /** Max precipitation probability (%), absent when unreported. */
  precipProb?: number
  /** Total precipitation for the day (mm). */
  precipSum?: number
  /** Total snowfall (cm of fresh snow); GB/T 28592-2012 grades by WATER EQUIVALENT, so this maps via {@link SNOW_CM_PER_MM_WE} before grading. */
  snowfallSum?: number
}

export interface WeatherData {
  location: GeoLocation
  current: CurrentWeather
  hourly: HourlyPoint[]
  daily: DailyPoint[]
  /** Today's sunrise time (ISO local, e.g. `2026-09-01T06:09`). */
  sunrise?: string
  /** Today's sunset time (ISO local). */
  sunset?: string
  /** Today's maximum UV index. */
  uvIndexMax?: number
  /** Current air quality; `aqi` / `pm25` are individually absent when unreported — a missing value never masquerades as `0`. */
  air?: { aqi?: number; pm25?: number }
  /** 15-minute precipitation steps for the coming hours (Open-Meteo minutely_15). */
  minutely?: MinutelyPoint[]
  /** Rain timing derived from `minutely` (absent when that feed is unavailable). */
  rainSoon?: RainScan
}

/** Minutes per Open-Meteo `minutely_15` step; the rain strip labels its span from it. */
export const MINUTE_STEP_MIN = 15
/** Minutely steps kept for the rain strip and onset detection (6 h). */
const MINUTELY_STEPS = 24
/** Precipitation (mm per 15 min) at/above which a step counts as raining. */
export const RAIN_MM_PER_15MIN = 0.1

export interface MinutelyPoint {
  /** ISO instant (local, `timezone=auto`), at 15-minute grid positions. */
  time: string
  /** Precipitation over this 15-minute step (mm). */
  precipitation: number
}

/** Rain timing derived from a minutely precipitation scan. */
export interface RainScan {
  /** Whether rain is falling right now (the current step is wet). */
  rainingNow: boolean
  /** Minutes from now until the first wet step (only when not raining yet). */
  onsetMinutes?: number
  /** Consecutive wet minutes at the current/onset point. */
  durationMinutes?: number
  /** Total minutes covered by the scanned steps. */
  windowMinutes: number
}

/**
 * Scan minutely steps (mm per 15 min) for rain. `steps[0]` CONTAINS now, so an
 * onset is measured from that step's start minus the elapsed part — otherwise
 * every onset is reported late, by up to one full step.
 */
function scanRain(steps: MinutelyPoint[], elapsedInFirstStep = 0): RainScan {
  const windowMinutes = steps.length * MINUTE_STEP_MIN
  const wet = (i: number): boolean => steps[i] !== undefined && steps[i].precipitation >= RAIN_MM_PER_15MIN
  if (steps.length === 0) return { rainingNow: false, windowMinutes }
  if (wet(0)) {
    let end = 1
    while (end < steps.length && wet(end)) end += 1
    return {
      rainingNow: true,
      // The current step is already partly over; do not claim its full 15 minutes.
      durationMinutes: Math.max(0, Math.round(end * MINUTE_STEP_MIN - elapsedInFirstStep)),
      windowMinutes,
    }
  }
  for (let start = 1; start < steps.length; start += 1) {
    if (!wet(start)) continue
    let end = start + 1
    while (end < steps.length && wet(end)) end += 1
    return {
      rainingNow: false,
      onsetMinutes: Math.max(0, Math.round(start * MINUTE_STEP_MIN - elapsedInFirstStep)),
      durationMinutes: (end - start) * MINUTE_STEP_MIN,
      windowMinutes,
    }
  }
  return { rainingNow: false, windowMinutes }
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'
/** Air-quality feed budget; it is additive, so a dead feed must not delay the forecast. */
const AIR_TIMEOUT_MS = 5_000
/** How long the forecast waits for the additive air feed before abandoning it this refresh; the abandoned request times out on its own. */
const AIR_GRACE_MS = 1_200
/** Fallback step length when the feed omits `current.interval` (Open-Meteo's is 900 s). */
const PRECIP_INTERVAL_FALLBACK_S = 900
/** Daily forecast horizon. Keeps the request param and the slice in sync. */
const FORECAST_DAYS = 7
/** Hourly points carried into {@link WeatherData.hourly} (matches the rail UI). */
const HOURLY_STEPS = 24

/**
 * Index of the grid step CONTAINING `current` (the last `time <= current`):
 * 14:07 belongs to the 14:00 step, else rain falling now would be dropped.
 */
function containingGridIndex(times: string[], current: string | undefined): number {
  if (current === undefined) return 0
  let index = -1
  for (let i = 0; i < times.length; i += 1) {
    if (times[i] > current) break
    index = i
  }
  return index >= 0 ? index : 0
}

// ── Raw provider shapes (arrays are index-aligned; a hole means "not reported") ─

interface RawCurrent {
  time?: string
  interval?: number
  temperature_2m?: number
  relative_humidity_2m?: number
  apparent_temperature?: number
  weather_code?: number
  wind_speed_10m?: number
  is_day?: number
  wind_direction_10m?: number | null
  wind_gusts_10m?: number | null
  surface_pressure?: number | null
  cloud_cover?: number | null
  visibility?: number | null
  dew_point_2m?: number | null
  precipitation?: number | null
  rain?: number | null
  showers?: number | null
  snowfall?: number | null
  cape?: number | null
  lifted_index?: number | null
  freezing_level_height?: number | null
}

interface RawHourly {
  time?: string[]
  temperature_2m?: (number | null)[]
  weather_code?: (number | null)[]
  is_day?: (number | null)[]
  precipitation_probability?: (number | null)[]
  wind_speed_10m?: (number | null)[]
  precipitation?: (number | null)[]
  showers?: (number | null)[]
  snowfall?: (number | null)[]
  cape?: (number | null)[]
}

interface RawDaily {
  time?: string[]
  weather_code?: (number | null)[]
  temperature_2m_max?: (number | null)[]
  temperature_2m_min?: (number | null)[]
  precipitation_probability_max?: (number | null)[]
  sunrise?: string[]
  sunset?: string[]
  uv_index_max?: (number | null)[]
  precipitation_sum?: (number | null)[]
  snowfall_sum?: (number | null)[]
}

interface RawMinutely {
  time?: string[]
  precipitation?: (number | null)[]
}

interface RawForecast {
  current?: RawCurrent
  hourly?: RawHourly
  daily?: RawDaily
  minutely_15?: RawMinutely
  /** Location's UTC offset in seconds — required to place "now" inside a step. */
  utc_offset_seconds?: number
}

// ── Block mappers ───────────────────────────────────────────────────────────
// Missing values stay absent (`?? undefined`, never `?? 0`): a fabricated 0
// rendered as "0 °C" or "降水 0%" is worse than a gap shown as "—".

/**
 * Map the `current` block. `temperature` arrives already validated by
 * `fetchWeather`, so the mapper must not re-derive that with a cast.
 */
const mapCurrent = (raw: RawCurrent, temperature: number): CurrentWeather => {
  // `current.precipitation` is an accumulation over the preceding `interval`
  // seconds (900 = 15 min), NOT a rate; converted here so it means mm/h everywhere.
  const intervalS = typeof raw.interval === 'number' && Number.isFinite(raw.interval) && raw.interval > 0
    ? raw.interval
    : PRECIP_INTERVAL_FALLBACK_S
  // `rain` / `showers` share the interval and conversion; a null `showers` is
  // absence, not zero.
  const partRate = (value: number | null | undefined): number | undefined =>
    value === null || value === undefined ? undefined : (value * 3600) / intervalS
  return {
    temperature,
    apparentTemperature: raw.apparent_temperature ?? temperature,
    humidity: raw.relative_humidity_2m ?? undefined,
    windSpeed: raw.wind_speed_10m ?? undefined,
    weatherCode: raw.weather_code ?? -1,
    isDay: (raw.is_day ?? 1) === 1,
    windDirection: raw.wind_direction_10m ?? undefined,
    windGusts: raw.wind_gusts_10m ?? undefined,
    pressure: raw.surface_pressure ?? undefined,
    cloudCover: raw.cloud_cover ?? undefined,
    // Open-Meteo reports visibility in METRES; the field's contract is km, so convert.
    visibility: raw.visibility === null || raw.visibility === undefined ? undefined : raw.visibility / 1000,
    dewPoint: raw.dew_point_2m ?? undefined,
    precipitation: partRate(raw.precipitation),
    rain: partRate(raw.rain),
    showers: partRate(raw.showers),
    snowfall: raw.snowfall ?? undefined,
    cape: raw.cape ?? undefined,
    liftedIndex: raw.lifted_index ?? undefined,
    freezingLevel: raw.freezing_level_height ?? undefined,
  }
}

const mapHourly = (raw: RawHourly, from: number): HourlyPoint[] =>
  (raw.time ?? []).slice(from, from + HOURLY_STEPS).map((time, index) => ({
    time,
    temperature: raw.temperature_2m?.[from + index] ?? undefined,
    weatherCode: raw.weather_code?.[from + index] ?? -1,
    isDay: (raw.is_day?.[from + index] ?? 1) === 1,
    precipProb: raw.precipitation_probability?.[from + index] ?? undefined,
    windSpeed: raw.wind_speed_10m?.[from + index] ?? undefined,
    // Hourly precipitation is already an hourly accumulation, i.e. mm/h — the
    // interval normalization above applies to the `current` block only.
    precipitation: raw.precipitation?.[from + index] ?? undefined,
    showers: raw.showers?.[from + index] ?? undefined,
    snowfall: raw.snowfall?.[from + index] ?? undefined,
    cape: raw.cape?.[from + index] ?? undefined,
  }))

const mapDaily = (raw: RawDaily): DailyPoint[] =>
  (raw.time ?? []).slice(0, FORECAST_DAYS).map((date, index) => ({
    date,
    weatherCode: raw.weather_code?.[index] ?? -1,
    tempMax: raw.temperature_2m_max?.[index] ?? undefined,
    tempMin: raw.temperature_2m_min?.[index] ?? undefined,
    precipProb: raw.precipitation_probability_max?.[index] ?? undefined,
    precipSum: raw.precipitation_sum?.[index] ?? undefined,
    snowfallSum: raw.snowfall_sum?.[index] ?? undefined,
  }))

/**
 * 15-minute precipitation in mm (unit-independent), aligned to the step containing
 * now and keeping {@link MINUTELY_STEPS} (6 h) ahead for the rain strip and onset.
 */
const mapMinutely = (
  raw: RawMinutely,
  offsetSeconds: number | undefined,
  nowIso: string | undefined,
): Pick<WeatherData, 'minutely' | 'rainSoon'> => {
  const times = raw.time ?? []
  if (times.length === 0) return {}
  const from = containingGridIndex(times, nowIso)
  const precipitation = raw.precipitation ?? []
  const steps: MinutelyPoint[] = times.slice(from, from + MINUTELY_STEPS)
    .map((time, index) => ({
      time,
      // A missing minutely step is DRY, not unknown (the opposite of the arrays
      // above): the rain scan needs one value per step.
      precipitation: precipitation[from + index] ?? 0,
    }))
  // `steps[0]` CONTAINS now: onsets count from its START minus the elapsed part
  // (else late by up to a step). Grid times are local wall clock, hence the offset.
  const first = steps[0]
  let elapsed = 0
  if (first !== undefined && typeof offsetSeconds === 'number' && Number.isFinite(offsetSeconds)) {
    const firstStepInstant = Date.parse(`${first.time}:00Z`) - offsetSeconds * 1000
    const since = (Date.now() - firstStepInstant) / 60_000
    if (Number.isFinite(since)) elapsed = Math.min(MINUTE_STEP_MIN, Math.max(0, since))
  }
  return { minutely: steps, rainSoon: scanRain(steps, elapsed) }
}

/**
 * Air quality is additive: parsed after the main JSON under a short grace window,
 * so it cannot hold the forecast back. Unreported values stay absent, not 0.
 */
const mapAir = (res: { ok: boolean; json: unknown } | null): WeatherData['air'] => {
  if (res === null || !res.ok) return undefined
  const raw = res.json as { current?: { us_aqi?: number | null; pm2_5?: number | null } } | null
  const aqi = raw?.current?.us_aqi ?? undefined
  const pm25 = raw?.current?.pm2_5 ?? undefined
  return aqi === undefined && pm25 === undefined ? undefined : { aqi, pm25 }
}

// ── Requests ────────────────────────────────────────────────────────────────

/**
 * Fetch the current + hourly + daily forecast for a place, plus air quality. The
 * payload is always metric (°C / km/h / mm / hPa) — display conversion happens
 * client-side, so the cached snapshot survives unit toggles. Requests honour
 * `signal` and a hard timeout; the additive air feed has a shorter budget.
 */
export async function fetchWeather(location: GeoLocation, signal?: AbortSignal): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'weather_code',
      'wind_speed_10m',
      'is_day',
      'wind_direction_10m',
      'wind_gusts_10m',
      'surface_pressure',
      'cloud_cover',
      'visibility',
      'dew_point_2m',
      'precipitation',
      // The evidence behind every description: `weather_code` is a lumped category
      // the provider derives from these, so the raw quantities are carried instead.
      'rain',
      'showers',
      'snowfall',
      'cape',
      'lifted_index',
      'freezing_level_height',
    ].join(','),
    hourly: 'temperature_2m,weather_code,is_day,precipitation_probability,wind_speed_10m,precipitation,showers,snowfall,cape',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max,precipitation_sum,snowfall_sum',
    minutely_15: 'precipitation',
    timezone: 'auto',
    forecast_days: String(FORECAST_DAYS),
    language: 'zh',
  })
  const airParams = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'us_aqi,pm2_5',
    timezone: 'auto',
  })
  // Both requests start in parallel; the forecast is awaited first so its JSON
  // parses while the air response is still in flight under its own budget.
  const resPromise = apiFetch(`${FORECAST_URL}?${params.toString()}`, { signal })
  // Null on any failure, so an early throw below cannot leave this as an
  // unhandled rejection.
  const airPromise = apiFetch(`${AIR_QUALITY_URL}?${airParams.toString()}`, { signal, timeoutMs: AIR_TIMEOUT_MS })
    .catch(() => null)
  const res = await resPromise
  if (!res.ok) throw new Error(`天气数据获取失败（HTTP ${res.status}）`)
  const json = res.json as RawForecast | null

  if (json === null) throw new Error('天气服务暂未返回数据，请稍后重试')
  const current = json.current
  // `null` must fail here just like a missing field: it would otherwise flow into
  // every comparison as 0 — a phantom "0 °C" and frost warning.
  if (current === undefined
    || typeof current.temperature_2m !== 'number'
    || !Number.isFinite(current.temperature_2m)) {
    throw new Error('天气服务暂未返回当前数据，请稍后重试')
  }

  const hourly = json.hourly ?? {}
  const daily = json.daily ?? {}
  // Keep the step CONTAINING the current moment (not the first strictly-after):
  // 14:07 belongs to the 14:00 step, else rain falling now is masked.
  const hourlyFrom = containingGridIndex(hourly.time ?? [], current.time)
  const air = mapAir(await withTimeout(airPromise, AIR_GRACE_MS))

  return {
    location,
    current: mapCurrent(current, current.temperature_2m),
    hourly: mapHourly(hourly, hourlyFrom),
    daily: mapDaily(daily),
    sunrise: daily.sunrise?.[0],
    sunset: daily.sunset?.[0],
    uvIndexMax: daily.uv_index_max?.[0] ?? undefined,
    air,
    ...mapMinutely(json.minutely_15 ?? {}, json.utc_offset_seconds, current.time),
  }
}

/** Hourly points within one day (detail view); unreported fields stay absent, never 0. */
export interface DayHourlyPoint {
  /** Open-Meteo local ISO, e.g. `2026-09-05T14:00`. */
  time: string
  /** Temperature (°C), absent when unreported. */
  temperature?: number
  /** WMO weather code, absent when unreported. */
  weatherCode?: number
  /** Precipitation probability (%), absent when unreported. */
  precipProb?: number
  /** Daylight (the feed's `is_day`; unreported counts as day). */
  isDay: boolean
  /** Wind speed (km/h), absent when unreported. */
  windSpeed?: number
  /** Relative humidity (%), absent when unreported. */
  humidity?: number
}

/** One date's detail: hourly points plus the day's summary. */
export interface DayDetail {
  /** ISO date (YYYY-MM-DD). */
  date: string
  /** Hourly points, ascending; empty array when outside the forecast range. */
  hourly: DayHourlyPoint[]
  /** Sunrise (local ISO). */
  sunrise?: string
  /** Sunset (local ISO). */
  sunset?: string
  /** Total precipitation for the day (mm). */
  precipSum?: number
  /** Day-max gust (km/h). */
  windGustsMax?: number
}

/**
 * Fetch one day's hourly weather (Open-Meteo, timezone auto, metric) for the
 * detail view; shares `FORECAST_URL`, the timeout/cancellation policy and error
 * style with {@link fetchWeather}. `start_date` = `end_date`, so `hourly.time` is
 * that day's 24 hours. Sets no unit params — display units convert at render time.
 */
export async function fetchDayDetail(location: GeoLocation, date: string, signal?: AbortSignal): Promise<DayDetail> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    start_date: date,
    end_date: date,
    hourly: 'temperature_2m,weather_code,is_day,precipitation_probability,wind_speed_10m,relative_humidity_2m',
    daily: 'sunrise,sunset,precipitation_sum,wind_gusts_10m_max',
    timezone: 'auto',
    language: 'zh',
  })
  const res = await apiFetch(`${FORECAST_URL}?${params.toString()}`, signal === undefined ? {} : { signal })
  if (!res.ok) throw new Error(`天气数据获取失败（HTTP ${res.status}）`)
  const json = res.json as {
    hourly?: {
      time?: string[]
      temperature_2m?: (number | null)[]
      weather_code?: (number | null)[]
      is_day?: (number | null)[]
      precipitation_probability?: (number | null)[]
      wind_speed_10m?: (number | null)[]
      relative_humidity_2m?: (number | null)[]
    }
    daily?: {
      sunrise?: string[]
      sunset?: string[]
      precipitation_sum?: (number | null)[]
      wind_gusts_10m_max?: (number | null)[]
    }
  } | null
  // A 200 with an empty/non-JSON body is a broken feed, not "no hourly data" —
  // fetchWeather reports the same error.
  if (json === null) throw new Error('天气服务暂未返回数据，请稍后重试')
  const hourly = json.hourly
  const daily = json.daily
  const hourIsDay = hourly?.is_day ?? []
  // Missing hours are never faked: an empty `time` means no hourly data for that
  // day; a single missing value stays blank and renders as "—", not 0 °C / 0 %.
  return {
    date,
    hourly: (hourly?.time ?? []).map((time, index) => ({
      time,
      temperature: hourly?.temperature_2m?.[index] ?? undefined,
      weatherCode: hourly?.weather_code?.[index] ?? undefined,
      precipProb: hourly?.precipitation_probability?.[index] ?? undefined,
      isDay: (hourIsDay[index] ?? 1) === 1,
      windSpeed: hourly?.wind_speed_10m?.[index] ?? undefined,
      humidity: hourly?.relative_humidity_2m?.[index] ?? undefined,
    })),
    sunrise: daily?.sunrise?.[0],
    sunset: daily?.sunset?.[0],
    precipSum: daily?.precipitation_sum?.[0] ?? undefined,
    windGustsMax: daily?.wind_gusts_10m_max?.[0] ?? undefined,
  }
}
