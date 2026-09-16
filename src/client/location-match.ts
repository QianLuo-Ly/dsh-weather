/**
 * Location/payload agreement checks shared by the notification paths.
 *
 * The feed and the resolved location travel as two independent state updates, so
 * for one render they are interchangeable. Consumers that re-run on a NAME or
 * config change (a city switch updates `placeName` one commit before the new
 * payload arrives) must use these, or they act on the previous city's weather: a
 * notification titled with the new city carrying the old city's conditions, and
 * a dedupe key that then suppresses the real alert.
 */
import type { GeoLocation, WeatherData } from './weather-api'

/** `YYYY-MM-DD` for a Date (local) — keys the once-per-day brief dedupe. */
export function dayKey(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Whether a payload really belongs to `location` (see the module comment). */
export function payloadMatchesLocation(data: WeatherData | null, location: GeoLocation | null): boolean {
  return data !== null && location !== null && data.location === location
}
