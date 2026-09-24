/**
 * Bounded HTTP layer: every network call goes through {@link apiFetch}, so one
 * hanging free API cannot leave the bar loading forever. The bound covers both
 * the connection and the body read; an external AbortSignal is honoured on top.
 */

/**
 * Default per-request budget. Callers with a different need pass `timeoutMs`: a
 * dead IP provider must not stall the location chain, an additive air-quality
 * feed must not delay the forecast it rides along with.
 */
export const REQUEST_TIMEOUT_MS = 10_000

/** Bounded fetch result: the body is read and JSON-parsed under the same timeout as the connection. */
export interface ApiResponse {
  ok: boolean
  status: number
  /** Raw body text (empty when the response had no body). */
  text: string
  /** JSON.parse result, or null when the body was empty / not JSON. */
  json: unknown
}

/** Fetch with a hard timeout and optional external cancellation. */
export async function apiFetch(
  url: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ApiResponse> {
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
    // The signal stays armed while reading the body, so a stalled body hits the
    // same timeout/cancellation path as a stalled connection.
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
    // Distinguish the three causes — our timeout, caller cancellation, network error.
    if (timedOut) throw new Error('请求超时，请稍后重试')
    if (signal?.aborted) throw new Error('请求已取消')
    throw new Error('网络请求失败，请检查网络连接后重试')
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', abortFromOutside)
  }
}

/** Resolve a promise or return null after `ms`, whichever comes first. */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
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
