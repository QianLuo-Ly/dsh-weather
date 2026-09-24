/**
 * Location layer: browser GPS/WiFi fixes, IP geolocation consensus, Chinese
 * reverse geocoding, city search and the IP-drift check. All endpoints answer CORS.
 */
// Coordinate quantum shared with placeKey: both must land on the same grid.
import { PLACE_DECIMALS } from '../../config-shared'
import { apiFetch, withTimeout } from '../shared/http'

/**
 * Display name of the automatic "current location" entry — chip label, geocoder
 * fallback and the sentinel the saved-city guard refuses to store.
 */
export const CURRENT_LOCATION_LABEL = '当前位置'

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
 * Browser-fix precision tiers from `position.coords.accuracy` (metres), not IP
 * agreement: `district` labels the 区, `city` the city only, `unreliable` → IP.
 */
export type LocationPrecision = 'district' | 'city' | 'unreliable'

/** Accuracy (m) at or below which the browser fix is trusted to the 区 level (a ~1 km error can cross a district border). */
const DISTRICT_ACCURACY_M = 1_000
/** Accuracy above which the browser fix is abandoned in favour of city-level IP. */
const CITY_ACCURACY_M = 10_000
/**
 * IP-drift threshold (km), also the consensus radius in {@link resolveLocationByIp}:
 * a fresh consensus farther than this from the cached IP location means the
 * network moved (VPN / roaming / re-route) and the plugin adopts it.
 */
const AUTO_LOCATION_DRIFT_KM = 50
/**
 * How far a geocoding hit may sit from the coordinates it names before the
 * original English name is kept — rejects a same-name city abroad.
 */
const MAX_NAME_MATCH_KM = 150

/** IP providers get a shorter budget so a dead one cannot stall the chain. */
const IP_PROVIDER_TIMEOUT_MS = 6_000
/** Browser-fix budget when resolving or diagnosing a location. */
const GPS_TIMEOUT_MS = 6_000

/** Map a browser-reported accuracy (m) to a precision tier. */
function precisionFromAccuracy(accuracy?: number): LocationPrecision {
  if (accuracy === undefined) return 'unreliable'
  if (accuracy <= DISTRICT_ACCURACY_M) return 'district'
  if (accuracy <= CITY_ACCURACY_M) return 'city'
  return 'unreliable'
}

/**
 * Reduce a coordinate to the shared `placeKey` quantum (~100 m) — weather and
 * reverse geocoding are identical at this scale, so nothing user-visible is lost.
 */
const PLACE_FACTOR = 10 ** PLACE_DECIMALS

function roundCoordinates(latitude: number, longitude: number): { latitude: number; longitude: number } {
  return {
    latitude: Math.round(latitude * PLACE_FACTOR) / PLACE_FACTOR,
    longitude: Math.round(longitude * PLACE_FACTOR) / PLACE_FACTOR,
  }
}

/**
 * Great-circle distance in kilometres (clamped against floating-point
 * overshoot at near-antipodal points, which would otherwise yield NaN).
 */
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

// ── IP geolocation ──────────────────────────────────────────────────────────

