/**
 * Weather data layer: IP geolocation (multi-provider consensus), Chinese
 * reverse geocoding (BigDataCloud), city search (Open-Meteo Geocoding), and
 * forecast (Open-Meteo Forecast). All endpoints answer browser CORS requests
 * with `Access-Control-Allow-Origin: *`, so the browser half talks to them
 * directly — no Host proxy, no API key.
 *
 * The feed is always fetched in metric units (°C / km/h / mm / hPa) and the
 * display unit (°F/mph) is applied client-side (see units.ts). Every network
 * call goes through {@link apiFetch}, which bounds latency with a timeout and
 * honours an external AbortSignal — a hanging provider must never leave the
 * bar in an eternal "loading" state.
 */
// WMO code families & rule thresholds — single source in condition.ts; the
// alert rules and the UI hints must agree on what counts as rain/thunder/etc.
import { COLD_C, HEAT_C, HEAVY_RAIN_CODES, HEAVY_SNOW_CODES, STORM_CODES, THUNDER_CODES, WIND_ALERT_KMH } from './condition'

/** A resolved place with coordinates, displayed in the weather bar. */
export interface GeoLocation {
  name: string
  latitude: number
  longitude: number
  source: 'ip' | 'gps' | 'manual' | 'search'
  /** Browser-reported positioning radius in metres (populated for `gps` only). */
  accuracy?: number
}

/**
 * Browser Geolocation precision tiers, driven by `position.coords.accuracy`
 * (the confidence radius in metres) rather than by agreement with IP. The
 * browser fix fuses GPS + WiFi + cell-tower and is the only source precise
 * enough for district-scale naming; IP geolocation stays city-level and is
 * only used as the fallback when the fix is missing or too coarse.
 *
 * - `district` — accurate enough to label the 区 (light district precision).
 * - `city`     — coordinate trusted for city naming, but not 区.
 * - `unreliable` — too coarse or absent; fall back to city-level IP.
 */
export type LocationPrecision = 'district' | 'city' | 'unreliable'

/** Accuracy (m) at or below which the browser fix is trusted to the 区 level. */
// Conservative: city districts share long borders, so a fix only a ~1 km off
// can land on the wrong side and label the neighbouring 区 (e.g. 天河 vs 黄埔).
// Requiring a tighter radius means we claim the 区 only when the fix sits well
// inside one district — prefer showing the (correct) city over a wrong district.
const DISTRICT_ACCURACY_M = 1_000
/** Accuracy above which the browser fix is abandoned in favour of city-level IP. */
const CITY_ACCURACY_M = 10_000
/**
 * IP-drift threshold (km). Also the agreement radius for the IP-provider
 * consensus in {@link resolveLocationByIp}: two samples within this distance
 * count as the same place, and a fresh IP consensus farther than this from the
 * cached IP-derived location means the network has moved (VPN / roaming / ISP
 * re-route) — the plugin then adopts the new location automatically.
 */
const AUTO_LOCATION_DRIFT_KM = 50

/** Map a browser-reported accuracy (m) to a precision tier. */
function precisionFromAccuracy(accuracy?: number): LocationPrecision {
  if (accuracy === undefined) return 'unreliable'
  if (accuracy <= DISTRICT_ACCURACY_M) return 'district'
  if (accuracy <= CITY_ACCURACY_M) return 'city'
  return 'unreliable'
}

export interface CurrentWeather {
  temperature: number
  apparentTemperature: number
  /** Relative humidity (%), absent when the feed did not report it. */
  humidity?: number
  /** Sustained wind speed (km/h), absent when the feed did not report it. */
  windSpeed?: number
  weatherCode: number
  isDay: boolean
  /** Meteorological wind direction in degrees (0–360, wind blows *from* this). */
  windDirection?: number
  /** Wind gust speed (km/h). */
  windGusts?: number
  /** Surface air pressure (hPa). */
  pressure?: number
  /** Total cloud cover (0–100 %). */
  cloudCover?: number
  /** Horizontal visibility (km). */
  visibility?: number
  /** Dew point temperature (°C). */
  dewPoint?: number
  /** Current precipitation rate (mm/h). */
  precipitation?: number
}

export interface HourlyPoint {
  /** ISO instant as returned by the API (local time with `timezone=auto`). */
  time: string
  /** Temperature (°C). */
  temperature: number
  weatherCode: number
  precipProb: number
  /** Whether the hour is daylight (derived from the feed's `is_day`). */
  isDay: boolean
  /** Sustained wind speed at this hour (km/h). */
  windSpeed?: number
}

