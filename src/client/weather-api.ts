/**
 * Weather data layer: IP geolocation (multi-provider consensus), Chinese
 * reverse geocoding (BigDataCloud), city search (Open-Meteo Geocoding), and
 * forecast (Open-Meteo Forecast). All endpoints answer browser CORS requests
 * with `Access-Control-Allow-Origin: *`, so the browser half talks to them
 * directly — no Host proxy, no API key.
 */

/** A resolved place with coordinates, displayed in the weather bar. */
export interface GeoLocation {
  name: string
  latitude: number
  longitude: number
  source: 'ip' | 'gps' | 'manual' | 'search'
}

export interface CurrentWeather {
  temperature: number
  apparentTemperature: number
  humidity: number
  windSpeed: number
  weatherCode: number
  isDay: boolean
}

export interface HourlyPoint {
  /** ISO instant as returned by the API (local time with `timezone=auto`). */
  time: string
  temperature: number
  weatherCode: number
  precipProb: number
}

export interface DailyPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string
  weatherCode: number
  tempMax: number
  tempMin: number
  precipProb: number
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
  /** Current air quality (US AQI + PM2.5), absent when the feed is unavailable. */
  air?: { aqi: number; pm25: number }
  unitLabel: '°C' | '°F'
}

const GEO_SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const REVERSE_GEO_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client'

/**
 * Query one IP geolocation endpoint (browser-CORS friendly, no key). Returns
 * null on any failure so callers can combine providers. Field names differ
 * across providers (`latitude/longitude` vs `lat/lon`), so both are read.
 */
async function sampleIpLocation(url: string): Promise<GeoLocation | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json() as {
      city?: string
      region?: string
      latitude?: string | number
      longitude?: string | number
      lat?: string | number
      lon?: string | number
    }
    const latitude = Number(json.latitude ?? json.lat)
    const longitude = Number(json.longitude ?? json.lon)
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
export async function resolveLocationByIp(): Promise<GeoLocation> {
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
      haversineKm(candidate.latitude, candidate.longitude, other.latitude, other.longitude) <= 50,
    ).length
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  const cluster = ok.filter((other) =>
    haversineKm(best.latitude, best.longitude, other.latitude, other.longitude) <= 50,
  )
  const latitude = cluster.reduce((sum, sample) => sum + sample.latitude, 0) / cluster.length
  const longitude = cluster.reduce((sum, sample) => sum + sample.longitude, 0) / cluster.length
  return { name: best.name, latitude, longitude, source: 'ip' }
}

/**
 * Normalize a first-level administrative area to its official Chinese short
 * form with suffix (`广东` → `广东省`). Non-Chinese areas pass through.
 */
function normalizeFirstLevel(admin1: string, countryCode: string | undefined): string {
  if (countryCode !== 'CN') return admin1
  if (/[省市]$/.test(admin1) || admin1.endsWith('自治区') || admin1.endsWith('特别行政区')) return admin1
  return `${admin1}省`
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
export interface ChineseAddress {
  province?: string
  city?: string
  district?: string
}

/**
 * Reverse-geocode coordinates to a Chinese administrative address
 * (BigDataCloud, `localityLanguage=zh-Hans` → simplified Chinese).
 */
export async function reverseGeocodeAddress(latitude: number, longitude: number): Promise<ChineseAddress> {
  const url = `${REVERSE_GEO_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=zh-Hans`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`反向地理编码响应异常（HTTP ${res.status}）`)
  const json = await res.json() as {
    principalSubdivision?: string
    city?: string
    locality?: string
  }
  return {
    province: json.principalSubdivision,
    city: json.city,
    district: json.locality,
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
 * Compose `广东省广州市` from administrative parts: province + city, each
 * kept with its own suffix, dropping a province that repeats the city
 * (直辖市). District-level precision is intentionally NOT shown — IP
 * geolocation can only be trusted at city level.
 */
export function composeAddressName(address: ChineseAddress): string {
  const { province, city } = address
  if (city === undefined || city === '') return province ?? ''
  const parts: string[] = []
  if (province !== undefined && province !== '' && province !== city) parts.push(province)
  parts.push(city)
  // District (区) display is disabled: IP geolocation cannot resolve districts
  // reliably, and weather is city-level anyway. Uncomment to re-enable:
  // const { district } = address
  // if (district !== undefined && district !== '' && district !== city) parts.push(district)
  return parts.join('')
}

/**
 * Localize an IP-resolved location's display name to Chinese via Open-Meteo
 * geocoding (`language=zh`). The IP service returns English names, so the
 * English name is searched and the hit nearest to the resolved coordinates is
 * used; the original name is kept when nothing matches. This is the fallback
 * path — the primary source is {@link reverseGeocodeAddress}.
 */
export async function localizeCityName(location: GeoLocation): Promise<string> {
  const trimmed = location.name.trim()
  if (trimmed === '' || trimmed === '当前位置') return trimmed
  const url = `${GEO_SEARCH_URL}?name=${encodeURIComponent(trimmed)}&count=10&language=zh&format=json`
  try {
    const res = await fetch(url)
    if (!res.ok) return location.name
    const json = await res.json() as {
      results?: Array<{ name: string; latitude: number; longitude: number; admin1?: string; country_code?: string }>
    }
    const results = json.results ?? []
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
export function resolveLocationByBrowser(): Promise<GeoLocation> {
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
        })
      },
      (error) => {
        reject(new Error(`浏览器定位失败（${error.message}）`))
      },
      { enableHighAccuracy: true, timeout: 5_000, maximumAge: 60_000 },
    )
  })
}

