/**
 * Location/payload agreement checks shared by the notification paths. The feed and the resolved location update independently, so for one render they can disagree; a consumer re-running on a name change (a city switch updates `placeName` a commit before the payload) would otherwise report the new city with old conditions, and its dedupe key would suppress the real alert.
 */
import { pad2 } from '../shared/format'
import type { GeoLocation } from './geolocation'
import type { WeatherData } from './weather-api'

/** `YYYY-MM-DD` for a Date (local) — keys the once-per-day brief dedupe. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Whether a payload really belongs to `location` (see the module comment). */
export function payloadMatchesLocation(data: WeatherData | null, location: GeoLocation | null): boolean {
  return data !== null && location !== null && data.location === location
}
