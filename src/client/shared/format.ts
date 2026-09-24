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
 * Distance text: a sub-10 reading keeps one decimal and is TRUNCATED, not rounded;
 * anything larger is rounded. Sub-10 km is where the fog/haze judgement lives, so 0.4 km
 * must not become "0" — and 9.96 km must not become "10.0", which sits on the wrong side
 * of the very threshold the caller is quoting it to justify.
 */
export function compactDistance(kilometres: number): string {
  if (kilometres < 10) {
    const truncated = Math.floor(kilometres * 10) / 10
    // Truncation must not flatten a real reading to "0.0": that would claim less
    // visibility than the fog it describes.
    return truncated >= 0.1 ? truncated.toFixed(1) : kilometres.toFixed(2)
  }
  return String(Math.round(kilometres))
}

/** `72%` — a percentage rounded to a whole number. */
export function pctText(value: number): string {
  return `${Math.round(value)}%`
}
