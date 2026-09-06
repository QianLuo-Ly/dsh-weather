/**
 * Display-unit conversions. The weather feed is always fetched in metric
 * (°C / km/h / mm / hPa) — see fetchWeather in weather-api.ts — so the cached
 * payload is unit-independent and a unit toggle never re-fetches. Everything
 * user-facing converts here, keeping °F/mph ternaries out of the components.
 */
import type { WeatherConfig } from '../config-shared'

export type UnitSetting = WeatherConfig['units']

/** Celsius → Fahrenheit. */
export function toFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32
}

/** km/h → mph. */
export function toMph(kmh: number): number {
  return kmh * 0.6213711922
}

/** `26°C` / `79°F` — the canonical temperature rendering. */
export function tempText(celsius: number, units: UnitSetting): string {
  const value = units === 'fahrenheit' ? toFahrenheit(celsius) : celsius
  return `${Math.round(value)}${units === 'fahrenheit' ? '°F' : '°C'}`
}

/** `12 km/h` / `7 mph`. */
export function windText(kmh: number | undefined, units: UnitSetting): string {
  if (kmh === undefined) return '--'
  const value = units === 'fahrenheit' ? toMph(kmh) : kmh
  return `${Math.round(value)} ${windUnitLabel(units)}`
}

/** Numeric part of the wind speed in the active unit (for stat cells). */
export function windNumber(kmh: number | undefined, units: UnitSetting): number | undefined {
  if (kmh === undefined) return undefined
  return units === 'fahrenheit' ? toMph(kmh) : kmh
}

/** `km/h` / `mph` label. */
export function windUnitLabel(units: UnitSetting): 'km/h' | 'mph' {
  return units === 'fahrenheit' ? 'mph' : 'km/h'
}

/** `°C` / `°F` label. */
export function unitLabel(units: UnitSetting): '°C' | '°F' {
  return units === 'fahrenheit' ? '°F' : '°C'
}
