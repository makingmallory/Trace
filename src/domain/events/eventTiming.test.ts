import { describe, expect, it } from 'vitest'
import type { LogRecord } from '../models/index.ts'
import { formatEventTiming } from './eventTiming.ts'

const base: LogRecord = {
  id: 'record', recordKind: 'event', eventDefinitionId: 'event', eventTimingKind: 'point', localDate: '2026-08-11',
  startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null,
  endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null,
  status: 'completed', source: 'app', createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z',
  deletedAt: null, revision: 1,
}

describe('event timing display', () => {
  it('shows exact, time-of-day, date-only, and unknown point precision naturally', () => {
    expect(formatEventTiming({ ...base, startTimePrecision: 'exact', startTime: '2026-08-11T20:42:00.000Z' })).toMatch(/3:42 PM|8:42 PM/)
    expect(formatEventTiming({ ...base, startTimePrecision: 'timeOfDay', startTimeOfDay: 'late_afternoon' })).toBe('Late Afternoon')
    expect(formatEventTiming(base)).toBe('Date only')
    expect(formatEventTiming({ ...base, startTimePrecision: 'unknown' })).toBe('Time unknown')
  })

  it('shows a multi-day date-only duration without fabricating times', () => {
    const formatted = formatEventTiming({ ...base, eventTimingKind: 'duration', localDate: '2026-08-01', endLocalDate: '2026-08-03', endTimePrecision: 'day' })
    expect(formatted).toMatch(/Aug 1.*→.*Aug 3/)
    expect(formatted).not.toMatch(/AM|PM|12:00/)
  })

  it('shows mixed precision and ongoing ranges concisely', () => {
    const mixed = formatEventTiming({ ...base, eventTimingKind: 'duration', startTimePrecision: 'timeOfDay', startTimeOfDay: 'late_afternoon', endLocalDate: '2026-08-11', endTimePrecision: 'exact', endTime: '2026-08-12T02:17:00.000Z', timezone: 'America/Chicago' })
    expect(mixed).toMatch(/^Late Afternoon → /)
    expect(mixed).toMatch(/9:17 PM|2:17 AM/)
    expect(formatEventTiming({ ...base, eventTimingKind: 'duration', startTimePrecision: 'timeOfDay', startTimeOfDay: 'morning', ongoing: true })).toBe('Morning → Ongoing')
  })
})
