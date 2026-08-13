import { describe, expect, it } from 'vitest'
import type { TrendsData } from './AnalyticsProvider.ts'
import { buildTrendSummary, trendMetricOptions } from './trendsAnalytics.ts'
import type { LogRecord, Observation, Trackable, TrackableVersion } from '../domain/models/index.ts'

const timestamp = '2026-08-01T12:00:00.000Z'
const base = { createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }

function trackable(overrides: Partial<Trackable> = {}): Trackable {
  return { ...base, id: 'metric', categoryId: 'category', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'measurement', ...overrides }
}

function version(overrides: Partial<TrackableVersion> = {}): TrackableVersion {
  return { ...base, id: 'metric-v1', trackableId: 'metric', version: 1, name: 'Energy', inputType: 'number', valueDirection: 'neutral', configuration: {}, retiredAt: null, ...overrides }
}

function record(id: string, localDate: string, overrides: Partial<LogRecord> = {}): LogRecord {
  return { ...base, id, recordKind: 'routine', routineId: 'routine', localDate, startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'app', ...overrides }
}

function observation(id: string, logRecordId: string, value: number, overrides: Partial<Observation> = {}): Observation {
  return { ...base, id, logRecordId, trackableId: 'metric', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'number', value } }, ...overrides }
}

function data(overrides: Partial<TrendsData> = {}): TrendsData {
  return { trackables: [trackable()], trackableVersions: [version()], trackableOptions: [], logRecords: [], observations: [], observationSelections: [], ...overrides }
}

describe('minimal trend analytics', () => {
  it('orders observations by date and calculates numeric summaries including zero', () => {
    const result = buildTrendSummary(data({
      logRecords: [record('later', '2026-08-03'), record('earlier', '2026-08-01'), record('middle', '2026-08-02')],
      observations: [observation('later-value', 'later', 4), observation('earlier-value', 'earlier', 0), observation('middle-value', 'middle', 2)],
    }), 'metric', 'all', '2026-08-11')

    expect(result?.kind).toBe('numeric')
    if (result?.kind !== 'numeric') throw new Error('Expected numeric summary')
    expect(result.points.map((point) => point.localDate)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
    expect(result.points.map((point) => point.value)).toEqual([0, 2, 4])
    expect({ count: result.count, average: result.average, min: result.min, max: result.max }).toEqual({ count: 3, average: 2, min: 0, max: 4 })
  })

  it('does not convert missing observations to zero', () => {
    const result = buildTrendSummary(data({
      logRecords: [record('answered', '2026-08-01'), record('missing', '2026-08-02')],
      observations: [observation('value', 'answered', 3), observation('unknown', 'missing', 0, { answer: { state: 'unknown' } })],
    }), 'metric', 'all', '2026-08-11')

    expect(result?.kind === 'numeric' ? result.points.map((point) => point.value) : []).toEqual([3])
    expect(result?.kind === 'numeric' ? result.count : -1).toBe(1)
  })

  it('counts Quick Log occurrences once each and does not invent zero-count days', () => {
    const quickData = data({
      trackables: [trackable({ recordSemantics: 'occurrence', quickLogEnabled: true, quickLogTimingMode: 'either' })],
      trackableVersions: [version({ name: 'Pilates', inputType: 'boolean' })],
      logRecords: [
        record('one', '2026-08-01', { recordKind: 'quick_log', trackableId: 'metric', trackableVersion: 1 }),
        record('two', '2026-08-01', { recordKind: 'quick_log', trackableId: 'metric', trackableVersion: 1 }),
        record('deleted', '2026-08-02', { recordKind: 'quick_log', trackableId: 'metric', trackableVersion: 1, deletedAt: '2026-08-03T00:00:00.000Z' }),
      ],
    })
    const result = buildTrendSummary(quickData, 'metric', 'all', '2026-08-11')
    expect(trendMetricOptions(quickData)).toEqual([{ trackableId: 'metric', name: 'Pilates', kind: 'numeric' }])
    expect(result?.kind === 'numeric' ? result.points : []).toEqual([expect.objectContaining({ localDate: '2026-08-01', value: 2 })])
    expect(result?.kind === 'numeric' ? result.count : -1).toBe(2)
  })

  it('excludes deleted observations and observations belonging to deleted records', () => {
    const result = buildTrendSummary(data({
      logRecords: [record('kept', '2026-08-01'), record('deleted-record', '2026-08-02', { deletedAt: '2026-08-03T00:00:00.000Z' })],
      observations: [observation('kept-value', 'kept', 1), observation('deleted-value', 'deleted-record', 2), observation('deleted-observation', 'kept', 3, { deletedAt: '2026-08-03T00:00:00.000Z' })],
    }), 'metric', 'all', '2026-08-11')

    expect(result?.kind === 'numeric' ? result.points.map((point) => point.value) : []).toEqual([1])
  })

  it('uses the observation version when resolving historical choice labels', () => {
    const choiceData = data({
      trackables: [trackable({ currentVersion: 2 })],
      trackableVersions: [version({ inputType: 'single_choice' }), version({ id: 'metric-v2', version: 2, inputType: 'single_choice' })],
      trackableOptions: [
        { ...base, id: 'option-v1', optionId: 'choice', trackableId: 'metric', trackableVersion: 1, storedValue: 'low', label: 'Low (old scale)', sortOrder: 0, active: true },
        { ...base, id: 'option-v2', optionId: 'choice', trackableId: 'metric', trackableVersion: 2, storedValue: 'low', label: 'Mild', sortOrder: 0, active: true },
      ],
      logRecords: [record('entry', '2026-08-01')],
      observations: [observation('choice-answer', 'entry', 0, { answer: { state: 'answered', value: { kind: 'choice', value: null } } })],
      observationSelections: [{ ...base, id: 'selection', observationId: 'choice-answer', optionId: 'choice' }],
    })
    const result = buildTrendSummary(choiceData, 'metric', 'all', '2026-08-11')

    expect(result?.kind === 'categorical' ? result.entries[0]?.display : null).toBe('Low (old scale)')
    expect(trendMetricOptions(choiceData)).toEqual([{ trackableId: 'metric', name: 'Energy', kind: 'categorical' }])
  })
})