export interface DailyPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string
  weatherCode: number
  /** Day-max temperature (°C). */
  tempMax: number
  /** Day-min temperature (°C). */
  tempMin: number
  precipProb: number
  /** Total precipitation for the day (mm). */
  precipSum?: number
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
  /**
   * Current air quality. `aqi` / `pm25` are individually absent when the feed
   * did not report them — a missing value must never masquerade as `0` (which
   * would read as "excellent AQI").
   */
  air?: { aqi?: number; pm25?: number }
  /** 15-minute precipitation steps for the coming hours (Open-Meteo minutely_15). */
  minutely?: MinutelyPoint[]
  /** Rain timing derived from `minutely` (absent when that feed is unavailable). */
  rainSoon?: RainScan
}

/** Length of one Open-Meteo `minutely_15` step in minutes. */
const MINUTE_STEP_MIN = 15
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
 * Scan minutely precipitation steps for the next rain: is it raining now, and
 * if not, when does the first wet step start and how long does the wet spell
 * last. Steps are in mm per 15 minutes (the API's native unit — precipitation
 * stays metric even when the display unit is °F/mph, so thresholds and totals
 * are unit-independent); a step at/above {@link RAIN_MM_PER_15MIN} counts as
 * rain.
 */
function scanRain(steps: MinutelyPoint[]): RainScan {
  const windowMinutes = steps.length * MINUTE_STEP_MIN
  const wet = (i: number): boolean => steps[i] !== undefined && steps[i].precipitation >= RAIN_MM_PER_15MIN
  if (steps.length === 0) return { rainingNow: false, windowMinutes }
  if (wet(0)) {
    let end = 1
    while (end < steps.length && wet(end)) end += 1
    return { rainingNow: true, durationMinutes: end * MINUTE_STEP_MIN, windowMinutes }
  }
  for (let start = 1; start < steps.length; start += 1) {
    if (!wet(start)) continue
    let end = start + 1
    while (end < steps.length && wet(end)) end += 1
    return {
      rainingNow: false,
      onsetMinutes: start * MINUTE_STEP_MIN,
      durationMinutes: (end - start) * MINUTE_STEP_MIN,
      windowMinutes,
    }
  }
  return { rainingNow: false, windowMinutes }
}

const GEO_SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const REVERSE_GEO_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client'

/** Default per-request budget; IP providers get a shorter one so a dead
 * provider cannot stall the whole location chain for long. */
const REQUEST_TIMEOUT_MS = 10_000
const IP_PROVIDER_TIMEOUT_MS = 6_000
/** Air-quality feed budget — it is additive, so a dead feed must not delay
 * the forecast much beyond its own budget. */
const AIR_TIMEOUT_MS = 5_000
/** Browser-fix budget when resolving or diagnosing a location. */
const GPS_TIMEOUT_MS = 6_000
/** Daily forecast horizon. Keeps the request param and the slice in sync. */
const FORECAST_DAYS = 7

/** Bounded fetch result: the body is read (and JSON-parsed) under the same
 * timeout as the connection, so a stalled response body can never hang. */
interface ApiResponse {
  ok: boolean
  status: number
  /** Raw body text (empty when the response had no body). */
  text: string
  /** JSON.parse result, or null when the body was empty / not JSON. */
  json: unknown
}

/**
 * fetch with a hard timeout and optional external cancellation — covering BOTH
 * the connection and the response-body read (a peer that sends headers but
 * stalls mid-body is as dangerous as one that never answers). Every network
 * call in this module must go through here: without a bound, one hanging free
 * API would leave the bar in an eternal "loading" state. Network-level
 * failures surface as stable, user-presentable Chinese errors instead of raw
 * `TypeError: Failed to fetch`.
 */
async function apiFetch(url: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<ApiResponse> {
  const controller = new AbortController()
  const { signal, timeoutMs = REQUEST_TIMEOUT_MS } = options
  let timedOut = false
  const abortFromOutside = (): void => controller.abort()
  if (signal !== undefined) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', abortFromOutside, { once: true })
  }
  const timer = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    // The abort signal stays armed while reading the body, so a stalled body
    // hits the same timeout/cancellation path as a stalled connection.
    const text = await res.text()
    let json: unknown = null
    if (text !== '') {
      try {
        json = JSON.parse(text)
      } catch {
        json = null
      }
    }
    return { ok: res.ok, status: res.status, text, json }
  } catch {
    // Distinguish the three failure causes so the UI can say something true:
    // our own timeout, a caller-initiated cancellation, or a network error.
    if (timedOut) throw new Error('请求超时，请稍后重试')
    if (signal?.aborted) throw new Error('请求已取消')
    throw new Error('网络请求失败，请检查网络连接后重试')
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', abortFromOutside)
  }
}

/**
 * Index of the grid step that CONTAINS `current` (the last `time <= current`).
 * A weather moment at 14:07 belongs to the 14:00 step — starting the window at
 * the first step >= 14:07 would drop the 14:00 step and, with it, rain that is
 * falling right now. Falls back to 0 when the grid starts after `current`.
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

/**
 * Query one IP geolocation endpoint (browser-CORS friendly, no key). Returns
 * null on any failure so callers can combine providers. Field names differ
 * across providers (`latitude/longitude` vs `lat/lon`), so both are read.
 */
