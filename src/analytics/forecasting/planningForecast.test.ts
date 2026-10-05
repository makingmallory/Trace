import { describe, expect, it } from 'vitest'
import type { TrendsData } from '../AnalyticsProvider.ts'
import type { LogRecord, Observation, ObservationOptionSelection, Trackable, TrackableOption, TrackableVersion } from '../../domain/models/index.ts'
import { crossTargetPlanningSummary, forecastPlanningAsOf, planningForecastCacheKey } from './planningForecast.ts'

const stamp = '2026-01-01T00:00:00.000Z'
const sync = { createdAt: stamp, updatedAt: stamp, deletedAt: null, revision: 1 }
const date = (index: number) => new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
const trackable = (id: string): Trackable => ({ ...sync, id, categoryId: 'general', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'measurement', recordSemantics: 'daily_value' })
const version = (id: string, inputType: TrackableVersion['inputType'], extras: Partial<TrackableVersion> = {}): TrackableVersion => ({ ...sync, id: `${id}:v1`, trackableId: id, version: 1, name: id, inputType, valueDirection: 'neutral', configuration: {}, retiredAt: null, ...extras })
const record = (index: number, extras: Partial<LogRecord> = {}): LogRecord => ({ ...sync, id: `day:${index}`, recordKind: 'routine', localDate: date(index), startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'app', ...extras })
const observation = (index: number, id: string, answer: Observation['answer']): Observation => ({ ...sync, id: `${id}:${index}`, logRecordId: `day:${index}`, trackableId: id, trackableVersion: 1, answer })
const empty = (): TrendsData => ({ analysisMappings: [], categories: [], logRecords: [], observations: [], observationSelections: [], trackables: [], trackableOptions: [], trackableVersions: [], trackableFields: [], trackableDailyAssertions: [] })

function numericHistory(count: number, value: (index: number) => number, id = 'energy'): TrendsData {
  const data = empty(); data.trackables = [trackable(id)]; data.trackableVersions = [version(id, 'number')]
  data.logRecords = Array.from({ length: count }, (_, index) => record(index)); data.observations = Array.from({ length: count }, (_, index) => observation(index, id, { state: 'answered', value: { kind: 'number', value: value(index) } }))
  return data
}

function binaryHistory(count: number, yes: (index: number) => boolean): TrendsData {
  const data = empty(); data.trackables = [trackable('present')]; data.trackableVersions = [version('present', 'boolean', { valueDirection: 'worse' })]
  data.logRecords = Array.from({ length: count }, (_, index) => record(index)); data.observations = Array.from({ length: count }, (_, index) => observation(index, 'present', { state: 'answered', value: { kind: 'boolean', value: yes(index) } }))
  return data
}

function ordinalHistory(count: number): TrendsData {
  const data = empty(); data.trackables = [trackable('ordinal')]; data.trackableVersions = [version('ordinal', 'scale', { scaleMin: 1, scaleMax: 5 })]
  data.logRecords = Array.from({ length: count }, (_, index) => record(index)); data.observations = Array.from({ length: count }, (_, index) => observation(index, 'ordinal', { state: 'answered', value: { kind: 'scale', value: index % 4 + 1 } }))
  return data
}

function choiceHistory(kind: 'single_choice' | 'multi_select'): TrendsData {
  const id = kind === 'single_choice' ? 'mood' : 'locations'; const data = empty(); data.trackables = [trackable(id)]; data.trackableVersions = [version(id, kind)]
  data.trackableOptions = ['a', 'b'].map((optionId, index): TrackableOption => ({ ...sync, id: `${id}:${optionId}`, trackableId: id, trackableVersion: 1, optionId, storedValue: optionId, label: optionId === 'a' ? 'Alpha' : 'Beta', sortOrder: index, active: true }))
  data.logRecords = Array.from({ length: 42 }, (_, index) => record(index)); data.observations = Array.from({ length: 42 }, (_, index) => observation(index, id, { state: 'answered', value: { kind: 'choice', value: null } }))
  data.observationSelections = Array.from({ length: 42 }, (_, index) => {
    const observationId = `${id}:${index}`; const selected = [index % 3 ? 'a' : 'b', ...(kind === 'multi_select' && index % 2 ? ['b'] : [])]
    return [...new Set(selected)].map((optionId): ObservationOptionSelection => ({ ...sync, id: `${observationId}:${optionId}`, observationId, optionId }))
  }).flat()
  return data
}

