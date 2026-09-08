const validLocalDate = /^\d{4}-\d{2}-\d{2}$/

export function historyReturnPath(localDate: string): string {
  return validLocalDate.test(localDate) ? `/history?date=${localDate}` : '/history'
}

export type CheckInFocusTarget = `trackable:${string}` | `field:${string}`

function validFocusTarget(value: string | null | undefined): value is CheckInFocusTarget {
  return Boolean(value && /^(?:trackable|field):[^\s:]+$/.test(value))
}

function withRouteContext(path: string, returnTo?: string, focusTarget?: CheckInFocusTarget): string {
  const search = new URLSearchParams()
  if (returnTo) search.set('returnTo', returnTo)
  if (focusTarget) search.set('focus', focusTarget)
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

export function checkInRouteForToday(returnTo?: string): string {
  return withRouteContext('/check-in', returnTo)
}

export function checkInRouteForDate(localDate: string, returnTo?: string, focusTarget?: CheckInFocusTarget): string {
  return withRouteContext(`/history/check-in/${localDate}`, returnTo, focusTarget)
}

export function resolveCheckInFocusTarget(value: string | null): CheckInFocusTarget | null {
  return validFocusTarget(value) ? value : null
}

/** Only known in-app destinations are accepted as a Check-In return target. */
export function resolveCheckInReturnTo(returnTo: string | null, fallback: string): string {
  if (!returnTo) return fallback
  if (returnTo === '/' || returnTo === '/settings/nightly-check-in') return returnTo

  const historyMatch = returnTo.match(/^\/history(?:\?date=(\d{4}-\d{2}-\d{2}))?$/)
  if (historyMatch && (!historyMatch[1] || validLocalDate.test(historyMatch[1]))) return returnTo

  return fallback
}

export function completionDestination(returnTo: string | null, fallback: string, completed: boolean): string | null {
  return completed ? resolveCheckInReturnTo(returnTo, fallback) : null
}
