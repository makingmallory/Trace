export function shouldReturnHomeAfterCompletion(historical: boolean, wasCompleted: boolean, completed: boolean): boolean {
  return completed && !historical && !wasCompleted
}

export function checkInRouteForDate(localDate: string): string {
  return `/history/check-in/${localDate}`
}

export function completionDestination(fromHistory: boolean, wasCompleted: boolean, completed: boolean, localDate: string): string | null {
  if (!completed || wasCompleted) return null
  return fromHistory ? `/history?date=${localDate}` : '/'
}
