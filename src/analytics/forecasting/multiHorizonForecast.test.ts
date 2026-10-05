import { describe, expect, it } from 'vitest'
import type { LogRecord, Observation, ObservationOptionSelection, Trackable, TrackableOption, TrackableVersion } from '../../domain/models/index.ts'
import type { TrendsData } from '../AnalyticsProvider.ts'
import type { FeatureDefinition } from '../features/featureTypes.ts'
import { forecastCacheKey, forecastTargetRangeAsOf, futureFeatureAvailability } from './multiHorizonForecast.ts'

const stamp = '2025-01-01T00:00:00.000Z'
const sync = { createdAt: stamp, updatedAt: stamp, deletedAt: null, revision: 1 }
const date = (index: number): string => new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
const trackable = (id: string): Trackable => ({ ...sync, id, categoryId: 'general', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'measurement', recordSemantics: 'daily_value' })
const version = (id: string, inputType: TrackableVersion['inputType'], configuration: TrackableVersion['configuration'] = {}): TrackableVersion => ({ ...sync, id: `${id}:v1`, trackableId: id, version: 1, name: id, inputType, valueDirection: 'neutral', configuration, retiredAt: null })
const record = (index: number, extras: Partial<LogRecord> = {}): LogRecord => ({ ...sync, id: `day:${index}`, recordKind: 'routine', localDate: date(index), startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'app', ...extras })
const observation = (index: number, id: string, answer: Observation['answer'], extras: Partial<Observation> = {}): Observation => ({ ...sync, id: `${id}:${index}`, logRecordId: `day:${index}`, trackableId: id, trackableVersion: 1, answer, ...extras })
const option = (id: string, optionId: string, label = optionId): TrackableOption => ({ ...sync, id: `${id}:${optionId}`, trackableId: id, trackableVersion: 1, optionId, storedValue: optionId, label, sortOrder: 0, active: true })
const selection = (observationId: string, optionId: string): ObservationOptionSelection => ({ ...sync, id: `${observationId}:${optionId}`, observationId, optionId })
const empty = (): TrendsData => ({ analysisMappings: [], categories: [], logRecords: [], observations: [], observationSelections: [], trackables: [], trackableOptions: [], trackableVersions: [], trackableFields: [], trackableDailyAssertions: [] })

function numericHistory(count: number, value: (index: number) => number): TrendsData {
  const data = empty(); data.trackables = [trackable('energy'), { ...trackable('travel'), recordSemantics: 'occurrence' }]; data.trackableVersions = [version('energy', 'number'), version('travel', 'boolean')]
  data.logRecords = Array.from({ length: count }, (_, index) => record(index))
  data.observations = Array.from({ length: count }, (_, index) => observation(index, 'energy', { state: 'answered', value: { kind: 'number', value: value(index) } }))
  return data
}

function binaryHistory(count: number, yes: (index: number) => boolean): TrendsData {
  const data = empty(); data.trackables = [trackable('present')]; data.trackableVersions = [version('present', 'boolean')]
  data.logRecords = Array.from({ length: count }, (_, index) => record(index)); data.observations = Array.from({ length: count }, (_, index) => observation(index, 'present', { state: 'answered', value: { kind: 'boolean', value: yes(index) } }))
  return data
}

function ordinalHistory(count = 40): TrendsData {
  const data = empty(); data.trackables = [trackable('energy')]; data.trackableVersions = [{ ...version('energy', 'scale'), scaleMin: 1, scaleMax: 5 }]
  data.logRecords = Array.from({ length: count }, (_, index) => record(index)); data.observations = Array.from({ length: count }, (_, index) => observation(index, 'energy', { state: 'answered', value: { kind: 'scale', value: index % 3 + 2 } }))
  return data
}

function choiceHistory(kind: 'single_choice' | 'multi_select'): TrendsData {
  const id = kind === 'single_choice' ? 'mood' : 'location'; const data = empty(); data.trackables = [trackable(id)]; data.trackableVersions = [version(id, kind)]; data.trackableOptions = [option(id, 'a', 'Alpha'), option(id, 'b', 'Beta')]
  data.logRecords = Array.from({ length: 40 }, (_, index) => record(index)); data.observations = Array.from({ length: 40 }, (_, index) => observation(index, id, { state: 'answered', value: { kind: 'choice', value: null } }))
  data.observationSelections = Array.from({ length: 40 }, (_, index) => [selection(`${id}:${index}`, index % 3 ? 'a' : 'b'), ...(kind === 'multi_select' && index % 2 ? [selection(`${id}:${index}`, 'b')] : [])]).flat()
  return data
}