describe('long-range planning forecasts', () => {
  it('freezes the cutoff, carries predicted-only provenance to day 20, and aggregates 30 days without mutating raw observations', () => {
    const data = numericHistory(70, (index) => 3 + Math.sin(index / 4))
    const original = data.observations.map((item) => structuredClone(item)); const planning = forecastPlanningAsOf(data, 'energy', date(69), 30)
    expect(planning.days).toHaveLength(30); expect(planning.windows.map((window) => window.totalDays)).toEqual([7, 7, 7, 9])
    expect(planning.days[19].diagnostics.recursiveInputs?.every((input) => input.sourceHorizon < 20)).toBe(true)
    expect(planning.days[19].diagnostics.featureAvailability?.every((item) => item.availability === 'calendar-known' || item.availability === 'recursive-target' || item.availability === 'unavailable-future')).toBe(true)
    expect(data.observations).toEqual(original)
    const later = { ...data, logRecords: [...data.logRecords, record(70), { ...record(75), id: 'future-event', recordKind: 'quick_log' as const, trackableId: 'future' }], observations: [...data.observations, observation(70, 'energy', { state: 'answered', value: { kind: 'number', value: 999 } })] }
    expect(forecastPlanningAsOf(later, 'energy', date(69), 30)).toEqual(planning)
  }, 60_000)

  it('validates a generic seasonal strategy against recent history and keeps cache configuration explicit', () => {
    const data = numericHistory(70, (index) => index % 7)
    const result = forecastPlanningAsOf(data, 'energy', date(69), 30)
    const recent = result.strategyScores.find((item) => item.strategy === 'recent-history')!
    const seasonal = result.strategyScores.find((item) => item.strategy === 'seasonal-calendar')!
    expect(seasonal.validationCount).toBeGreaterThanOrEqual(8); expect(seasonal.score!).toBeLessThan(recent.score!); expect(['seasonal-calendar', 'recursive-continuation']).toContain(result.selectedStrategy)
    if (result.selectedStrategy === 'recursive-continuation') expect(result.strategyScores.find((item) => item.strategy === 'recursive-continuation')?.score).toBeLessThan(seasonal.score!)
    const request = { asOfDate: date(69), horizonDays: 30, targetDescriptorIds: ['energy'] }
    expect(planningForecastCacheKey(data, request)).not.toBe(planningForecastCacheKey(data, { ...request, horizonDays: 14 }))
    expect(planningForecastCacheKey(data, request)).not.toBe(planningForecastCacheKey(data, { ...request, windowDays: [5, 5, 5, 5, 5, 5] }))
  }, 60_000)

  it('lets confidence and usefulness decay instead of manufacturing later precision', () => {
    const sparse = numericHistory(20, (index) => index % 5, 'bounded'); sparse.trackableVersions = [version('bounded', 'scale', { scaleMin: 1, scaleMax: 5 })]
    sparse.observations = Array.from({ length: 20 }, (_, index) => observation(index, 'bounded', { state: 'answered', value: { kind: 'scale', value: index % 5 + 1 } }))
    const result = forecastPlanningAsOf(sparse, 'bounded', date(19), 30)
    expect(result.windows.at(-1)?.state).toBe('insufficient'); expect(result.usableFraction).toBeLessThan(1)
    expect(result.days.some((day) => day.horizonState === 'insufficient')).toBe(true)
    expect(result.confidenceSummary).toMatch(/uncertain|rough|not enough/i)
  }, 60_000)

  it('supports numeric/ordinal, binary, nominal, and multi-select planning outputs', () => {
    const results = [
      forecastPlanningAsOf(ordinalHistory(42), 'ordinal', date(41), 14),
      forecastPlanningAsOf(binaryHistory(42, (index) => index % 3 === 0), 'present', date(41), 14),
      forecastPlanningAsOf(choiceHistory('single_choice'), 'mood', date(41), 14),
      forecastPlanningAsOf(choiceHistory('multi_select'), 'locations', date(41), 14),
    ]
    expect(results.map((result) => result.windows[0].prediction?.kind)).toEqual(['ordinal', 'binary', 'nominal', 'multiselect'])
    const nominal = results[2].windows[0].prediction; if (nominal?.kind === 'nominal') expect(nominal.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1)
    const multi = results[3].windows[0].prediction; if (multi?.kind === 'multiselect') expect(multi.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeGreaterThan(1)
    expect(results[1].windows.every((window) => window.preference !== 'unknown' || window.direction === 'around-usual')).toBe(true)
  }, 120_000)

  it('builds a neutral cross-target summary without collapsing targets into one score', () => {
    const left = forecastPlanningAsOf(numericHistory(42, (index) => index % 7, 'energy'), 'energy', date(41), 14)
    const right = forecastPlanningAsOf(binaryHistory(42, (index) => index % 4 === 0), 'present', date(41), 14)
    const summary = crossTargetPlanningSummary([left, right])
    expect(summary[0].items.map((item) => item.label)).toEqual(expect.arrayContaining(['energy', 'present']))
    expect(summary[0].items.every((item) => typeof item.summary === 'string')).toBe(true)
  }, 120_000)
})