async function sampleIpLocation(url: string): Promise<GeoLocation | null> {
  try {
    const res = await apiFetch(url, { timeoutMs: IP_PROVIDER_TIMEOUT_MS })
    if (!res.ok) return null
    const json = res.json as {
      city?: string
      region?: string
      latitude?: string | number
      longitude?: string | number
      lat?: string | number
      lon?: string | number
    } | null
    if (json === null) return null
    const toNumber = (value: string | number | undefined): number => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN
      if (typeof value === 'string' && value.trim() !== '') return Number(value.trim())
      return Number.NaN
    }
    const latitude = toNumber(json.latitude ?? json.lat)
    const longitude = toNumber(json.longitude ?? json.lon)
    // Empty-string coordinates must not silently become the (0,0) sample in
    // the Gulf of Guinea.
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    const city = (json.city ?? '').trim()
    const region = (json.region ?? '').trim()
    const name = city !== '' ? city : region !== '' ? region : '当前位置'
    return { name, latitude, longitude, source: 'ip' }
  } catch {
    return null
  }
}

/**
 * Resolve the current location by IP with a consensus vote across three
 * independent, browser-CORS-friendly providers. IP databases disagree wildly
 * for some networks (this machine's egress rotates across multiple IPs, and a
 * single provider mislabels them as Zhengzhou or Qingyuan), so the sample
 * closest to the most other samples (within 50 km) wins and its cluster is
 * averaged. geojs.io is deliberately excluded — it was consistently wrong here.
 */
