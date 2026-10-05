import { describe, expect, it } from 'vitest'
import type { LogRecord, Observation, ObservationOptionSelection, Trackable, TrackableOption, TrackableVersion } from '../../domain/models/index.ts'
import type { TrendsData } from '../AnalyticsProvider.ts'
import { forecastFeatureReviewWeight, forecastTargetAsOf, forecastTomorrow, uninformativeForecastRange } from './forecastEngine.ts'
import type { FeatureDefinition } from '../features/featureTypes.ts'
import type { RelationshipReview } from '../insights/insightReview.ts'

const stamp = '2025-01-01T00:00:00.000Z'
const sync = { createdAt: stamp, updatedAt: stamp, deletedAt: null, revision: 1 }
const date = (index: number): string => new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
const trackable = (id: string): Trackable => ({ ...sync, id, categoryId: 'general', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'measurement', recordSemantics: 'daily_value' })
const version = (id: string, inputType: TrackableVersion['inputType'], configuration: TrackableVersion['configuration'] = {}): TrackableVersion => ({ ...sync, id: `${id}:v1`, trackableId: id, version: 1, name: id, inputType, valueDirection: 'neutral', configuration, retiredAt: null })
const record = (index: number, extras: Partial<LogRecord> = {}): LogRecord => ({ ...sync, id: `day:${index}`, recordKind: 'routine', localDate: date(index), startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'app', ...extras })
const observation = (index: number, id: string, answer: Observation['answer'], extras: Partial<Observation> = {}): Observation => ({ ...sync, id: `${id}:${index}`, logRecordId: `day:${index}`, trackableId: id, trackableVersion: 1, answer, ...extras })
const option = (id: string, optionId: string, label = optionId): TrackableOption => ({ ...sync, id: `${id}:${optionId}`, trackableId: id, trackableVersion: 1, optionId, storedValue: optionId, label, sortOrder: 0, active: true })
const choice = (): Observation['answer'] => ({ state: 'answered', value: { kind: 'choice', value: null } })
const numeric = (value: number): Observation['answer'] => ({ state: 'answered', value: { kind: 'number', value } })
const selection = (observationId: string, optionId: string): ObservationOptionSelection => ({ ...sync, id: `${observationId}:${optionId}`, observationId, optionId })
const empty = (): TrendsData => ({ analysisMappings: [], categories: [], logRecords: [], observations: [], observationSelections: [], trackables: [], trackableOptions: [], trackableVersions: [], trackableFields: [], trackableDailyAssertions: [] })

function numericHistory(count = 96): TrendsData {
  const data = empty(); data.trackables = [trackable('energy'), { ...trackable('medication'), recordSemantics: 'occurrence' }]; data.trackableVersions = [version('energy', 'number'), version('medication', 'boolean')]
  data.logRecords = [...Array.from({ length: count }, (_, index) => record(index)), { ...record(80), id: 'medication:80', recordKind: 'quick_log', trackableId: 'medication', trackableVersion: 1 }]
  data.observations = Array.from({ length: count }, (_, index) => observation(index, 'energy', numeric(4 + Math.sin(index * .52) + (index ? .5 * Math.sin((index - 1) * .52) : 0))))
  return data
}

function binaryHistory(count: number, yes: (index: number) => boolean): TrendsData {
  const data = empty(); data.trackables = [trackable('present')]; data.trackableVersions = [version('present', 'boolean')]
  data.logRecords = Array.from({ length: count }, (_, index) => record(index))
  data.observations = Array.from({ length: count }, (_, index) => observation(index, 'present', { state: 'answered', value: { kind: 'boolean', value: yes(index) } }))
  return data
}

function scaleHistory(count: number, score: (index: number) => number): TrendsData {
  const data = empty(); data.trackables = [trackable('energy')]; data.trackableVersions = [{ ...version('energy', 'scale'), scaleMin: 1, scaleMax: 5 }]
  data.logRecords = Array.from({ length: count }, (_, index) => record(index))
  data.observations = Array.from({ length: count }, (_, index) => observation(index, 'energy', { state: 'answered', value: { kind: 'scale', value: score(index) } }))
  return data
}

