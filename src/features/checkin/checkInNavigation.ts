const validLocalDate = /^\d{4}-\d{2}-\d{2}$/

export function historyReturnPath(localDate: string): string {
  return validLocalDate.test(localDate) ? `/history?date=${localDate}` : '/history'
}

function withReturnTo(path: string, returnTo?: string): string {
  return returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path
}

export function checkInRouteForToday(returnTo?: string): string {
  return withReturnTo('/check-in', returnTo)
}

export function checkInRouteForDate(localDate: string, returnTo?: string): string {
  return withReturnTo(`/history/check-in/${localDate}`, returnTo)
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