async function resolveLocationByIp(): Promise<GeoLocation> {
  const samples = await Promise.all([
    sampleIpLocation('https://ipwho.is/'),
    sampleIpLocation('https://api.ipapi.is/'),
    sampleIpLocation('https://free.freeipapi.com/api/json'),
  ])
  const ok = samples.filter((sample): sample is GeoLocation => sample !== null)
  if (ok.length === 0) throw new Error('IP 定位服务不可用')

  let best = ok[0]
  let bestCount = 1
  for (const candidate of ok) {
    const count = ok.filter((other) =>
      haversineKm(candidate.latitude, candidate.longitude, other.latitude, other.longitude) <= AUTO_LOCATION_DRIFT_KM,
    ).length
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  const cluster = ok.filter((other) =>
    haversineKm(best.latitude, best.longitude, other.latitude, other.longitude) <= AUTO_LOCATION_DRIFT_KM,
  )
  const latitude = cluster.reduce((sum, sample) => sum + sample.latitude, 0) / cluster.length
  const longitude = cluster.reduce((sum, sample) => sum + sample.longitude, 0) / cluster.length
  return { name: best.name, latitude, longitude, source: 'ip' }
}

/**
 * First-level areas whose official short form is not simply `<名>省`.
 * Geocoding back-ends occasionally return the bare stem (`广西`, `内蒙古`);
 * mapping them keeps the composed address official (`广西壮族自治区`, …).
 */
const SPECIAL_FIRST_LEVEL: Record<string, string> = {
  内蒙古: '内蒙古自治区',
  广西: '广西壮族自治区',
  西藏: '西藏自治区',
  宁夏: '宁夏回族自治区',
  新疆: '新疆维吾尔自治区',
}

/**
 * Normalize a first-level administrative area to its official Chinese short
 * form with suffix (`广东` → `广东省`, `广西` → `广西壮族自治区`).
 * Non-Chinese areas pass through.
 */
function normalizeFirstLevel(admin1: string, countryCode: string | undefined): string {
  if (countryCode !== 'CN') return admin1
  if (/[省市]$/.test(admin1) || admin1.endsWith('自治区') || admin1.endsWith('特别行政区')) return admin1
  return SPECIAL_FIRST_LEVEL[admin1] ?? `${admin1}省`
}

/**
 * Compose a display name in the standard Chinese address form, province first
 * with suffixes and no separators (`广东省` + `广州市` → `广东省广州市`). A
 * first-level area that merely repeats the city (直辖市如「北京市 · 北京」)
 * contributes only the city itself. Non-Chinese results keep the
 * `admin1 · name` form.
 */
function qualifyCityName(name: string, admin1: string | undefined, countryCode?: string): string {
  if (admin1 === undefined || admin1 === '' || admin1 === name) return name
  if (admin1.includes(name)) {
    return countryCode === 'CN' && !/[市区县]$/.test(name) ? `${name}市` : name
  }
  if (countryCode === 'CN') {
    const city = /[市区县镇乡]$/.test(name) ? name : `${name}市`
    return `${normalizeFirstLevel(admin1, 'CN')}${city}`
  }
  return `${admin1} · ${name}`
}

/** A Chinese administrative address with official suffixes (省/市/区). */
interface ChineseAddress {
  province?: string
  city?: string
  district?: string
}

/**
 * Reverse-geocode coordinates to a Chinese administrative address
 * (BigDataCloud, `localityLanguage=zh-Hans` → simplified Chinese).
 */
async function reverseGeocodeAddress(latitude: number, longitude: number): Promise<ChineseAddress> {
  const url = `${REVERSE_GEO_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=zh-Hans`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error(`反向地理编码响应异常（HTTP ${res.status}）`)
  const json = res.json as {
    principalSubdivision?: string
    city?: string
    locality?: string
  } | null
  return {
    province: json?.principalSubdivision,
    city: json?.city,
    district: json?.locality,
  }
}

/**
 * Reduce any display name to city level (`广东省广州市黄埔区` → `广东省广州市`,
 * `北京市朝阳区` → `北京市`). District precision is not shown by design — IP
 * geolocation cannot resolve districts reliably.
 */
export function cityLevelName(name: string): string {
  const trimmed = name.trim()
  const match = /^(.+?市)(?:[^省州市]+区)?$/.exec(trimmed)
  return match !== null ? match[1] : trimmed
}

/**
 * Compose `广东省广州市黄埔区` from administrative parts: province + city
 * (+ district when `includeDistrict` and the precision justifies it), each
 * kept with its own suffix, dropping a province that repeats the city
 * (直辖市). District is only appended when the caller has a browser fix that
 * is trustworthy at that scale — IP geolocation cannot resolve districts.
 */
function composeAddressName(address: ChineseAddress, includeDistrict = false): string {
  const { province, city, district } = address
  if (city === undefined || city === '') {
    // 直辖市等只有省/市同名、且 locality 直接给出区的情形（如 北京市 + 朝阳区）。
    if (includeDistrict
      && province !== undefined && province !== ''
      && district !== undefined && district !== '' && district !== province
      && /市$/.test(province)) {
      return `${province}${district}`
    }
    return province ?? ''
  }
  const parts: string[] = []
  if (province !== undefined && province !== '' && province !== city) parts.push(province)
  parts.push(city)
  if (includeDistrict && district !== undefined && district !== '' && district !== city) {
    parts.push(district)
  }
  return parts.join('')
}

/**
 * Localize an IP-resolved location's display name to Chinese via Open-Meteo
 * geocoding (`language=zh`). The IP service returns English names, so the
 * English name is searched and the hit nearest to the resolved coordinates is
 * used; the original name is kept when nothing matches. This is the fallback
 * path — the primary source is {@link reverseGeocodeAddress}.
 */
async function localizeCityName(location: GeoLocation): Promise<string> {
  const trimmed = location.name.trim()
  if (trimmed === '' || trimmed === '当前位置') return trimmed
  const url = `${GEO_SEARCH_URL}?name=${encodeURIComponent(trimmed)}&count=10&language=zh&format=json`
  try {
    const res = await apiFetch(url)
    if (!res.ok) return location.name
    const json = res.json as {
      results?: Array<{ name: string; latitude: number; longitude: number; admin1?: string; country_code?: string }>
    } | null
    const results = json?.results ?? []
    if (results.length === 0) return location.name
    let best = results[0]
    let bestDistance = Number.POSITIVE_INFINITY
    for (const candidate of results) {
      const dLat = candidate.latitude - location.latitude
      const dLon = candidate.longitude - location.longitude
      const distance = dLat * dLat + dLon * dLon
      if (distance < bestDistance) {
        bestDistance = distance
        best = candidate
      }
    }
    return qualifyCityName(best.name, best.admin1, best.country_code)
  } catch {
    return location.name
  }
}

/**
 * Try the browser Geolocation API (GPS/WiFi). The page runs on a loopback
 * origin (secure context), so the API is available. High-accuracy fixes can be
 * slow or unavailable where the browser's location service is unreliable, so
 * this keeps a short internal timeout and the caller caps the total wait.
 */
function resolveLocationByBrowser(): Promise<GeoLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
      reject(new Error('浏览器不支持定位'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          name: '当前位置',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: 'gps',
          accuracy: position.coords.accuracy,
        })
      },
      (error) => {
        reject(new Error(`浏览器定位失败（${error.message}）`))
      },
      { enableHighAccuracy: true, timeout: 5_000, maximumAge: 60_000 },
    )
  })
}

/** Great-circle distance in kilometres (clamped against floating-point
 * overshoot at near-antipodal points, which would otherwise yield NaN). */
