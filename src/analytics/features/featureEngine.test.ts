import { describe, expect, it } from 'vitest'
import type { TrendsData } from '../AnalyticsProvider.ts'
import type { AnalysisValueMapping, LogRecord, Observation, ObservationOptionSelection, Trackable, TrackableDailyAssertion, TrackableField, TrackableOption, TrackableVersion } from '../../domain/models/index.ts'
import { featureCatalog, formatFeatureFrame, generateFeatureFrame, generateFeatureFrameFromProvider } from './featureEngine.ts'
import type { FeatureDefinition, FeatureGenerationRequest, LongitudinalFeatureFrame } from './featureTypes.ts'

const timestamp = '2026-09-01T12:00:00.000Z'
const sync = { createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
const trackable = (id: string, version = 1, occurrence = false): Trackable => ({ ...sync, id, categoryId: 'general', active: true, archivedAt: null, currentVersion: version, tags: [], dataRole: 'measurement', recordSemantics: occurrence ? 'occurrence' : 'daily_value' })
const definition = (id: string, inputType: TrackableVersion['inputType'], extras: Partial<TrackableVersion> = {}): TrackableVersion => ({ ...sync, id: `${id}:v${extras.version ?? 1}`, trackableId: id, version: 1, name: id, inputType, valueDirection: 'neutral', configuration: {}, retiredAt: null, ...extras })
const record = (id: string, date: string, owner?: string, extras: Partial<LogRecord> = {}): LogRecord => ({ ...sync, id, recordKind: owner ? 'quick_log' : 'routine', ...(owner ? { trackableId: owner, trackableVersion: 1 } : {}), localDate: date, startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'app', ...extras })
const observation = (id: string, recordId: string, trackableId: string, answer: Observation['answer'], version = 1, extras: Partial<Observation> = {}): Observation => ({ ...sync, id, logRecordId: recordId, trackableId, trackableVersion: version, answer, ...extras })
const option = (id: string, version: number, optionId: string, label: string, sortOrder = 0): TrackableOption => ({ ...sync, id: `${id}:${version}:${optionId}`, trackableId: id, trackableVersion: version, optionId, storedValue: optionId, label, sortOrder, active: true })
const selection = (observationId: string, optionId: string): ObservationOptionSelection => ({ ...sync, id: `${observationId}:${optionId}`, observationId, optionId })
const empty = (extras: Partial<TrendsData> = {}): TrendsData => ({ analysisMappings: [], categories: [], logRecords: [], observations: [], observationSelections: [], trackables: [], trackableOptions: [], trackableVersions: [], trackableFields: [], trackableDailyAssertions: [], ...extras })
const request = (date: string, extras: Partial<FeatureGenerationRequest> = {}): FeatureGenerationRequest => ({ startDate: date, endDate: date, asOfDate: date, ...extras })
const feature = (frame: LongitudinalFeatureFrame, family: FeatureDefinition['family'], sourceId: string | undefined, kind: string, days?: number, optionId?: string): FeatureDefinition => {
  const found = frame.catalog.find((item) => item.family === family && item.source?.trackableId === sourceId && item.transformation.kind === kind && ('days' in item.transformation ? item.transformation.days === days : days === undefined) && ('optionId' in item.transformation ? item.transformation.optionId === optionId : optionId === undefined))
  if (!found) throw new Error(`Feature missing: ${family}/${sourceId}/${kind}/${days}/${optionId}`)
  return found
}
const by = (frame: LongitudinalFeatureFrame, date: string, item: FeatureDefinition) => frame.rows.find((row) => row.date === date)!.cells[item.key]
const numeric = (value: number): Observation['answer'] => ({ state: 'answered', value: { kind: 'number', value } })
const choice = (): Observation['answer'] => ({ state: 'answered', value: { kind: 'choice', value: null } })

describe('generic longitudinal feature generation', () => {
  it('uses calendar-day lags, preserves empty days, and computes rolling statistics from observed values only', () => {
    const data = empty({
      trackables: [trackable('Energy Level')], trackableVersions: [definition('Energy Level', 'number')],
      logRecords: [record('r1', '2026-10-01'), record('r3', '2026-10-03'), record('r8', '2026-10-08')],
      observations: [observation('o1', 'r1', 'Energy Level', numeric(1)), observation('o3', 'r3', 'Energy Level', numeric(3)), observation('o8', 'r8', 'Energy Level', numeric(8))],
    })
    const frame = generateFeatureFrame(data, request('2026-10-08'))
    const lag1 = feature(frame, 'lag', 'Energy Level', 'lag', 1)
    const lag7 = feature(frame, 'lag', 'Energy Level', 'lag', 7)
    const mean = frame.catalog.find((item) => item.transformation.kind === 'rolling' && item.transformation.statistic === 'mean' && item.transformation.days === 7)!
    const count = frame.catalog.find((item) => item.transformation.kind === 'rolling' && item.transformation.statistic === 'observed-count' && item.transformation.days === 7)!
    const slope = frame.catalog.find((item) => item.transformation.kind === 'rolling' && item.transformation.statistic === 'slope' && item.transformation.days === 7)!
    expect(by(frame, '2026-10-08', lag1)).toMatchObject({ value: null, missingness: 'no-check-in' })
    expect(by(frame, '2026-10-08', lag7)).toMatchObject({ value: 1, missingness: 'observed' })
    expect(by(frame, '2026-10-08', mean)).toMatchObject({ value: 5.5, observedCount: 2 })
    expect(by(frame, '2026-10-08', count)).toMatchObject({ value: 2, observedCount: 2 })
    expect(by(frame, '2026-10-08', slope).value).toBe(1) // Actual five-day gap, not consecutive-sample slope.
    expect(frame.catalog.some((item) => item.label === 'Energy Level — 1 day ago')).toBe(true)
    expect(frame.catalog.some((item) => item.label === 'Average Energy Level — previous 7 days')).toBe(true)
    expect(formatFeatureFrame(frame, [lag1.key])).toContain('∅ [no-check-in]')
  })

  it('uses the latest recorded same-day value independent of observation IDs', () => {
    const data = empty({ trackables: [trackable('Energy')], trackableVersions: [definition('Energy', 'number')],
      logRecords: [record('early', '2026-10-02', undefined, { startTime: '2026-10-02T08:00:00.000Z', startTimePrecision: 'exact' }), record('late', '2026-10-02', undefined, { startTime: '2026-10-02T20:00:00.000Z', startTimePrecision: 'exact' })],
      observations: [observation('z-early', 'early', 'Energy', numeric(1)), observation('a-late', 'late', 'Energy', numeric(9))],
    })
    const frame = generateFeatureFrame(data, request('2026-10-03'))
    const lag = feature(frame, 'lag', 'Energy', 'lag', 1)
    expect(by(frame, '2026-10-03', lag)).toMatchObject({ value: 9, provenance: [{ recordId: 'late', observationId: 'a-late' }] })
  })

  it('distinguishes unanswered, skipped, not presented, and absent check-ins', () => {
    const data = empty({ trackables: [trackable('mood')], trackableVersions: [definition('mood', 'number')],
      logRecords: [record('one', '2026-10-01'), record('two', '2026-10-02'), record('three', '2026-10-03'), record('four', '2026-10-04')],
      observations: [observation('one-answer', 'one', 'mood', numeric(5)), observation('two-answer', 'two', 'mood', { state: 'unanswered' }), observation('three-answer', 'three', 'mood', { state: 'skipped' })],
    })
    const frame = generateFeatureFrame(data, request('2026-10-03', { startDate: '2026-10-03', endDate: '2026-10-06', asOfDate: '2026-10-06' }))
    const lag = feature(frame, 'lag', 'mood', 'lag', 1)
    expect(by(frame, '2026-10-03', lag).missingness).toBe('unanswered')
    expect(by(frame, '2026-10-04', lag).missingness).toBe('skipped')
    expect(by(frame, '2026-10-05', lag).missingness).toBe('not-presented')
    expect(by(frame, '2026-10-06', lag).missingness).toBe('no-check-in')
  })

  it('keeps explicit No separate from missing and generates nominal indicators without scalar category codes', () => {
    const data = empty({
      trackables: [trackable('Headache'), trackable('Mood')], trackableVersions: [definition('Headache', 'boolean'), definition('Mood', 'single_choice')],
      trackableOptions: [option('Mood', 1, 'good', 'Good'), option('Mood', 1, 'low', 'Low')],
      logRecords: [record('yesterday', '2026-10-02')],
      observations: [observation('headache', 'yesterday', 'Headache', { state: 'answered', value: { kind: 'boolean', value: false } }), observation('mood', 'yesterday', 'Mood', choice())],
      observationSelections: [selection('mood', 'low')],
    })
    const frame = generateFeatureFrame(data, request('2026-10-03'))
    const binary = feature(frame, 'lag', 'Headache', 'lag', 1)
    const good = frame.catalog.find((item) => item.transformation.kind === 'lag' && item.transformation.optionId === 'good' && item.transformation.days === 1)!
    const low = frame.catalog.find((item) => item.transformation.kind === 'lag' && item.transformation.optionId === 'low' && item.transformation.days === 1)!
    expect(by(frame, '2026-10-03', binary)).toMatchObject({ value: false, missingness: 'observed' })
    expect(by(frame, '2026-10-03', good)).toMatchObject({ value: false, missingness: 'observed-zero' })
    expect(by(frame, '2026-10-03', low)).toMatchObject({ value: true, missingness: 'observed' })
    expect(frame.catalog.filter((item) => item.source?.trackableId === 'Mood').every((item) => item.valueType === 'boolean')).toBe(true)
  })

  it('uses explicit ordinal order as rank and offers option indicators without ordinal means', () => {
    const data = empty({ trackables: [trackable('Severity')], trackableVersions: [definition('Severity', 'single_choice', { configuration: { analysisMeasurementType: 'ordinal', orderedOptionIds: ['low', 'high'] } })],
      trackableOptions: [option('Severity', 1, 'high', 'High'), option('Severity', 1, 'low', 'Low')], logRecords: [record('r', '2026-10-02')],
      observations: [observation('o', 'r', 'Severity', choice())], observationSelections: [selection('o', 'high')],
    })
    const frame = generateFeatureFrame(data, request('2026-10-03'))
    const rank = frame.catalog.find((item) => item.transformation.kind === 'lag' && item.transformation.encoding === 'ordinal-rank' && item.transformation.days === 1)!
    const indicator = frame.catalog.find((item) => item.transformation.kind === 'lag' && item.transformation.optionId === 'high' && item.transformation.days === 1)!
    expect(by(frame, '2026-10-03', rank).value).toBe(1)
    expect(rank).toMatchObject({ valueType: 'ordinal-rank', ordinalDistanceMeaningful: false })
    expect(by(frame, '2026-10-03', indicator).value).toBe(true)
    expect(frame.catalog.some((item) => item.source?.trackableId === 'Severity' && item.transformation.kind === 'rolling' && item.transformation.statistic === 'mean')).toBe(false)
  })

  it('treats an unselected multi-select option as false only when an answer was recorded', () => {
    const data = empty({ trackables: [trackable('Colors')], trackableVersions: [definition('Colors', 'multi_select')],
      trackableOptions: [option('Colors', 1, 'clear', 'Clear'), option('Colors', 1, 'white', 'White')],
      logRecords: [record('r', '2026-10-02')], observations: [observation('o', 'r', 'Colors', choice())], observationSelections: [selection('o', 'clear')],
    })
    const frame = generateFeatureFrame(data, request('2026-10-03', { endDate: '2026-10-04', asOfDate: '2026-10-04' }))
    const white = frame.catalog.find((item) => item.transformation.kind === 'lag' && item.transformation.optionId === 'white' && item.transformation.days === 1)!
    expect(by(frame, '2026-10-03', white)).toMatchObject({ value: false, missingness: 'observed-zero' })
    expect(by(frame, '2026-10-04', white)).toMatchObject({ value: null, missingness: 'no-check-in' })
  })

  it('receives canonical per-option presence from a historical multi-select with recreated option IDs', () => {
    const data = empty({ trackables: [trackable('Acne Location', 2)], trackableVersions: [definition('Acne Location', 'multi_select'), definition('Acne Location', 'multi_select', { id: 'Acne Location:v2', version: 2 })],
      trackableOptions: [option('Acne Location', 1, 'old-forehead', 'Forehead'), option('Acne Location', 1, 'old-chin', 'Chin'), option('Acne Location', 2, 'new-chin', 'Chin'), option('Acne Location', 2, 'new-forehead', 'Forehead')],
      logRecords: [record('r', '2026-10-02')], observations: [observation('o', 'r', 'Acne Location', choice())], observationSelections: [selection('o', 'old-forehead')],
    })
    const original = structuredClone(data.observations)
    const frame = generateFeatureFrame(data, request('2026-10-03'))
    const forehead = frame.catalog.find((item) => item.transformation.kind === 'lag' && item.transformation.optionId === 'new-forehead' && item.transformation.days === 1)!
    const chin = frame.catalog.find((item) => item.transformation.kind === 'lag' && item.transformation.optionId === 'new-chin' && item.transformation.days === 1)!
    expect(by(frame, '2026-10-03', forehead)).toMatchObject({ value: true, missingness: 'observed', provenance: [{ recordId: 'r', observationId: 'o', trackableVersion: 1 }] })
    expect(by(frame, '2026-10-03', chin)).toMatchObject({ value: false, missingness: 'observed-zero' })
    expect(frame.catalog.some((item) => item.transformation.kind === 'lag' && item.transformation.optionId === 'old-forehead')).toBe(false)
    expect(data.observations).toEqual(original)
  })

  it('counts repeated events, resets days-since, and evaluates 3/7/14/30-day post-event windows', () => {
    const data = empty({ trackables: [trackable('Procedure', 1, true)], trackableVersions: [definition('Procedure', 'boolean')],
      logRecords: [record('e1', '2026-10-01', 'Procedure'), record('e2', '2026-10-03', 'Procedure'), record('e3', '2026-10-03', 'Procedure'), record('e4', '2026-10-10', 'Procedure')],
    })
    const frame = generateFeatureFrame(data, request('2026-10-03', { startDate: '2026-10-03', endDate: '2026-11-11', asOfDate: '2026-11-11', policy: { families: ['event'] } }))
    const eventFeature = (statistic: string, days?: number) => frame.catalog.find((item) => item.transformation.kind === 'event' && item.transformation.statistic === statistic && item.transformation.days === days)!
    expect(by(frame, '2026-10-03', eventFeature('occurred-today'))).toMatchObject({ value: true, missingness: 'observed' })
    expect(by(frame, '2026-10-03', eventFeature('count-today'))).toMatchObject({ value: 2, observedCount: 2 })
    expect(by(frame, '2026-10-03', eventFeature('days-since')).value).toBe(0)
    expect(by(frame, '2026-10-05', eventFeature('days-since')).value).toBe(2)
    expect(by(frame, '2026-10-10', eventFeature('days-since')).value).toBe(0)
    expect(by(frame, '2026-10-03', eventFeature('count-window', 7)).value).toBe(3)
    expect(by(frame, '2026-10-10', eventFeature('count-window', 7)).value).toBe(1)
    expect(by(frame, '2026-10-10', eventFeature('count-window', 30)).value).toBe(4)
    expect(by(frame, '2026-10-10', eventFeature('count-window', 90)).value).toBe(4)
    expect(by(frame, '2026-10-13', eventFeature('post-window', 3)).value).toBe(true)
    expect(by(frame, '2026-10-14', eventFeature('post-window', 3)).value).toBe(false)
    expect(by(frame, '2026-10-17', eventFeature('post-window', 7)).value).toBe(true)
    expect(by(frame, '2026-10-18', eventFeature('post-window', 7)).value).toBe(false)
    expect(by(frame, '2026-10-24', eventFeature('post-window', 14)).value).toBe(true)
    expect(by(frame, '2026-10-25', eventFeature('post-window', 14)).value).toBe(false)
    expect(by(frame, '2026-11-09', eventFeature('post-window', 30)).value).toBe(true)
    expect(by(frame, '2026-11-10', eventFeature('post-window', 30)).value).toBe(false)
    expect(frame.catalog).toHaveLength(10)
  })

  it('distinguishes an explicit occurrence No from a day with no recorded event', () => {
    const assertion: TrackableDailyAssertion = { ...sync, id: 'no-procedure', date: '2026-10-03', trackableId: 'Procedure', status: 'did_not_occur', recordedAt: timestamp }
    const data = empty({ trackables: [trackable('Procedure', 1, true)], trackableVersions: [definition('Procedure', 'boolean')], trackableDailyAssertions: [assertion] })
    const frame = generateFeatureFrame(data, request('2026-10-03', { endDate: '2026-10-04', asOfDate: '2026-10-04', policy: { families: ['event'] } }))
    const occurred = frame.catalog.find((item) => item.transformation.kind === 'event' && item.transformation.statistic === 'occurred-today')!
    const daysSince = frame.catalog.find((item) => item.transformation.kind === 'event' && item.transformation.statistic === 'days-since')!
    expect(by(frame, '2026-10-03', occurred)).toMatchObject({ value: false, missingness: 'explicit-no' })
    expect(by(frame, '2026-10-04', occurred)).toMatchObject({ value: false, missingness: 'no-recorded-event' })
    expect(by(frame, '2026-10-04', daysSince)).toMatchObject({ value: null, missingness: 'no-prior-event' })
  })

  it('joins structured field answers to their parent event through the stable record ID', () => {
    const field: TrackableField = { ...sync, id: 'procedure-type-field', ownerTrackableId: 'Procedure', ownerTrackableVersion: 1, fieldTrackableId: 'Procedure Type', fieldTrackableVersion: 1, sortOrder: 0, enabled: true, completionBehavior: 'optional' }
    const data = empty({ trackables: [trackable('Procedure', 1, true), trackable('Procedure Type')], trackableVersions: [definition('Procedure', 'boolean'), definition('Procedure Type', 'single_choice')],
      trackableFields: [field], trackableOptions: [option('Procedure Type', 1, 'iud', 'IUD Replacement'), option('Procedure Type', 1, 'other', 'Other')],
      logRecords: [record('e1', '2026-10-01', 'Procedure'), record('e2', '2026-10-03', 'Procedure'), record('e3', '2026-10-04', 'Procedure')],
      observations: [observation('f1', 'e1', 'Procedure Type', choice()), observation('f2', 'e2', 'Procedure Type', choice()), observation('f3', 'e3', 'Procedure Type', choice())],
      observationSelections: [selection('f1', 'iud'), selection('f2', 'other'), selection('f3', 'iud')],
    })
    const frame = generateFeatureFrame(data, request('2026-10-05', { policy: { families: ['event'] } }))
    const matched = frame.catalog.filter((item) => item.transformation.kind === 'event' && item.transformation.predicate.optionId === 'iud')
    const daysSince = matched.find((item) => item.transformation.kind === 'event' && item.transformation.statistic === 'days-since')!
    const count = matched.find((item) => item.transformation.kind === 'event' && item.transformation.statistic === 'count-window' && item.transformation.days === 7)!
    expect(daysSince.label).toContain('IUD Replacement')
    expect(daysSince.transformation).toMatchObject({ predicate: { ownerTrackableId: 'Procedure', fieldTrackableId: 'Procedure Type', optionId: 'iud' } })
    expect(by(frame, '2026-10-05', daysSince)).toMatchObject({ value: 1, provenance: [{ recordId: 'e3', observationId: 'f3' }] })
    expect(by(frame, '2026-10-05', count)).toMatchObject({ value: 2, observedCount: 2 })
    expect(frame.catalog).toHaveLength(30) // Parent plus two observed structured predicates, ten terms each.
  })

  it('uses mapped canonical categories and leaves intentionally unmapped historical answers unavailable', () => {
    const mapping: AnalysisValueMapping = { ...sync, id: 'mapping:severity', trackableId: 'Severity', sourceTrackableVersion: 1, targetTrackableVersion: 2, targetMeasurementType: 'nominal-single', valueMappings: [{ sourceValue: 'number:1', mappedValue: 'option:low', label: 'Low' }] }
    const data = empty({ trackables: [trackable('Severity', 2)], trackableVersions: [definition('Severity', 'scale', { scaleMin: 1, scaleMax: 2 }), definition('Severity', 'single_choice', { id: 'Severity:v2', version: 2 })],
      trackableOptions: [option('Severity', 2, 'low', 'Low'), option('Severity', 2, 'high', 'High')], analysisMappings: [mapping],
      logRecords: [record('r1', '2026-10-01'), record('r2', '2026-10-02')],
      observations: [observation('o1', 'r1', 'Severity', { state: 'answered', value: { kind: 'scale', value: 1 } }), observation('o2', 'r2', 'Severity', { state: 'answered', value: { kind: 'scale', value: 2 } })],
    })
    const frame = generateFeatureFrame(data, request('2026-10-02', { startDate: '2026-10-02', endDate: '2026-10-03', asOfDate: '2026-10-03' }))
    const low = frame.catalog.find((item) => item.transformation.kind === 'lag' && item.transformation.optionId === 'low' && item.transformation.days === 1)!
    expect(by(frame, '2026-10-02', low)).toMatchObject({ value: true, provenance: [{ recordId: 'r1', observationId: 'o1', trackableVersion: 1, mappingId: mapping.id, rawValue: '1', canonicalValue: 'Low' }] })
    expect(by(frame, '2026-10-03', low)).toMatchObject({ value: null, missingness: 'unmapped' })
  })

  it('does not treat removed historical choice options as current categories without a mapping', () => {
    const data = empty({ trackables: [trackable('Mood', 2)], trackableVersions: [definition('Mood', 'single_choice'), definition('Mood', 'single_choice', { id: 'Mood:v2', version: 2 })],
      trackableOptions: [option('Mood', 1, 'retired', 'Retired'), option('Mood', 2, 'current', 'Current')],
      logRecords: [record('r', '2026-10-02')], observations: [observation('o', 'r', 'Mood', choice())], observationSelections: [selection('o', 'retired')],
    })
    const frame = generateFeatureFrame(data, request('2026-10-03'))
    const current = frame.catalog.find((item) => item.transformation.kind === 'lag' && item.transformation.optionId === 'current' && item.transformation.days === 1)!
    expect(by(frame, '2026-10-03', current)).toMatchObject({ value: null, missingness: 'unmapped' })
    expect(frame.catalog.some((item) => item.transformation.kind === 'lag' && item.transformation.optionId === 'retired')).toBe(false)
  })

  it('does not reuse an old ordinal rank after the configured order changes', () => {
    const data = empty({ trackables: [trackable('Severity', 2)], trackableVersions: [
      definition('Severity', 'single_choice', { configuration: { analysisMeasurementType: 'ordinal', orderedOptionIds: ['low', 'high'] } }),
      definition('Severity', 'single_choice', { id: 'Severity:v2', version: 2, configuration: { analysisMeasurementType: 'ordinal', orderedOptionIds: ['high', 'low'] } }),
    ], trackableOptions: [option('Severity', 1, 'low', 'Low'), option('Severity', 1, 'high', 'High'), option('Severity', 2, 'low', 'Low'), option('Severity', 2, 'high', 'High')],
    logRecords: [record('r', '2026-10-02')], observations: [observation('o', 'r', 'Severity', choice())], observationSelections: [selection('o', 'low')],
    })
    const frame = generateFeatureFrame(data, request('2026-10-03'))
    const rank = frame.catalog.find((item) => item.transformation.kind === 'lag' && item.transformation.encoding === 'ordinal-rank' && item.transformation.days === 1)!
    expect(by(frame, '2026-10-03', rank)).toMatchObject({ value: null, missingness: 'unmapped' })
  })

  it('provides model-safe calendar cycles and excludes observations beyond the cutoff', () => {
    const data = empty({ trackables: [trackable('Energy')], trackableVersions: [definition('Energy', 'number')],
      logRecords: [record('early', '2026-10-03'), record('future', '2026-10-05')],
      observations: [observation('early-observation', 'early', 'Energy', numeric(2)), observation('future-observation', 'future', 'Energy', numeric(999))],
    })
    const frame = generateFeatureFrame(data, request('2026-10-03'))
    const mean = frame.catalog.find((item) => item.transformation.kind === 'rolling' && item.transformation.statistic === 'mean' && item.transformation.days === 3)!
    const weekend = frame.catalog.find((item) => item.key === 'calendar/weekend')!
    const pair = frame.catalog.filter((item) => item.transformation.kind === 'calendar' && item.transformation.period === 'month')
    expect(by(frame, '2026-10-03', mean).value).toBe(2)
    expect(by(frame, '2026-10-03', weekend).value).toBe(true)
    expect(pair).toHaveLength(2)
    expect(pair[0].transformation).toMatchObject({ pairKey: 'calendar/month' })
    expect(() => generateFeatureFrame(data, request('2026-10-04', { asOfDate: '2026-10-03' }))).toThrow(/cannot exceed asOfDate/)
  })

  it('honors strict timestamp availability and a target-specific same-day event exclusion', () => {
    const data = empty({ trackables: [trackable('Energy'), trackable('Treatment', 1, true)], trackableVersions: [definition('Energy', 'number'), definition('Treatment', 'boolean')],
      logRecords: [record('prior', '2026-10-02'), record('late', '2026-10-03', undefined, { createdAt: '2026-10-03T17:00:00.000Z' }), record('event', '2026-10-03', 'Treatment')],
      observations: [observation('prior-observation', 'prior', 'Energy', numeric(2)), observation('late-observation', 'late', 'Energy', numeric(99), 1, { createdAt: '2026-10-03T17:00:00.000Z' })],
    })
    const frame = generateFeatureFrame(data, request('2026-10-03', { asOfTimestamp: '2026-10-03T09:00:00.000Z', targetTrackableId: 'Treatment' }))
    const mean = frame.catalog.find((item) => item.transformation.kind === 'rolling' && item.transformation.statistic === 'mean' && item.transformation.days === 3)!
    expect(by(frame, '2026-10-03', mean).value).toBe(2)
    expect(frame.catalog.some((item) => item.family === 'event' && item.source?.trackableId === 'Treatment')).toBe(false)
    expect(frame.catalog.some((item) => item.family === 'lag' && item.source?.trackableId === 'Energy')).toBe(true)
    const target = generateFeatureFrame(data, request('2026-10-03', { targetTrackableId: 'Energy' }))
    expect(target.catalog.some((item) => item.family === 'rolling' && item.source?.trackableId === 'Energy')).toBe(false)
    expect(target.catalog.some((item) => item.family === 'lag' && item.source?.trackableId === 'Energy')).toBe(true)
  })

  it('keeps later backfills out of earlier rows when strict knowledge cutoff is requested', () => {
    const data = empty({ trackables: [trackable('Energy')], trackableVersions: [definition('Energy', 'number')],
      logRecords: [record('prior', '2026-10-01'), record('backfill', '2026-10-02', undefined, { createdAt: '2026-10-04T12:00:00.000Z', updatedAt: '2026-10-04T12:00:00.000Z' })],
      observations: [observation('prior-observation', 'prior', 'Energy', numeric(1)), observation('backfilled-observation', 'backfill', 'Energy', numeric(9), 1, { createdAt: '2026-10-04T12:00:00.000Z', updatedAt: '2026-10-04T12:00:00.000Z' })],
    })
    const frame = generateFeatureFrame(data, request('2026-10-02', { endDate: '2026-10-04', asOfDate: '2026-10-04', asOfTimestamp: '2026-10-04T23:00:00.000Z' }))
    const mean = frame.catalog.find((item) => item.transformation.kind === 'rolling' && item.transformation.statistic === 'mean' && item.transformation.days === 3)!
    expect(by(frame, '2026-10-02', mean).value).toBe(1)
    expect(by(frame, '2026-10-04', mean).value).toBe(9)
  })

  it('scopes feature families and cardinality, enforces a cap, and keeps stable semantic identities', async () => {
    const data = empty({ trackables: [trackable('Mood')], trackableVersions: [definition('Mood', 'single_choice')],
      trackableOptions: [option('Mood', 1, 'a', 'Alpha'), option('Mood', 1, 'b', 'Beta'), option('Mood', 1, 'c', 'Gamma')],
      logRecords: [record('r', '2026-10-02')], observations: [observation('o', 'r', 'Mood', choice())], observationSelections: [selection('o', 'a')],
    })
    const compact = generateFeatureFrame(data, request('2026-10-03', { policy: { families: ['lag'], maximumCategoricalCardinality: 2 } }))
    expect(compact.catalog).toHaveLength(0)
    const capped = generateFeatureFrame(data, request('2026-10-03', { policy: { families: ['lag'], maximumFeatures: 2 } }))
    expect(capped.catalog).toHaveLength(2)
    expect(capped.omittedCandidateCount).toBe(4)
    const renamed = structuredClone(data)
    renamed.trackableVersions = [definition('Mood', 'single_choice', { name: 'Feeling' })]
    renamed.trackableOptions = [option('Mood', 1, 'a', 'Great'), ...data.trackableOptions.slice(1)]
    const later = generateFeatureFrame(renamed, request('2026-10-03', { policy: { families: ['lag'], maximumFeatures: 2 } }))
    expect(new Set(later.catalog.map((item) => item.key))).toEqual(new Set(capped.catalog.map((item) => item.key)))
    expect(featureCatalog(capped, ['lag'])).toHaveLength(2)
    let loads = 0
    const viaProvider = await generateFeatureFrameFromProvider({ loadTrendsData: async () => { loads++; return data } }, request('2026-10-03'))
    expect(loads).toBe(1)
    expect(viaProvider.catalog.length).toBe(6 + 7) // Six category lags plus seven calendar terms.
  })
})