/** Great-circle distance in kilometres. */
export function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
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
  gps: { status: 'ok' | 'error' | 'timeout'; latitude?: number; longitude?: number; error?: string }
  ip: { status: 'ok' | 'error'; city?: string; latitude?: number; longitude?: number; error?: string }
  gpsIpDistanceKm?: number
  chosen: 'gps' | 'ip' | 'none'
}

/**
 * Resolve the current location with a Chinese administrative display name.
 *
 * Positioning: the browser GPS and the IP location run in parallel. The IP
 * (ipwho.is, city-level) is the reliability anchor and usually returns within
 * a second; the GPS gets a short capped wait. GPS is trusted only when it
 * roughly agrees with the IP (within 50 km) — in environments where the
 * browser's location service is unreliable it can return wildly wrong fixes
 * (e.g. a Qingyuan reading for a Guangzhou network), and for weather the
 * city-level IP truth beats a garbage GPS reading.
 *
 * Naming: reverse geocode the coordinates to 省/市/区 (BigDataCloud,
 * simplified), Open-Meteo city-name localization as fallback.
 */
export async function resolveAutoLocation(): Promise<GeoLocation> {
  const gpsPromise = resolveLocationByBrowser()
  const ipPromise = resolveLocationByIp()
  const ipResult = await ipPromise
  const gpsResult = await withTimeout(gpsPromise, 6_000)

  let base: GeoLocation
  if (gpsResult !== null && haversineKm(
    gpsResult.latitude, gpsResult.longitude,
    ipResult.latitude, ipResult.longitude,
  ) <= 50) {
    base = gpsResult
  } else {
    base = ipResult
  }
  let name = base.name
  try {
    const composed = composeAddressName(await reverseGeocodeAddress(base.latitude, base.longitude))
    if (composed !== '') name = composed
  } catch {
    // fall through to the Open-Meteo localization fallback below
  }
  if (name === base.name) {
    name = await localizeCityName(base)
  }
  return { ...base, name }
}

/** Run one diagnostics pass over the positioning sources (for the UI). */
export async function runLocationDiagnostics(): Promise<LocationDiagnostics> {
  const gpsPromise = resolveLocationByBrowser()
  const ipPromise = resolveLocationByIp()
  const gpsRaw = await withTimeout(gpsPromise, 6_000)
  let ip: LocationDiagnostics['ip']
  try {
    const ipLoc = await ipPromise
    ip = { status: 'ok', city: ipLoc.name, latitude: ipLoc.latitude, longitude: ipLoc.longitude }
  } catch (err) {
    ip = { status: 'error', error: err instanceof Error ? err.message : String(err) }
  }
  const gps = gpsRaw !== null
    ? { status: 'ok' as const, latitude: gpsRaw.latitude, longitude: gpsRaw.longitude }
    : { status: 'timeout' as const }
  const distance = gpsRaw !== null && ip.status === 'ok'
    ? haversineKm(gpsRaw.latitude, gpsRaw.longitude, ip.latitude!, ip.longitude!)
    : undefined
  const chosen = gpsRaw !== null && distance !== undefined && distance <= 50 ? 'gps' : ip.status === 'ok' ? 'ip' : 'none'
  return { gps, ip, gpsIpDistanceKm: distance, chosen }
}