function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.min(1, Math.max(0, Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2))
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Resolve a promise or return null after `ms`, whichever comes first. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise.catch(() => null),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Raw results of one location-diagnostics pass (shown in the settings view). */
export interface LocationDiagnostics {
  gps: { status: 'ok' | 'error' | 'timeout'; latitude?: number; longitude?: number; accuracy?: number; error?: string }
  ip: { status: 'ok' | 'error'; city?: string; latitude?: number; longitude?: number; error?: string }
  gpsIpDistanceKm?: number
  chosen: 'gps' | 'ip' | 'none'
  /** Precision tier of the chosen source (`gps` tier, or `none`). */
  precision?: LocationPrecision
}

/**
 * Resolve the current location with a Chinese administrative display name.
 *
 * Positioning: the browser GPS/WiFi fix is the primary source. It fuses
 * GPS + WiFi + cell-tower and is the only source precise enough for
 * district-scale naming — we trust it at the 区 level when its reported
 * accuracy is ≤ {@link DISTRICT_ACCURACY_M}, and at city level up to
 * {@link CITY_ACCURACY_M}. IP geolocation (city-level) is only the fallback
 * when the fix is missing or too coarse; this replaces the old "GPS must
 * agree with IP within 50 km" rule, which wrongly discarded a good fix
 * whenever a single mislabelled IP drifted (this network's egress rotates and
 * mislabels the same connection as different cities).
 *
 * Naming: reverse geocode the coordinates to 省/市/区 (BigDataCloud,
 * simplified), Open-Meteo city-name localization as fallback.
 */
export async function resolveAutoLocation(): Promise<GeoLocation> {
  // Keep a neutralised fallback alive so GPS not being needed doesn't leak an
  // unhandled rejection (resolveLocationByIp throws when every provider fails).
  const ipPromise = resolveLocationByIp().catch(() => null)
  const gpsResult = await withTimeout(resolveLocationByBrowser(), GPS_TIMEOUT_MS)

  const precision = gpsResult !== null ? precisionFromAccuracy(gpsResult.accuracy) : 'unreliable'
  if (gpsResult !== null && precision !== 'unreliable') {
    const name = await resolveDisplayName(gpsResult, precision)
    return { ...gpsResult, name }
  }

  const ipResult = await ipPromise
  if (ipResult === null) throw new Error('IP 定位服务不可用')
  const name = await resolveDisplayName(ipResult, 'city')
  return { ...ipResult, name }
}

/**
 * Detect whether a cached IP-derived location has drifted: probe a fresh IP
 * consensus and, when it disagrees with the cache by more than
 * {@link AUTO_LOCATION_DRIFT_KM}, resolve a fresh location (GPS-first with the
 * usual IP fallback and reverse-geocoded name) for the caller to adopt.
 * GPS-derived caches are never re-checked against IP — they were validated by
 * their reported accuracy at resolve time, and this network's IP rotates and
 * mislabels too wildly to be a reliable check against them.
 * @returns the fresh location when the network has moved, null otherwise
 * (no drift, or a probe failed — drift switching must never brick the bar).
 */
export async function resolveFreshIfDrifted(
  cached: Pick<GeoLocation, 'latitude' | 'longitude' | 'source'>,
): Promise<GeoLocation | null> {
  if (cached.source === 'gps') return null
  let ip: GeoLocation | null = null
  try {
    ip = await resolveLocationByIp()
  } catch {
    ip = null
  }
  if (ip === null) return null
  if (haversineKm(cached.latitude, cached.longitude, ip.latitude, ip.longitude) <= AUTO_LOCATION_DRIFT_KM) {
    return null
  }
  return resolveAutoLocation().catch(() => null)
}

/**
 * Reverse-geocode a selected base to a Chinese display name. When the base is
 * a browser fix trusted at {@link 'district'} precision the 区 is appended;
 * city-level sources (or coarse fixes) keep the 省/市 form. Open-Meteo city
 * name localization is used when reverse geocoding fails or returns nothing.
 */
async function resolveDisplayName(base: GeoLocation, precision: LocationPrecision): Promise<string> {
  try {
    const composed = composeAddressName(
      await reverseGeocodeAddress(base.latitude, base.longitude),
      precision === 'district',
    )
    if (composed !== '') return composed
  } catch {
    // fall through to the Open-Meteo localization fallback below
  }
  return localizeCityName(base)
}

/**
 * Run one diagnostics pass over the positioning sources (for the UI).
 * Unlike {@link resolveAutoLocation} this distinguishes a rejection
 * (permission denied / unavailable) from a timeout so the settings view can
 * tell the user apart.
 */