/** Query one IP endpoint (CORS-friendly, no key); null on failure, so callers combine providers. */
async function sampleIpLocation(url: string): Promise<GeoLocation | null> {
  try {
    const res = await apiFetch(url, { timeoutMs: IP_PROVIDER_TIMEOUT_MS })
    if (!res.ok) return null
    const json = res.json as {
      city?: string
      cityName?: string
      region?: string
      regionName?: string
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
    // Empty-string coordinates must not silently become the (0,0) sample.
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    // freeipapi returns `cityName`/`regionName` while ipapi.is and ipwho.is use
    // `city`/`region`, so read both or that sample contributes no name.
    const city = (json.city ?? json.cityName ?? '').trim()
    const region = (json.region ?? json.regionName ?? '').trim()
    const name = city !== '' ? city : region !== '' ? region : CURRENT_LOCATION_LABEL
    const rounded = roundCoordinates(latitude, longitude)
    return { name, latitude: rounded.latitude, longitude: rounded.longitude, source: 'ip' }
  } catch {
    return null
  }
}

/**
 * Resolve by IP: the sample with the most neighbours within
 * {@link AUTO_LOCATION_DRIFT_KM} across three providers wins; geojs.io is excluded.
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
  // Samples are pre-rounded to ~100 m, so the winner is persisted as-is.
  return best
}

// ── Chinese address composition ─────────────────────────────────────────────

/** First-level areas whose official short form is not `<名>省` (e.g. `广西` → `广西壮族自治区`). */
const SPECIAL_FIRST_LEVEL: Record<string, string> = {
  内蒙古: '内蒙古自治区',
  广西: '广西壮族自治区',
  西藏: '西藏自治区',
  宁夏: '宁夏回族自治区',
  新疆: '新疆维吾尔自治区',
}

/** First-level area → official Chinese short form with suffix (`广东` → `广东省`); non-Chinese passes through. */
function normalizeFirstLevel(admin1: string, countryCode: string | undefined): string {
  if (countryCode !== 'CN') return admin1
  if (/[省市]$/.test(admin1) || admin1.endsWith('自治区') || admin1.endsWith('特别行政区')) return admin1
  return SPECIAL_FIRST_LEVEL[admin1] ?? `${admin1}省`
}

/**
 * Compose a display name in standard Chinese address form, province first with
 * suffixes and no separators; a province repeating the city (直辖市) is dropped.
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

/** Reverse-geocode coordinates to a Chinese address (BigDataCloud, zh-Hans simplified). */
async function reverseGeocodeAddress(latitude: number, longitude: number): Promise<ChineseAddress> {
  const { latitude: lat, longitude: lon } = roundCoordinates(latitude, longitude)
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh-Hans`
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

/** Reduce any display name to city level (`广东省广州市黄埔区` → `广东省广州市`); districts are never shown. */
export function cityLevelName(name: string): string {
  const trimmed = name.trim()
  const match = /^(.+?市)(?:[^省州市]+区)?$/.exec(trimmed)
  return match !== null ? match[1] : trimmed
}

/**
 * Compose `广东省广州市黄埔区` from parts, each with its own suffix, dropping a
 * province that repeats the city (直辖市); district is added only if requested.
 */
function composeAddressName(address: ChineseAddress, includeDistrict = false): string {
  const { province, city, district } = address
  if (city === undefined || city === '') {
    // Municipality case: province and city share a name, locality gives the 区.
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

const GEO_SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search'

/**
 * Localize an IP-resolved English name to Chinese via Open-Meteo geocoding
 * (`language=zh`), the fallback to {@link reverseGeocodeAddress}.
 */
async function localizeCityName(location: GeoLocation): Promise<string> {
  const trimmed = location.name.trim()
  if (trimmed === '' || trimmed === CURRENT_LOCATION_LABEL) return trimmed
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
      const distance = haversineKm(location.latitude, location.longitude, candidate.latitude, candidate.longitude)
      if (distance < bestDistance) {
        bestDistance = distance
        best = candidate
      }
    }
    if (!(bestDistance <= MAX_NAME_MATCH_KM)) return location.name
    return qualifyCityName(best.name, best.admin1, best.country_code)
  } catch {
    return location.name
  }
}

// ── Browser fix ─────────────────────────────────────────────────────────────

/** Browser Geolocation API fix (GPS/WiFi) on the secure loopback origin; short timeout, caller caps the total wait. */
function resolveLocationByBrowser(): Promise<GeoLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
      reject(new Error('浏览器不支持定位'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = roundCoordinates(position.coords.latitude, position.coords.longitude)
        resolve({
          name: CURRENT_LOCATION_LABEL,
          latitude,
          longitude,
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

// ── Resolution ──────────────────────────────────────────────────────────────

/** Reverse-geocode a base to a Chinese name: `district` precision appends the 区, others keep 省/市. */
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
 * Resolve the current location with a Chinese display name. The browser fix
 * (GPS+WiFi+cell) is primary and alone accurate enough for district naming — 区
 * at ≤ {@link DISTRICT_ACCURACY_M}, city up to {@link CITY_ACCURACY_M}; IP is fallback.
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
 * Detect drift of a cached IP-derived location: when a fresh IP consensus differs
 * from the cache by more than {@link AUTO_LOCATION_DRIFT_KM}, resolve a fresh
 * location to adopt. GPS caches are never re-checked; null on no drift/failure.
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

// ── Diagnostics & search ────────────────────────────────────────────────────

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
 * Run one diagnostics pass for the UI; unlike {@link resolveAutoLocation} it
 * separates a rejection (denied / unavailable) from a timeout.
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
  let ipLoc: GeoLocation | null = null
  let ip: LocationDiagnostics['ip']
  try {
    ipLoc = await ipPromise
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
  const distance = gpsRaw !== null && ipLoc !== null
    ? haversineKm(gpsRaw.latitude, gpsRaw.longitude, ipLoc.latitude, ipLoc.longitude)
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