describe('multi-horizon forecasting', () => {
  it('recursively forecasts seven local dates and widens numeric uncertainty without reading future observations', () => {
    const data = numericHistory(70, (index) => 3 + Math.sin(index / 4))
    const week = forecastTargetRangeAsOf(data, 'energy', date(69), 7)
    expect(week.days.map((day) => day.horizon)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(week.days.map((day) => day.forecastDate)).toEqual(Array.from({ length: 7 }, (_, index) => date(70 + index)))
    expect(week.days[0].usedRecursiveInputs).toBe(false); expect(week.days[1].usedRecursiveInputs).toBe(true)
    expect(week.days[1].diagnostics.recursiveInputs?.[0]).toMatchObject({ sourceHorizon: 1, forecastDate: date(70) })
    expect(week.days[6].diagnostics.featureAvailability?.some((item) => item.availability === 'calendar-known')).toBe(true)
    const widths = week.days.flatMap((day) => day.prediction?.kind === 'numeric' ? [day.prediction.likelyHigh - day.prediction.likelyLow] : [])
    expect(widths.at(-1)).toBeGreaterThanOrEqual(widths[0])

    const later: TrendsData = { ...data, logRecords: [...data.logRecords, record(70), { ...record(71), id: 'future-travel', recordKind: 'quick_log', trackableId: 'travel' }], observations: [...data.observations, observation(70, 'energy', { state: 'answered', value: { kind: 'number', value: 999 } })] }
    expect(forecastTargetRangeAsOf(later, 'energy', date(69), 7)).toEqual(week)
  }, 30_000)

  it('keeps ordinal horizons discrete, bounded, and less confident farther out', () => {
    const week = forecastTargetRangeAsOf(ordinalHistory(), 'energy', date(39), 7)
    for (const day of week.days) if (day.prediction?.kind === 'ordinal') {
      expect(Number.isInteger(day.prediction.likelyLow)).toBe(true); expect(Number.isInteger(day.prediction.likelyHigh)).toBe(true)
      expect(day.prediction.likelyLow).toBeGreaterThanOrEqual(1); expect(day.prediction.likelyHigh).toBeLessThanOrEqual(5)
    }
    const rank = { low: 0, moderate: 1, high: 2 }
    expect(rank[week.days.at(-1)?.confidence ?? 'low']).toBeLessThanOrEqual(rank[week.days[0].confidence ?? 'low'])
  })

  it('classifies horizon feature availability without treating future events as known', () => {
    const target = { descriptorId: 'energy', trackableId: 'energy', label: 'Energy', measurementType: 'continuous' as const, kind: 'numeric' as const }
    const feature = (kind: FeatureDefinition['transformation']): FeatureDefinition => ({ key: JSON.stringify(kind), label: 'x', description: 'x', family: kind.kind, transformation: kind, valueType: 'number', source: { descriptorId: 'energy', trackableId: 'energy', measurementType: 'continuous' } })
    expect(futureFeatureAvailability(feature({ kind: 'calendar', statistic: 'weekend' }), target, 7)).toBe('calendar-known')
    expect(futureFeatureAvailability(feature({ kind: 'lag', days: 1, encoding: 'numeric' }), target, 2)).toBe('recursive-target')
    expect(futureFeatureAvailability(feature({ kind: 'event', statistic: 'occurred-today', predicate: { ownerTrackableId: 'travel' } }), target, 1)).toBe('unavailable-future')
  })

  it('keeps constant and rare binary baselines probabilistic across seven horizons', () => {
    for (const data of [binaryHistory(29, () => true), binaryHistory(29, (index) => index !== 28)]) {
      const week = forecastTargetRangeAsOf(data, 'present', date(28), 7)
      expect(week.days).toHaveLength(7); expect(week.days.every((day) => day.horizonState !== 'insufficient')).toBe(true)
      const probabilities = week.days.map((day) => day.prediction?.kind === 'binary' ? day.prediction.probability : -1)
      expect(probabilities.every((probability) => probability > .5 && probability < 1)).toBe(true)
      expect(probabilities.at(-1)).toBeLessThanOrEqual(probabilities[0])
      expect(week.days.every((day) => day.selectedModelKind === 'baseline')).toBe(true)
    }
  })

  it('preserves nominal exclusivity and independent multi-select probabilities at every horizon', () => {
    const nominal = forecastTargetRangeAsOf(choiceHistory('single_choice'), 'mood', date(39), 7)
    const multi = forecastTargetRangeAsOf(choiceHistory('multi_select'), 'location', date(39), 7)
    for (const day of nominal.days) if (day.prediction?.kind === 'nominal') expect(day.prediction.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1)
    for (const day of multi.days) if (day.prediction?.kind === 'multiselect') { expect(day.prediction.probabilities.every((item) => item.probability >= 0 && item.probability <= 1)).toBe(true); expect(day.prediction.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeGreaterThan(1) }
  })

  it('supports mixed horizon eligibility and a stable revision-aware cache key', () => {
    const sparse = numericHistory(10, (index) => index)
    const week = forecastTargetRangeAsOf(sparse, 'energy', date(9), 7)
    expect(week.days[0].horizonState).not.toBe('insufficient'); expect(week.days.at(-1)?.horizonState).toBe('insufficient')
    const request = { asOfDate: date(9), horizonDays: 7, targetDescriptorIds: ['energy'] }
    expect(forecastCacheKey(sparse, request)).toBe(forecastCacheKey(sparse, request))
    expect(forecastCacheKey({ ...sparse, observations: sparse.observations.map((item, index) => index ? item : { ...item, revision: 2 }) }, request)).not.toBe(forecastCacheKey(sparse, request))
    expect(forecastCacheKey(sparse, { ...request, policy: { horizonObservationStep: 4 } })).not.toBe(forecastCacheKey(sparse, request))
  })

  it('produces finite seven-day outlooks for stable, trend-like, noisy, and regime-shift histories', () => {
    const scenarios = [
      numericHistory(70, () => 4),
      numericHistory(70, (index) => 1 + index / 20),
      numericHistory(70, (index) => 4 + Math.sin(index * 2.17) * 1.8),
      numericHistory(70, (index) => index < 45 ? 2 : 6),
    ]
    for (const data of scenarios) {
      const week = forecastTargetRangeAsOf(data, 'energy', date(69), 7)
      expect(week.days).toHaveLength(7)
      for (const day of week.days) if (day.prediction?.kind === 'numeric') {
        expect(Number.isFinite(day.prediction.estimate)).toBe(true)
        expect(day.prediction.likelyLow).toBeLessThanOrEqual(day.prediction.estimate)
        expect(day.prediction.likelyHigh).toBeGreaterThanOrEqual(day.prediction.estimate)
      }
    }
  })
})