export async function runLocationDiagnostics(): Promise<LocationDiagnostics> {
  const gpsAttempt = (async (): Promise<{ kind: 'ok' | 'error'; loc?: GeoLocation; error?: string }> => {
    try {
      return { kind: 'ok', loc: await resolveLocationByBrowser() }
    } catch (err) {
      return { kind: 'error', error: err instanceof Error ? err.message : String(err) }
    }
  })()
  // Both probes run in parallel; the GPS race clears its timer on every path
  // (ok/error/timeout) so diagnostics never leak a pending ≤6 s timer.
  const ipPromise = resolveLocationByIp()
  const gpsProbe = await new Promise<{ kind: 'ok' | 'error' | 'timeout'; loc?: GeoLocation; error?: string }>((resolve) => {
    const timer = window.setTimeout(() => resolve({ kind: 'timeout' }), GPS_TIMEOUT_MS)
    void gpsAttempt.then((result) => {
      window.clearTimeout(timer)
      resolve(result)
    })
  })
  let ip: LocationDiagnostics['ip']
  try {
    const ipLoc = await ipPromise
    ip = { status: 'ok', city: ipLoc.name, latitude: ipLoc.latitude, longitude: ipLoc.longitude }
  } catch (err) {
    ip = { status: 'error', error: err instanceof Error ? err.message : String(err) }
  }

  const gpsRaw = gpsProbe.kind === 'ok' && gpsProbe.loc !== undefined ? gpsProbe.loc : null
  const gps: LocationDiagnostics['gps'] = gpsProbe.kind === 'ok' && gpsRaw !== null
    ? { status: 'ok', latitude: gpsRaw.latitude, longitude: gpsRaw.longitude, accuracy: gpsRaw.accuracy }
    : gpsProbe.kind === 'error'
      ? { status: 'error', error: gpsProbe.error }
      : { status: 'timeout' }
  const distance = gpsRaw !== null && ip.status === 'ok'
    ? haversineKm(gpsRaw.latitude, gpsRaw.longitude, ip.latitude!, ip.longitude!)
    : undefined
  const precision = gpsRaw !== null ? precisionFromAccuracy(gpsRaw.accuracy) : 'unreliable'
  const chosen = precision !== 'unreliable' ? 'gps' : ip.status === 'ok' ? 'ip' : 'none'
  return { gps, ip, gpsIpDistanceKm: distance, chosen, precision: chosen === 'gps' ? precision : undefined }
}

/** Search cities by name (Chinese names supported via `language=zh`). */
export async function searchCity(query: string, limit = 5): Promise<GeoLocation[]> {
  const trimmed = query.trim()
  if (trimmed === '') return []
  const url = `${GEO_SEARCH_URL}?name=${encodeURIComponent(trimmed)}&count=${limit}&language=zh&format=json`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error(`城市搜索响应异常（HTTP ${res.status}）`)
  const json = res.json as {
    results?: Array<{
      name: string
      latitude: number
      longitude: number
      country?: string
      country_code?: string
      admin1?: string
    }>
  } | null
  return (json?.results ?? []).map((result) => ({
    name: qualifyCityName(result.name, result.admin1, result.country_code),
    latitude: result.latitude,
    longitude: result.longitude,
    source: 'search' as const,
  }))
}