/** Search cities by name (Chinese names supported via `language=zh`). */
export async function searchCity(query: string, limit = 5): Promise<GeoLocation[]> {
  const trimmed = query.trim()
  if (trimmed === '') return []
  const url = `${GEO_SEARCH_URL}?name=${encodeURIComponent(trimmed)}&count=${limit}&language=zh&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`城市搜索响应异常（HTTP ${res.status}）`)
  const json = await res.json() as {
    results?: Array<{
      name: string
      latitude: number
      longitude: number
      country?: string
      country_code?: string
      admin1?: string
    }>
  }
  return (json.results ?? []).map((result) => ({
    name: qualifyCityName(result.name, result.admin1, result.country_code),
    latitude: result.latitude,
    longitude: result.longitude,
    source: 'search' as const,
  }))
}

/** Fetch the current + hourly + daily forecast for a place, plus air quality. */
export async function fetchWeather(
  location: GeoLocation,
  units: 'celsius' | 'fahrenheit',
): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
    timezone: 'auto',
    forecast_days: '7',
    language: 'zh',
  })
  if (units === 'fahrenheit') {
    params.set('temperature_unit', 'fahrenheit')
    params.set('wind_speed_unit', 'mph')
    params.set('precipitation_unit', 'inch')
  }
  const airParams = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'us_aqi,pm2_5',
    timezone: 'auto',
  })
  const [res, airRes] = await Promise.all([
    fetch(`${FORECAST_URL}?${params.toString()}`),
    fetch(`${AIR_QUALITY_URL}?${airParams.toString()}`),
  ])
  if (!res.ok) throw new Error(`天气数据获取失败（HTTP ${res.status}）`)
  const json = await res.json() as {
    current?: {
      time?: string
      temperature_2m?: number
      relative_humidity_2m?: number
      apparent_temperature?: number
      weather_code?: number
      wind_speed_10m?: number
      is_day?: number
    }
    hourly?: {
      time?: string[]
      temperature_2m?: number[]
      weather_code?: number[]
      precipitation_probability?: number[]
    }
    daily?: {
      time?: string[]
      weather_code?: number[]
      temperature_2m_max?: number[]
      temperature_2m_min?: number[]
      precipitation_probability_max?: number[]
      sunrise?: string[]
      sunset?: string[]
      uv_index_max?: number[]
    }
  }
  // Air quality is additive: a failure must not sink the forecast.
  let air: WeatherData['air']
  try {
    if (airRes.ok) {
      const airJson = await airRes.json() as { current?: { us_aqi?: number; pm2_5?: number } }
      const aqi = airJson.current?.us_aqi
      const pm25 = airJson.current?.pm2_5
      if (aqi !== undefined || pm25 !== undefined) {
        air = { aqi: aqi ?? 0, pm25: pm25 ?? 0 }
      }
    }
  } catch {
    air = undefined
  }

  const current = json.current
  if (current === undefined || current.temperature_2m === undefined) {
    throw new Error('天气服务暂未返回当前数据，请稍后重试')
  }
  const hourly = json.hourly
  const daily = json.daily

  const nowIndex = current.time !== undefined && hourly?.time !== undefined
    ? hourly.time.findIndex((t) => t >= current.time!)
    : -1
  const from = nowIndex >= 0 ? nowIndex : 0

  return {
    location,
    current: {
      temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature ?? current.temperature_2m,
      humidity: current.relative_humidity_2m ?? 0,
      windSpeed: current.wind_speed_10m ?? 0,
      weatherCode: current.weather_code ?? -1,
      isDay: (current.is_day ?? 1) === 1,
    },
    hourly: (hourly?.time ?? []).slice(from, from + 24).map((time, index) => ({
      time,
      temperature: hourly?.temperature_2m?.[from + index] ?? 0,
      weatherCode: hourly?.weather_code?.[from + index] ?? -1,
      precipProb: hourly?.precipitation_probability?.[from + index] ?? 0,
    })),
    daily: (daily?.time ?? []).slice(0, 7).map((date, index) => ({
      date,
      weatherCode: daily?.weather_code?.[index] ?? -1,
      tempMax: daily?.temperature_2m_max?.[index] ?? 0,
      tempMin: daily?.temperature_2m_min?.[index] ?? 0,
      precipProb: daily?.precipitation_probability_max?.[index] ?? 0,
    })),
    sunrise: daily?.sunrise?.[0],
    sunset: daily?.sunset?.[0],
    uvIndexMax: daily?.uv_index_max?.[0],
    air,
    unitLabel: units === 'fahrenheit' ? '°F' : '°C',
  }
}

/** One actionable severe-weather alert derived from the current conditions. */
export interface WeatherAlert {
  key: string
  level: 'warning' | 'danger'
  title: string
  detail: string
}

/**
 * Rule-based severe-weather evaluation over the current conditions. Open-Meteo
 * has no alert coverage for China (MeteoAlarm is Europe-centric), so the
 * plugin derives actionable alerts from the observed weather itself.
 * @param fmt - temperature/wind formatter bound to the active unit.
 */
export function evaluateAlerts(data: WeatherData, fmt: (value: number) => string): WeatherAlert[] {
  const alerts: WeatherAlert[] = []
  const current = data.current
  if (current.temperature >= 35) {
    alerts.push({ key: 'heat', level: 'warning', title: '高温', detail: `当前 ${fmt(current.temperature)}，注意防暑` })
  } else if (current.temperature <= 0) {
    alerts.push({ key: 'cold', level: 'warning', title: '低温', detail: `当前 ${fmt(current.temperature)}，注意保暖` })
  }
  if (current.windSpeed >= 60) {
    alerts.push({ key: 'wind', level: 'warning', title: '大风', detail: `风速 ${Math.round(current.windSpeed)} km/h` })
  }
  const code = current.weatherCode
  if (code === 65 || code === 82 || code === 99) {
    alerts.push({ key: 'heavy-rain', level: 'danger', title: '强降雨', detail: '大雨或暴风雨，注意出行安全' })
  } else if (code === 95 || code === 96) {
    alerts.push({ key: 'thunder', level: 'danger', title: '雷暴', detail: '雷电天气，注意防范' })
  }
  if (code === 75 || code === 86) {
    alerts.push({ key: 'heavy-snow', level: 'warning', title: '强降雪', detail: '大雪天气，注意路况' })
  }
  return alerts
}