describe('next-day forecasting', () => {
  it('uses cutoff-available self lags, produces an interval, and is deterministic', () => {
    const data = numericHistory(); const first = forecastTargetAsOf(data, 'energy', date(95))
    const second = forecastTargetAsOf(data, 'energy', date(95))
    expect(first.status).toBe('ready'); expect(first.prediction?.kind).toBe('numeric')
    if (first.prediction?.kind === 'numeric') expect(first.prediction.likelyLow).toBeLessThanOrEqual(first.prediction.likelyHigh)
    expect(first).toEqual(second)
    expect(first.diagnostics.excludedFeatureKeys.some((key) => key.startsWith('event/'))).toBe(true)
  })
  it('does not leak future target values or later-appended history into an historical as-of forecast', () => {
    const data = numericHistory(); const asOf = date(70); const before = forecastTargetAsOf(data, 'energy', asOf)
    const future = { ...data, logRecords: [...data.logRecords, { ...record(71), id: 'later-record', createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z' }], observations: [...data.observations, { ...observation(71, 'energy', numeric(999)), id: 'later-observation', logRecordId: 'later-record', createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z' }] }
    expect(forecastTargetAsOf(future, 'energy', asOf)).toEqual(before)
  })
  it('returns structured insufficient-history instead of manufacturing a result', () => {
    const data = numericHistory(3); const result = forecastTargetAsOf(data, 'energy', date(2))
    expect(result.status).toBe('insufficient-history'); expect(result.prediction).toBeUndefined(); expect(result.warnings.join(' ')).toContain('too few')
  })
  it('allows 10 dense and 29 numeric observations as basic forecasts but rejects stale history', () => {
    const dense = forecastTargetAsOf(numericHistory(10), 'energy', date(9))
    expect(dense.status).toBe('ready'); expect(dense.diagnostics.capability).toBe('basic')
    expect(forecastTargetAsOf(numericHistory(29), 'energy', date(28)).status).toBe('ready')
    expect(forecastTargetAsOf(scaleHistory(29, (index) => index % 2 ? 3 : 4), 'energy', date(28)).status).toBe('ready')
    const stale = forecastTargetAsOf(numericHistory(30), 'energy', date(400))
    expect(stale.status).toBe('insufficient-history'); expect(stale.warnings.join(' ')).toContain('too old')
  })
  it('counts covered days rather than multiple observations on one day', () => {
    const data = numericHistory(4)
    data.observations = [...data.observations, ...Array.from({ length: 20 }, (_, index) => ({ ...observation(3, 'energy', numeric(4)), id: `extra:${index}` }))]
    expect(forecastTargetAsOf(data, 'energy', date(3)).status).toBe('insufficient-history')
  })
  it('provides smoothed prevalence for constant and near-constant binary histories', () => {
    const yes = forecastTargetAsOf(binaryHistory(29, () => true), 'present', date(28))
    const no = forecastTargetAsOf(binaryHistory(29, () => false), 'present', date(28))
    const rare = forecastTargetAsOf(binaryHistory(29, (index) => index !== 28), 'present', date(28))
    for (const result of [yes, no, rare]) { expect(result.status).toBe('ready'); expect(result.selectedModelKind).toBe('baseline'); expect(result.diagnostics.limitedVariation).toBe(true); expect(result.diagnostics.capability).toBe('basic') }
    expect(yes.prediction).toEqual({ kind: 'binary', probability: 30 / 31 })
    expect(no.prediction).toEqual({ kind: 'binary', probability: 1 / 31 })
    expect(rare.prediction).toEqual({ kind: 'binary', probability: 29 / 31 })
  })
  it('uses narrowed recent dispersion for concentrated scales and flags full-domain uncertainty', () => {
    const concentrated = forecastTargetAsOf(scaleHistory(29, (index) => index % 5 ? 4 : 3), 'energy', date(28))
    const noisy = forecastTargetAsOf(scaleHistory(29, (index) => index % 5 + 1), 'energy', date(28))
    expect(concentrated.status).toBe('ready'); expect(concentrated.diagnostics.uncertaintyMethod).toBe('recent-dispersion')
    expect(concentrated.diagnostics.uninformativeRange).toBe(false)
    expect(noisy.diagnostics.uninformativeRange).toBe(true)
    expect(uninformativeForecastRange(1, 5, concentrated.target)).toBe(true)
    if (concentrated.prediction?.kind === 'ordinal' || concentrated.prediction?.kind === 'numeric') { expect(concentrated.prediction.likelyLow).toBeGreaterThanOrEqual(1); expect(concentrated.prediction.likelyHigh).toBeLessThanOrEqual(5) }
  })
  it('uses holdout residuals when supported and lowers confidence when the scale cannot be narrowed', () => {
    const concentrated = forecastTargetAsOf(scaleHistory(96, (index) => index % 5 ? 4 : 3), 'energy', date(95))
    const noisy = forecastTargetAsOf(scaleHistory(96, (index) => { const hashed = Math.sin(index * 12.9898) * 43758.5453; return Math.floor((hashed - Math.floor(hashed)) * 5) + 1 }), 'energy', date(95))
    expect(concentrated.diagnostics.uncertaintyMethod).toBe('holdout-residuals')
    expect(noisy.diagnostics.uncertaintyMethod).toBe('holdout-residuals')
    expect(concentrated.diagnostics.uninformativeRange).toBe(false)
    expect(noisy.confidence).toBe('low')
    expect(concentrated.confidence).not.toBe('low')
  })
  it('uses a validated baseline when yesterday was not recorded and lag predictors are unavailable', () => {
    const data = numericHistory(95)
    const result = forecastTargetAsOf(data, 'energy', date(95))
    expect(result.forecastDate).toBe(date(96))
    expect(result.status).toBe('ready')
    expect(result.selectedModelKind).toBe('baseline')
    expect(result.baselineScore).toBeTypeOf('number')
  })
  it('keeps a baseline when a deterministic noisy series has no stable extra skill', () => {
    const data = numericHistory(); data.observations = data.observations.filter((item) => item.trackableId === 'energy').map((item, index) => { const hashed = Math.sin(index * 12.9898) * 43758.5453; return { ...item, answer: numeric(Math.floor((hashed - Math.floor(hashed)) * 20) - 10) } })
    const result = forecastTargetAsOf(data, 'energy', date(95))
    expect(result.status).toBe('ready'); expect(result.selectedModelKind).toBe('baseline'); expect(result.warnings.join(' ')).toContain('Recent history')
  })
  it('reconstructs independent multi-select probabilities without forcing them to sum to one', () => {
    const data = empty(); data.trackables = [trackable('location')]; data.trackableVersions = [version('location', 'multi_select')]; data.trackableOptions = [option('location', 'jaw', 'Jaw'), option('location', 'chin', 'Chin')]
    data.logRecords = Array.from({ length: 96 }, (_, index) => record(index))
    data.observations = Array.from({ length: 96 }, (_, index) => observation(index, 'location', choice()))
    data.observationSelections = Array.from({ length: 96 }, (_, index) => [...(index % 5 ? [selection(`location:${index}`, 'jaw')] : []), ...(index % 5 < 3 ? [selection(`location:${index}`, 'chin')] : [])]).flat()
    const result = forecastTomorrow(data, { asOfDate: date(95), targetDescriptorIds: ['location'] })[0]
    expect(result.status).toBe('ready'); expect(result.prediction?.kind).toBe('multiselect')
    if (result.prediction?.kind === 'multiselect') { expect(result.prediction.probabilities).toHaveLength(2); expect(result.prediction.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeGreaterThan(1) }
  })
  it('uses relationship review feedback as a bounded feature preference only', () => {
    const feature = { key: 'lag/source/numeric/1', source: { descriptorId: 'source', trackableId: 'source', measurementType: 'continuous' } } as FeatureDefinition
    const review = { id: 'review', kind: 'relationship', relationshipIdentity: 'family/example', targetDescriptorId: 'target', targetTrackableId: 'target', predictorDescriptorId: 'source', judgment: 'no', confidence: 'high', evidenceSignature: '[]', titleAtReview: 'Example', createdAt: stamp, updatedAt: stamp } as RelationshipReview
    expect(forecastFeatureReviewWeight(feature, [review]).weight).toBeLessThan(0)
    expect(forecastFeatureReviewWeight(feature, [{ ...review, judgment: 'unknown' }]).weight).toBe(0)
    expect(forecastFeatureReviewWeight(feature, [{ ...review, judgment: 'yes' }]).weight).toBeGreaterThan(0)
    expect(forecastFeatureReviewWeight(feature, [review], 'other-target').weight).toBe(0)
  })
  it('supports binary, ordered, and nominal targets without coercing categories into numeric regression', () => {
    const data = empty(); data.trackables = [trackable('binary'), trackable('ordinal'), trackable('category')]
    data.trackableVersions = [version('binary', 'boolean'), version('ordinal', 'single_choice', { analysisMeasurementType: 'ordinal', orderedOptionIds: ['low', 'high'] }), version('category', 'single_choice')]
    data.trackableOptions = [option('ordinal', 'low', 'Low'), option('ordinal', 'high', 'High'), option('category', 'mild', 'Mild'), option('category', 'severe', 'Severe')]
    data.logRecords = Array.from({ length: 96 }, (_, index) => record(index))
    data.observations = Array.from({ length: 96 }, (_, index) => [observation(index, 'binary', { state: 'answered', value: { kind: 'boolean', value: index % 2 === 0 } }), observation(index, 'ordinal', choice()), observation(index, 'category', choice())]).flat()
    data.observationSelections = Array.from({ length: 96 }, (_, index) => [selection(`ordinal:${index}`, index % 2 ? 'low' : 'high'), selection(`category:${index}`, index % 3 ? 'mild' : 'severe')]).flat()
    const results = forecastTomorrow(data, { asOfDate: date(95), targetDescriptorIds: ['binary', 'ordinal', 'category'] })
    expect(results.find((item) => item.target.descriptorId === 'binary')?.prediction?.kind).toBe('binary')
    const ordinal = results.find((item) => item.target.descriptorId === 'ordinal')
    expect(ordinal?.prediction?.kind).toBe('ordinal')
    expect(ordinal?.target.options?.map((item) => item.label)).toEqual(['Low', 'High'])
    const nominal = results.find((item) => item.target.descriptorId === 'category')
    expect(nominal?.prediction?.kind).toBe('nominal')
    if (nominal?.prediction?.kind === 'nominal') expect(nominal.prediction.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1)
  })
})
