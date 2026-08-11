import type { CalendarMetricIdentity } from '../../domain/history/HistoryEngine.ts'

export interface CalendarFormattingState {
  metricId: 'none' | CalendarMetricIdentity
  heatmap: boolean
}

export function clearCalendarFormatting(): CalendarFormattingState {
  return { metricId: 'none', heatmap: false }
}
