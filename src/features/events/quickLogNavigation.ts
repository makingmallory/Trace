const validLocalDate = /^\d{4}-\d{2}-\d{2}$/

export function historyReturnPath(localDate: string): string {
  return validLocalDate.test(localDate) ? `/history?date=${localDate}` : '/history'
}

export function quickLogEditPath(recordId: string, returnTo: string): string {
  return `/history/quick-log/${encodeURIComponent(recordId)}/edit?returnTo=${encodeURIComponent(returnTo)}`
}

export function quickLogPickerPath(localDate?: string | null): string {
  return localDate && validLocalDate.test(localDate) ? `/quick-log?date=${localDate}` : '/quick-log'
}

export function quickLogPickerReturnPath(localDate?: string | null): string {
  return localDate && validLocalDate.test(localDate) ? historyReturnPath(localDate) : '/'
}

export function resolveQuickLogReturnTo(returnTo: string | null, fallbackDate: string): string {
  if (!returnTo) return historyReturnPath(fallbackDate)
  if (returnTo === '/' || returnTo === '/check-in' || returnTo === '/quick-log') return returnTo

  const historyMatch = returnTo.match(/^\/history(?:\?date=(\d{4}-\d{2}-\d{2}))?$/)
  if (historyMatch && (!historyMatch[1] || validLocalDate.test(historyMatch[1]))) return returnTo

  const historicalCheckInMatch = returnTo.match(/^\/history\/check-in\/(\d{4}-\d{2}-\d{2})$/)
  if (historicalCheckInMatch && validLocalDate.test(historicalCheckInMatch[1])) return returnTo

  return historyReturnPath(fallbackDate)
}