/**
 * Fetch the current + hourly + daily forecast for a place, plus air quality.
 *
 * The payload is always metric (°C / km/h / mm / hPa); display conversion
 * happens client-side (units.ts), so the cached snapshot stays valid across
 * unit toggles instead of forcing a re-fetch. Every request honours `signal`
 * and a hard timeout through {@link apiFetch}; the air-quality feed is
 * additive and runs under its own shorter budget so a dead air endpoint never
 * sinks the forecast for long.
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
    ].join(','),
    hourly: 'temperature_2m,weather_code,is_day,precipitation_probability,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max,precipitation_sum',
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
  // parses while the air response is still in flight (bounded by its own
  // AIR_TIMEOUT_MS) — a slow air feed cannot hold up the weather.
  const resPromise = apiFetch(`${FORECAST_URL}?${params.toString()}`, { signal })
  // Null on any failure so an early throw below (forecast HTTP error) can
  // never leave this in-flight request as an unhandled rejection.
  const airPromise = apiFetch(`${AIR_QUALITY_URL}?${airParams.toString()}`, { signal, timeoutMs: AIR_TIMEOUT_MS })
    .catch(() => null)
  const res = await resPromise
  if (!res.ok) throw new Error(`天气数据获取失败（HTTP ${res.status}）`)
  const json = res.json as {
    current?: {
      time?: string
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
    }
    hourly?: {
      time?: string[]
      temperature_2m?: (number | null)[]
      weather_code?: (number | null)[]
      is_day?: (number | null)[]
      precipitation_probability?: (number | null)[]
      wind_speed_10m?: (number | null)[]
    }
    daily?: {
      time?: string[]
      weather_code?: (number | null)[]
      temperature_2m_max?: (number | null)[]
      temperature_2m_min?: (number | null)[]
      precipitation_probability_max?: (number | null)[]
      sunrise?: string[]
      sunset?: string[]
      uv_index_max?: (number | null)[]
      precipitation_sum?: (number | null)[]
    }
    minutely_15?: {
      time?: string[]
      precipitation?: (number | null)[]
    }
  } | null

  if (json === null) throw new Error('天气服务暂未返回数据，请稍后重试')
  const current = json.current
  if (current === undefined || current.temperature_2m === undefined) {
    throw new Error('天气服务暂未返回当前数据，请稍后重试')
  }
  const hourly = json.hourly
  const daily = json.daily
  const nowIso = current.time

  // Grid alignment: keep the step that CONTAINS the current moment (not the
  // first strictly-after one) — a moment at 14:07 belongs to the 14:00 step,
  // and dropping it would mask rain that is falling right now or a severe
  // hour within the lead-time window.
  const hourlyFrom = containingGridIndex(hourly?.time ?? [], nowIso)
  const hourIsDay = hourly?.is_day ?? []

  // 15-minute precipitation, kept in mm (unit-independent). Align to the step
  // containing now and keep MINUTELY_STEPS ahead (6 h) — enough for a useful
  // rain strip and early-onset detection without carrying the full 24 h.
  let minutely: WeatherData['minutely']
  let rainSoon: WeatherData['rainSoon']
  const minuteTimes = json.minutely_15?.time ?? []
  if (minuteTimes.length > 0) {
    const minuteFrom = containingGridIndex(minuteTimes, nowIso)
    const precipitation = json.minutely_15?.precipitation ?? []
    const steps: MinutelyPoint[] = minuteTimes.slice(minuteFrom, minuteFrom + MINUTELY_STEPS)
      .map((time, index) => ({
        time,
        precipitation: precipitation[minuteFrom + index] ?? 0,
      }))
    minutely = steps
    rainSoon = scanRain(steps)
  }

  // Air quality is additive: parse it after the main JSON so the forecast is
  // not held up; individual values stay absent (not 0) when unreported, and a
  // feed that reports null for a station must not masquerade as 0/undefined.
  let air: WeatherData['air']
  const airRes = await airPromise
  if (airRes !== null && airRes.ok) {
    const airJson = airRes.json as { current?: { us_aqi?: number | null; pm2_5?: number | null } } | null
    const aqi = airJson?.current?.us_aqi ?? undefined
    const pm25 = airJson?.current?.pm2_5 ?? undefined
    if (aqi !== undefined || pm25 !== undefined) {
      air = { aqi, pm25 }
    }
  }

  return {
    location,
    current: {
      temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature ?? current.temperature_2m,
      humidity: current.relative_humidity_2m ?? undefined,
      windSpeed: current.wind_speed_10m ?? undefined,
      weatherCode: current.weather_code ?? -1,
      isDay: (current.is_day ?? 1) === 1,
      windDirection: current.wind_direction_10m ?? undefined,
      windGusts: current.wind_gusts_10m ?? undefined,
      pressure: current.surface_pressure ?? undefined,
      cloudCover: current.cloud_cover ?? undefined,
      visibility: current.visibility ?? undefined,
      dewPoint: current.dew_point_2m ?? undefined,
      precipitation: current.precipitation ?? undefined,
    },
    hourly: (hourly?.time ?? []).slice(hourlyFrom, hourlyFrom + 24).map((time, index) => ({
      time,
      temperature: hourly?.temperature_2m?.[hourlyFrom + index] ?? 0,
      weatherCode: hourly?.weather_code?.[hourlyFrom + index] ?? -1,
      isDay: (hourIsDay[hourlyFrom + index] ?? 1) === 1,
      precipProb: hourly?.precipitation_probability?.[hourlyFrom + index] ?? 0,
      windSpeed: hourly?.wind_speed_10m?.[hourlyFrom + index] ?? undefined,
    })),
    daily: (daily?.time ?? []).slice(0, FORECAST_DAYS).map((date, index) => ({
      date,
      weatherCode: daily?.weather_code?.[index] ?? -1,
      tempMax: daily?.temperature_2m_max?.[index] ?? 0,
      tempMin: daily?.temperature_2m_min?.[index] ?? 0,
      precipProb: daily?.precipitation_probability_max?.[index] ?? 0,
      precipSum: daily?.precipitation_sum?.[index] ?? undefined,
    })),
    sunrise: daily?.sunrise?.[0],
    sunset: daily?.sunset?.[0],
    uvIndexMax: daily?.uv_index_max?.[0] ?? undefined,
    air,
    minutely,
    rainSoon,
  }
}

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
 * Rule-based severe-weather evaluation. Open-Meteo has no alert coverage for
 * China (MeteoAlarm is Europe-centric), so the plugin derives actionable
 * alerts from the observed and forecast weather itself.
 *
 * Two tiers are evaluated:
 * - **Current** — what the conditions are right now (`heat`/`cold`/`wind`/
 *   `heavy-rain`/`thunder`/`heavy-snow`).
 * - **Lead time** (`*-soon`) — a severe condition in the next {@link LEAD_HOURS}
 *   hours of the hourly forecast, only when the matching current alert is not
 *   already firing, so a storm/heatwave on the way gets announced ahead of time
 *   without double-notifying an ongoing one. The scan starts at the hourly
 *   step that CONTAINS the current moment (see fetchWeather), so events in the
 *   remainder of the current hour are covered; the dedupe keys above prevent
 *   double-notifying conditions that are already firing.
 *
 * Values are metric (°C / km/h); `fmt` renders temperatures and `windFmt`
 * renders wind speeds in the active display unit so the alert text never mixes
 * units with the rest of the UI.
 * @param fmt - temperature formatter bound to the active display unit.
 * @param windFmt - wind-speed formatter bound to the active display unit
 *   (defaults to raw metric km/h for callers without a unit preference).
 */
