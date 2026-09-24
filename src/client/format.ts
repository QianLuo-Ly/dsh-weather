/**
 * Display-formatting primitives shared across the client half. The number
 * formatting is one rule; the unit SUFFIX stays at the call site on purpose,
 * since the description layer writes 公里 and the bar writes km.
 */

/** Zero-padded two-digit number (`3` → `"03"`) for clock text. */
export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Milliseconds until the next wall-clock minute boundary, plus a small settle
 * offset, for once-a-minute loops: scheduling from the current instant tends to
 * fire early and drift a whole minute. Callers compare a window, not the tick.
 */
export function msToNextMinute(settleMs = 20): number {
  return 60_000 - (Date.now() % 60_000) + settleMs
}

/** `3.2 mm/h` — a precipitation rate, one decimal. */
export function rateText(mmPerHour: number): string {
  return `${mmPerHour.toFixed(1)} mm/h`
}

/**
 * Distance text: a sub-10 reading keeps one decimal (`4.5`), anything larger is
 * rounded. Sub-10 km is where a fog/haze reading lives, so 0.4 km must not become "0".
 */
export function compactDistance(kilometres: number): string {
  return kilometres < 10 ? kilometres.toFixed(1) : String(Math.round(kilometres))
}

/** `72%` — a percentage rounded to a whole number. */
export function pctText(value: number): string {
  return `${Math.round(value)}%`
}
