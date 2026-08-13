import { describe, expect, it } from 'vitest'
import type { LogRecord } from '../../domain/models/index.ts'
import { homeEventEditPath, homeEventTiming } from './homeEventSummary.ts'

const record: LogRecord = {
  id: 'record', recordKind: 'event', eventDefinitionId: 'event', eventTimingKind: 'point', localDate: '2026-08-11',
  startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null,
  endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null,
  status: 'completed', source: 'app', createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z',
  deletedAt: null, revision: 1,
}

describe('Home event timing presentation', () => {
  it('leaves date-only event metadata blank', () => {
    expect(homeEventTiming(record)).toBe('')
  })

  it('keeps time-of-day and exact-time metadata', () => {
    expect(homeEventTiming({ ...record, startTimePrecision: 'timeOfDay', startTimeOfDay: 'early_morning' })).toBe('Early Morning')
    expect(homeEventTiming({ ...record, startTimePrecision: 'exact', startTime: new Date(2026, 7, 11, 8, 7).toISOString() })).toBe('8:07 AM')
  })

  it('routes a summary event to its stable record editor', () => {
    expect(homeEventEditPath('record/with spaces')).toBe('/history/quick-log/record%2Fwith%20spaces/edit')
  })
})
