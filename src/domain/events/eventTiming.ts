import type { LogRecord, TimeOfDayBucket, TimePrecision } from '../models/index.ts'

export interface TimeOfDayDefinition {
  value: TimeOfDayBucket
  label: string
  conceptualRange: string
  icon: string
}

export const timeOfDayDefinitions: readonly TimeOfDayDefinition[] = [
  { value: 'overnight', label: 'Overnight', conceptualRange: '12–5 AM', icon: '🌌' },
  { value: 'early_morning', label: 'Early morning', conceptualRange: '5–8 AM', icon: '🌅' },
  { value: 'morning', label: 'Morning', conceptualRange: '8 AM–12 PM', icon: '☀️' },
  { value: 'early_afternoon', label: 'Early afternoon', conceptualRange: '12–3 PM', icon: '🌤️' },
  { value: 'late_afternoon', label: 'Late afternoon', conceptualRange: '3–6 PM', icon: '🌇' },
  { value: 'evening', label: 'Evening', conceptualRange: '6–9 PM', icon: '🌆' },
  { value: 'night', label: 'Night', conceptualRange: '9 PM–12 AM', icon: '🌙' },
]

export function timeOfDayLabel(bucket: TimeOfDayBucket): string {
  return timeOfDayDefinitions.find((item) => item.value === bucket)?.label ?? bucket
}

export function bucketForHour(hour: number): TimeOfDayBucket {
  if (hour < 5) return 'overnight'
  if (hour < 8) return 'early_morning'
  if (hour < 12) return 'morning'
  if (hour < 15) return 'early_afternoon'
  if (hour < 18) return 'late_afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

export function formatEndpoint(
  localDate: string,
  precision: TimePrecision,
  timestamp: string | null,
  bucket: TimeOfDayBucket | null,
  includeDate = false,
  timezone?: string | null,
): string {
  const date = includeDate ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${localDate}T12:00:00`)) : ''
  let timing = ''
  if (precision === 'exact' && timestamp) timing = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone || undefined }).format(new Date(timestamp))
  else if (precision === 'timeOfDay' && bucket) timing = timeOfDayLabel(bucket)
  else if (precision === 'unknown') timing = 'Time unknown'
  else if (!includeDate) timing = 'Date only'
  return [date, timing].filter(Boolean).join(' · ')
}

export function formatEventTiming(record: LogRecord): string {
  const duration = record.eventTimingKind === 'duration'
  if (!duration) return formatEndpoint(record.localDate, record.startTimePrecision, record.startTime, record.startTimeOfDay, false, record.timezone)
  const spansDates = Boolean(record.endLocalDate && record.endLocalDate !== record.localDate)
  const start = formatEndpoint(record.localDate, record.startTimePrecision, record.startTime, record.startTimeOfDay, spansDates, record.timezone)
  if (record.ongoing) return `${start} → Ongoing`
  if (!record.endLocalDate || !record.endTimePrecision) return start
  const end = formatEndpoint(record.endLocalDate, record.endTimePrecision, record.endTime, record.endTimeOfDay, spansDates, record.timezone)
  return `${start} → ${end}`
}