export function evaluateAlerts(
  data: WeatherData,
  fmt: (value: number) => string,
  windFmt: (kmh: number) => string = (kmh) => `${Math.round(kmh)} km/h`,
): WeatherAlert[] {
  const alerts: WeatherAlert[] = []
  const hasKey = (key: string): boolean => alerts.some((alert) => alert.key === key)
  const current = data.current

  if (current.temperature >= HEAT_C) {
    alerts.push({ key: 'heat', level: 'warning', title: '高温', detail: `当前 ${fmt(current.temperature)}，注意防暑` })
  } else if (current.temperature <= COLD_C) {
    alerts.push({ key: 'cold', level: 'warning', title: '低温', detail: `当前 ${fmt(current.temperature)}，注意保暖` })
  }
  const windKmh = current.windSpeed
  if (windKmh !== undefined && windKmh >= WIND_ALERT_KMH) {
    alerts.push({ key: 'wind', level: 'warning', title: '大风', detail: `风速 ${windFmt(windKmh)}` })
  }
  const code = current.weatherCode
  if (HEAVY_RAIN_CODES.has(code)) {
    alerts.push({ key: 'heavy-rain', level: 'danger', title: '强降雨', detail: '大雨或暴风雨，注意出行安全' })
  } else if (THUNDER_CODES.has(code)) {
    alerts.push({ key: 'thunder', level: 'danger', title: '雷暴', detail: '雷电天气，注意防范' })
  }
  if (HEAVY_SNOW_CODES.has(code)) {
    alerts.push({ key: 'heavy-snow', level: 'warning', title: '强降雪', detail: '大雪天气，注意路况' })
  }

  // Lead-time tier: scan the hourly grid from the step containing now.
  const future = data.hourly.slice(0, LEAD_HOURS)
  if (future.length > 0) {
    const stormSoon = future.some((h) => STORM_CODES.has(h.weatherCode))
    if (stormSoon && !hasKey('heavy-rain') && !hasKey('thunder')) {
      alerts.push({
        key: 'storm-soon',
        level: 'danger',
        title: '强降雨/雷暴',
        detail: `未来 ${LEAD_HOURS} 小时可能有强降雨或雷暴，请留意天气变化`,
      })
    }
    const heatMaxC = Math.max(...future.map((h) => h.temperature))
    if (heatMaxC >= HEAT_C && !hasKey('heat')) {
      alerts.push({
        key: 'heat-soon',
        level: 'warning',
        title: '高温',
        detail: `未来 ${LEAD_HOURS} 小时最高可达 ${fmt(heatMaxC)}，注意防暑`,
      })
    }
    const coldMinC = Math.min(...future.map((h) => h.temperature))
    if (coldMinC <= COLD_C && !hasKey('cold')) {
      alerts.push({
        key: 'cold-soon',
        level: 'warning',
        title: '低温',
        detail: `未来 ${LEAD_HOURS} 小时最低将降至 ${fmt(coldMinC)}，注意保暖`,
      })
    }
    const windSpeeds = future.map((h) => h.windSpeed).filter((v): v is number => v !== undefined)
    if (windSpeeds.length > 0 && Math.max(...windSpeeds) >= WIND_ALERT_KMH && !hasKey('wind')) {
      alerts.push({
        key: 'wind-soon',
        level: 'warning',
        title: '大风',
        detail: `未来 ${LEAD_HOURS} 小时风力较大（最大 ${windFmt(Math.max(...windSpeeds))}），注意高空坠物`,
      })
    }
    if (future.some((h) => HEAVY_SNOW_CODES.has(h.weatherCode)) && !hasKey('heavy-snow')) {
      alerts.push({
        key: 'snow-soon',
        level: 'warning',
        title: '强降雪',
        detail: `未来 ${LEAD_HOURS} 小时可能有强降雪，注意路况`,
      })
    }
  }

  return alerts
}
