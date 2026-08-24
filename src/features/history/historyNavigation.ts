import { monthKey, shiftLocalDate, shiftMonth } from '../../domain/history/HistoryEngine.ts'

export type CalendarView = 'month' | 'week'
export type CalendarSelectionIntent = 'manual-day-selection' | 'week-navigation' | 'month-navigation' | 'current-period-navigation' | 'day-navigation'
export type SwipeDirection = 'next' | 'previous'
export type SwipePoint = { x: number; y: number }

export const HISTORY_SWIPE_THRESHOLD = 48

export function shouldRevealSelectedDay(intent: CalendarSelectionIntent): boolean {
  return intent === 'manual-day-selection'
}

export function currentPeriodLabel(view: CalendarView): string {
  return view === 'month' ? 'This Month' : 'This Week'
}

export function horizontalSwipeDirection(start: SwipePoint, end: SwipePoint, threshold = HISTORY_SWIPE_THRESHOLD): SwipeDirection | null {
  const horizontal = end.x - start.x
  const vertical = end.y - start.y
  if (Math.abs(horizontal) < threshold || Math.abs(horizontal) <= Math.abs(vertical) * 1.25) return null
  return horizontal < 0 ? 'next' : 'previous'
}

export function swipeAmount(direction: SwipeDirection): -1 | 1 {
  return direction === 'next' ? 1 : -1
}

function dateInMonth(localDate: string, targetMonth: string): string {
  const day = Number(localDate.slice(-2))
  const [year, month] = targetMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return `${targetMonth}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

export function calendarPeriodSelection(selectedDate: string, visibleMonth: string, view: CalendarView, amount: -1 | 1): string {
  if (view === 'week') return shiftLocalDate(selectedDate, amount * 7)
  return dateInMonth(selectedDate, shiftMonth(visibleMonth, amount))
}

export function selectedDaySelection(selectedDate: string, amount: -1 | 1): { selectedDate: string; visibleMonth: string } {
  const nextDate = shiftLocalDate(selectedDate, amount)
  return { selectedDate: nextDate, visibleMonth: monthKey(nextDate) }
}
