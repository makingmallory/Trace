import type { LogRecord } from '../models/index.ts'

function localDateNumber(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function dateFromNumber(value: number): string {
  const date = new Date(value)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function currentLocalDate(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function isQuickLogRecord(record: LogRecord): boolean {
  return record.recordKind === 'quick_log' || record.recordKind === 'event'
}

/** Returns every local date on which a single logical Quick Log applies. */
export function eventCoveredDates(record: LogRecord, today = currentLocalDate()): readonly string[] {
  if (!isQuickLogRecord(record) || record.eventTimingKind !== 'duration') return [record.localDate]
  const end = record.ongoing ? today : record.endLocalDate ?? record.localDate
  if (end < record.localDate) return [record.localDate]
  const startValue = localDateNumber(record.localDate)
  const endValue = localDateNumber(end)
  return Array.from({ length: Math.floor((endValue - startValue) / 86_400_000) + 1 }, (_, index) => dateFromNumber(startValue + index * 86_400_000))
}

/** Inclusive date membership used by every date-based Quick Log surface. */
export function eventAppliesOnDate(record: LogRecord, localDate: string, today = currentLocalDate()): boolean {
  return eventCoveredDates(record, today).includes(localDate)
}
