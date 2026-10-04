import { describe, expect, it } from 'vitest'
import type { TrendsData } from '../AnalyticsProvider.ts'
import type { AnalysisValueMapping, LogRecord, Observation, ObservationOptionSelection, Trackable, TrackableDailyAssertion, TrackableField, TrackableOption, TrackableVersion } from '../../domain/models/index.ts'
import { discoverRelationships, filterRelationshipCandidates, formatRelationshipDiagnostics } from './relationshipDiscovery.ts'
import type { RelationshipRequest } from './relationshipTypes.ts'

const stamp = '2025-01-01T00:00:00.000Z'
const sync = { createdAt: stamp, updatedAt: stamp, deletedAt: null, revision: 1 }
const day = (index: number): string => new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
const trackable = (id: string, occurrence = false, currentVersion = 1): Trackable => ({ ...sync, id, categoryId: 'general', active: true, archivedAt: null, currentVersion, tags: [], dataRole: 'measurement', recordSemantics: occurrence ? 'occurrence' : 'daily_value' })
const version = (id: string, inputType: TrackableVersion['inputType'], versionNumber = 1, configuration: TrackableVersion['configuration'] = {}): TrackableVersion => ({ ...sync, id: `${id}:v${versionNumber}`, trackableId: id, version: versionNumber, name: id, inputType, valueDirection: 'neutral', configuration, retiredAt: null })
const option = (id: string, versionNumber: number, optionId: string): TrackableOption => ({ ...sync, id: `${id}:${versionNumber}:${optionId}`, trackableId: id, trackableVersion: versionNumber, optionId, storedValue: optionId, label: optionId, sortOrder: 0, active: true })
const record = (index: number, owner?: string): LogRecord => ({ ...sync, id: `${owner ?? 'day'}:${index}`, recordKind: owner ? 'quick_log' : 'routine', ...(owner ? { trackableId: owner, trackableVersion: 1 } : {}), localDate: day(index), startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'app' })
const observation = (index: number, id: string, answer: Observation['answer'], owner?: string, trackableVersion = 1): Observation => ({ ...sync, id: `${id}:${index}`, logRecordId: `${owner ?? 'day'}:${index}`, trackableId: id, trackableVersion, answer })
const selection = (observationId: string, optionId: string): ObservationOptionSelection => ({ ...sync, id: `${observationId}:${optionId}`, observationId, optionId })
const number = (value: number): Observation['answer'] => ({ state: 'answered', value: { kind: 'number', value } })
const boolean = (value: boolean): Observation['answer'] => ({ state: 'answered', value: { kind: 'boolean', value } })
const choice = (): Observation['answer'] => ({ state: 'answered', value: { kind: 'choice', value: null } })
const empty = (): TrendsData => ({ analysisMappings: [], categories: [], logRecords: [], observations: [], observationSelections: [], trackables: [], trackableOptions: [], trackableVersions: [], trackableFields: [], trackableDailyAssertions: [] })
const request = (targetDescriptorId = 'target', extras: Partial<RelationshipRequest> = {}): RelationshipRequest => ({ targetDescriptorId, startDate: day(0), endDate: day(99), asOfDate: day(99), featureFamilies: ['lag'], policy: { lagDays: [1, 2, 3, 7], categoricalLagDays: [1, 2] }, ...extras })
const signal = (index: number): number => Math.sin(index * 1.7) * 4 + Math.cos(index * .29) * 2

function numericData(outcome: (index: number) => number, count = 100): TrendsData {
  const data = empty()
  data.trackables = [trackable('source'), trackable('target')]
  data.trackableVersions = [version('source', 'number'), version('target', 'number')]
  data.logRecords = Array.from({ length: count }, (_, index) => record(index))
  data.observations = Array.from({ length: count }, (_, index) => [observation(index, 'source', number(signal(index))), observation(index, 'target', number(outcome(index)))]).flat()
  return data
}

describe('target-scoped relationship discovery', () => {
  it('finds positive and negative lagged numeric signals and rejects an unrelated signal', () => {
    for (const direction of [1, -1]) {
      const data = numericData((index) => 20 + direction * 3 * signal(index - 1))
      const catalog = discoverRelationships(data, request())
      const oneDay = catalog.ranked.find((item) => item.predictor.source?.trackableId === 'source' && item.predictor.transformation.kind === 'lag' && item.predictor.transformation.days === 1)
      expect(oneDay?.effectDirection).toBe(direction > 0 ? 'positive' : 'negative')
      expect(oneDay?.improvement).toBeGreaterThan(.2)
      expect(oneDay?.folds.length).toBeGreaterThanOrEqual(3)
      expect(oneDay?.support.firstDate).toBe(day(1))
      expect(filterRelationshipCandidates(catalog, 'moderate').length).toBeGreaterThan(0)
      expect(formatRelationshipDiagnostics(oneDay!)).toContain('fold ')
    }
    const unrelated = discoverRelationships(numericData((index) => Math.sin(index * .43) * 3), request())
    const unrelatedLag = unrelated.candidates.find((item) => item.predictor.source?.trackableId === 'source' && item.predictor.transformation.kind === 'lag' && item.predictor.transformation.days === 1)
    expect(unrelatedLag?.status).toBe('screened_out')
  })

  it('screens binary outcomes and nominal or multi-select predictor indicators without scalar category encodings', () => {
    const data = empty()
    data.trackables = [trackable('category'), trackable('multi'), trackable('target')]
    data.trackableVersions = [version('category', 'single_choice'), version('multi', 'multi_select'), version('target', 'boolean')]
    data.trackableOptions = [option('category', 1, 'high'), option('category', 1, 'low'), option('multi', 1, 'jaw'), option('multi', 1, 'chin')]
    data.logRecords = Array.from({ length: 100 }, (_, index) => record(index))
    data.observations = Array.from({ length: 100 }, (_, index) => [observation(index, 'category', choice()), observation(index, 'multi', choice()), observation(index, 'target', boolean(index > 0 && signal(index - 1) > 0))]).flat()
    data.observationSelections = Array.from({ length: 100 }, (_, index) => [selection(`category:${index}`, signal(index) > 0 ? 'high' : 'low'), selection(`multi:${index}`, signal(index) > 0 ? 'jaw' : 'chin')]).flat()
    const catalog = discoverRelationships(data, request())
    expect(catalog.ranked.some((item) => item.predictor.transformation.kind === 'lag' && item.predictor.transformation.optionId === 'high' && item.primaryMetric === 'brier')).toBe(true)
    expect(catalog.ranked.some((item) => item.predictor.transformation.kind === 'lag' && item.predictor.transformation.optionId === 'jaw')).toBe(true)
    expect(catalog.candidates.every((item) => item.predictor.valueType !== 'number' || item.predictor.transformation.kind !== 'lag' || item.predictor.source?.trackableId !== 'category')).toBe(true)
  })

  it('treats each multi-select target option as its own binary outcome and supports ordinal ranks', () => {
    const data = empty()
    data.trackables = [trackable('source'), trackable('target')]
    data.trackableVersions = [version('source', 'single_choice', 1, { analysisMeasurementType: 'ordinal', orderedOptionIds: ['low', 'high'] }), version('target', 'multi_select')]
    data.trackableOptions = [option('source', 1, 'low'), option('source', 1, 'high'), option('target', 1, 'jaw'), option('target', 1, 'chin')]
    data.logRecords = Array.from({ length: 100 }, (_, index) => record(index))
    data.observations = Array.from({ length: 100 }, (_, index) => [observation(index, 'source', choice()), observation(index, 'target', choice())]).flat()
    data.observationSelections = Array.from({ length: 100 }, (_, index) => [selection(`source:${index}`, signal(index) > 0 ? 'high' : 'low'), selection(`target:${index}`, signal(index - 1) > 0 ? 'jaw' : 'chin')]).flat()
    const catalog = discoverRelationships(data, request())
    expect(catalog.diagnostics.targetOutcomeCount).toBe(2)
    expect(new Set(catalog.candidates.map((item) => item.target.optionId))).toEqual(new Set(['jaw', 'chin']))
    expect(catalog.ranked.some((item) => item.predictor.valueType === 'ordinal-rank' && item.target.optionId === 'jaw')).toBe(true)
  })

  it('preserves mapping provenance, excludes an intentionally unmapped historical answer, and does not mutate input', () => {
    const data = numericData((index) => 10 + signal(index - 1))
    data.trackables = [trackable('source', false, 2), trackable('target')]
    data.trackableVersions = [version('source', 'scale'), version('source', 'single_choice', 2, { analysisMeasurementType: 'ordinal', orderedOptionIds: ['low', 'high'] }), version('target', 'number')]
    data.trackableOptions = [option('source', 2, 'low'), option('source', 2, 'high')]
    data.observations = data.observations.map((item) => item.trackableId === 'source' ? { ...item, answer: { state: 'answered', value: { kind: 'scale', value: item.id === 'source:5' ? 3 : Number(Number(item.id.slice(7)) % 2 === 0) + 1 } } } : item)
    const mapping: AnalysisValueMapping = { ...sync, id: 'map:source', trackableId: 'source', sourceTrackableVersion: 1, targetTrackableVersion: 2, targetMeasurementType: 'ordinal', ordinalOrder: ['option:low', 'option:high'], valueMappings: [{ sourceValue: 'number:1', mappedValue: 'option:low', label: 'low' }, { sourceValue: 'number:2', mappedValue: 'option:high', label: 'high' }] }
    data.analysisMappings = [mapping]
    const original = structuredClone(data)
    const catalog = discoverRelationships(data, request())
    const candidate = catalog.candidates.find((item) => item.predictor.source?.trackableId === 'source' && item.predictor.transformation.kind === 'lag' && item.predictor.transformation.days === 1)!
    expect(candidate.support.mappedHistoricalValues).toBe(true)
    expect(candidate.support.sampleSize).toBeLessThan(99)
    expect(data).toEqual(original)
  })

  it('keeps mapped historical and current nominal target options in the same one-versus-rest outcome', () => {
    const data = numericData((index) => signal(index - 1))
    data.trackables = [trackable('source'), trackable('target', false, 2)]
    data.trackableVersions = [version('source', 'number'), version('target', 'scale'), version('target', 'single_choice', 2)]
    data.trackableOptions = [option('target', 2, 'low'), option('target', 2, 'high')]
    data.observations = data.observations.map((item) => item.trackableId === 'target' ? Number(item.id.slice(7)) < 50 ? { ...item, answer: { state: 'answered', value: { kind: 'scale', value: signal(Number(item.id.slice(7)) - 1) > 0 ? 2 : 1 } } } : { ...item, trackableVersion: 2, answer: choice() } : item)
    data.observationSelections = Array.from({ length: 50 }, (_, offset) => selection(`target:${offset + 50}`, signal(offset + 49) > 0 ? 'high' : 'low'))
    data.analysisMappings = [{ ...sync, id: 'target-map', trackableId: 'target', sourceTrackableVersion: 1, targetTrackableVersion: 2, targetMeasurementType: 'nominal-single', valueMappings: [{ sourceValue: 'number:1', mappedValue: 'option:low', label: 'low' }, { sourceValue: 'number:2', mappedValue: 'option:high', label: 'high' }] }]
    const catalog = discoverRelationships(data, request())
    expect(catalog.diagnostics.targetOutcomeCount).toBe(2)
    const high = catalog.candidates.find((item) => item.target.optionId === 'high' && item.predictor.source?.trackableId === 'source' && item.predictor.transformation.kind === 'lag' && item.predictor.transformation.days === 1)!
    expect(high.support.sampleSize).toBe(99)
    expect(high.support.mappedHistoricalValues).toBe(true)
    expect(high.target.optionId).toBe('high')
  })

  it('screens an ordinal target with explicit order and rank-aware features', () => {
    const data = numericData((index) => signal(index - 1))
    data.trackableVersions = [version('source', 'number'), version('target', 'single_choice', 1, { analysisMeasurementType: 'ordinal', orderedOptionIds: ['low', 'high'] })]
    data.trackableOptions = [option('target', 1, 'low'), option('target', 1, 'high')]
    data.observations = data.observations.map((item) => item.trackableId === 'target' ? { ...item, answer: choice() } : item)
    data.observationSelections = Array.from({ length: 100 }, (_, index) => selection(`target:${index}`, signal(index - 1) > 0 ? 'high' : 'low'))
    const catalog = discoverRelationships(data, request())
    expect(catalog.diagnostics.targetOutcomeCount).toBe(1)
    expect(catalog.candidates.every((item) => item.target.kind === 'ordinal' && item.primaryMetric === 'ordinal-brier')).toBe(true)
    expect(catalog.ranked.some((item) => item.predictor.source?.trackableId === 'source')).toBe(true)
  })

  it('uses explicit occurrence No as a binary target and leaves an unlogged day missing', () => {
    const data = numericData(() => 0)
    data.trackables = [trackable('source'), trackable('target', true)]
    data.trackableVersions = [version('source', 'number'), version('target', 'boolean')]
    data.observations = data.observations.filter((item) => item.trackableId === 'source')
    const yesDays = Array.from({ length: 100 }, (_, index) => index).filter((index) => signal(index - 1) > 0)
    data.logRecords = [...data.logRecords, ...yesDays.map((index) => record(index, 'target'))]
    data.trackableDailyAssertions = Array.from({ length: 100 }, (_, index) => index).filter((index) => !yesDays.includes(index) && index !== 10)
      .map((index): TrackableDailyAssertion => ({ ...sync, id: `no:${index}`, date: day(index), trackableId: 'target', status: 'did_not_occur', recordedAt: stamp }))
    const catalog = discoverRelationships(data, request())
    const lag = catalog.candidates.find((item) => item.predictor.source?.trackableId === 'source' && item.predictor.transformation.kind === 'lag' && item.predictor.transformation.days === 1)!
    expect(lag.target.measurementType).toBe('event')
    expect(lag.support.sampleSize).toBe(98)
    expect(lag.primaryMetric).toBe('brier')
  })

  it('records sparse event support and suppresses nearly identical validated variants without deleting diagnostics', () => {
    const data = numericData((index) => 20 + 3 * signal(index - 1))
    data.trackables = [...data.trackables, trackable('event', true)]
    data.trackableVersions = [...data.trackableVersions, version('event', 'boolean')]
    data.logRecords = [...data.logRecords, record(40, 'event')]
    data.trackableDailyAssertions = [{ ...sync, id: 'event-no', date: day(41), trackableId: 'event', status: 'did_not_occur', recordedAt: stamp }]
    const catalog = discoverRelationships(data, request('target', { featureFamilies: ['lag', 'event'] }))
    expect(catalog.candidates.filter((item) => item.predictor.family === 'event').every((item) => item.reason === 'sparse-event' || item.reason === 'insufficient-history')).toBe(true)
    expect(catalog.candidates.some((item) => item.predictor.family === 'event' && item.support.eventCount === 1)).toBe(true)
    const occurred = catalog.candidates.find((item) => item.predictor.transformation.kind === 'event' && item.predictor.transformation.statistic === 'occurred-today')!
    expect(occurred.support.predictorStatusCounts['explicit-no']).toBe(1)
    expect(occurred.support.predictorStatusCounts['no-recorded-event']).toBeGreaterThan(0)
    const repeated = numericData((index) => index % 2 ? 5 : 15)
    repeated.observations = repeated.observations.map((item) => item.trackableId === 'source' ? { ...item, answer: number(Number(item.id.slice(7)) % 2 ? 1 : -1) } : item)
    const duplicated = discoverRelationships(repeated, request('target', { featureFamilies: ['lag'], policy: { lagDays: [1, 2] }, relationshipPolicy: { redundancyCorrelation: .95 } }))
    expect(duplicated.candidates.some((item) => item.reason === 'redundant' && item.suppressedBy)).toBe(true)
    expect(duplicated.ranked.every((item) => item.status !== 'screened_out')).toBe(true)
  })

  it('keeps change-point and current-regime support target-specific', () => {
    const data = numericData((index) => (index < 50 ? 10 : 30) + signal(index - 1))
    data.trackables = [...data.trackables, trackable('procedure', true)]
    data.trackableVersions = [...data.trackableVersions, version('procedure', 'boolean')]
    data.logRecords = [...data.logRecords, record(49, 'procedure')]
    const catalog = discoverRelationships(data, request('target', { evaluateCurrentRegime: true }))
    expect(catalog.changePoints.length).toBeGreaterThan(0)
    expect(catalog.changePoints.some((item) => item.nearbyEvents.some((event) => event.eventRecordId === 'procedure:49' && event.relation === 'nearby-in-time'))).toBe(true)
    expect((catalog.regimes['target/'].at(-1)?.startDate ?? '') > day(0)).toBe(true)
    expect(catalog.candidates.some((item) => item.currentRegimeSupport && item.currentRegimeSupport.sampleSize < item.support.sampleSize)).toBe(true)
  })

  it('screens rolling windows as distinct features and finds repeated event-window and days-since patterns', () => {
    const length = 120
    const eventDays = [5, 25, 45, 65, 85, 105]
    const data = numericData((index) => {
      const latest = eventDays.filter((event) => event <= index).at(-1)
      return latest !== undefined && index - latest < 5 ? 8 : 1
    }, length)
    data.trackables = [...data.trackables, trackable('procedure', true)]
    data.trackableVersions = [...data.trackableVersions, version('procedure', 'boolean')]
    data.logRecords = [...data.logRecords, ...eventDays.map((index) => record(index, 'procedure'))]
    const catalog = discoverRelationships(data, request('target', { endDate: day(length - 1), asOfDate: day(length - 1), featureFamilies: ['event'], sourceTrackableIds: ['procedure'] }))
    expect(catalog.candidates.some((item) => item.predictor.transformation.kind === 'event' && item.predictor.transformation.statistic === 'post-window' && item.support.eventCount === 6 && item.support.eventEpisodes === 6)).toBe(true)
    expect(catalog.ranked.some((item) => item.predictor.transformation.kind === 'event' && item.predictor.transformation.statistic === 'post-window' && item.effectDirection === 'positive')).toBe(true)
    expect(catalog.candidates.some((item) => item.predictor.transformation.kind === 'event' && item.predictor.transformation.statistic === 'days-since' && item.effectDirection === 'negative')).toBe(true)
    const rolling = numericData((index) => 10 + Array.from({ length: 7 }, (_, offset) => signal(index - offset)).reduce((sum, value) => sum + value, 0) / 7)
    const windows = discoverRelationships(rolling, request('target', { featureFamilies: ['rolling'], policy: { rollingDays: [3, 7, 14] } }))
    expect(windows.candidates.some((item) => item.predictor.transformation.kind === 'rolling' && item.predictor.transformation.days === 7 && item.predictor.source?.trackableId === 'source')).toBe(true)
    expect(windows.ranked.some((item) => item.predictor.transformation.kind === 'rolling' && item.predictor.source?.trackableId === 'source' && item.effectDirection === 'positive')).toBe(true)
  })

  it('supports structured event predicates and retains distinct event episodes', () => {
    const eventDays = Array.from({ length: 12 }, (_, index) => 5 + 10 * index)
    const selectedDays = eventDays.filter((_, index) => index % 2 === 0)
    const data = numericData((index) => selectedDays.some((event) => index >= event && index - event < 4) ? 8 : 1, 125)
    data.trackables = [...data.trackables, trackable('procedure', true), trackable('procedure-type')]
    data.trackableVersions = [...data.trackableVersions, version('procedure', 'boolean'), version('procedure-type', 'single_choice')]
    data.trackableOptions = [option('procedure-type', 1, 'a'), option('procedure-type', 1, 'b')]
    const field: TrackableField = { ...sync, id: 'procedure-field', ownerTrackableId: 'procedure', ownerTrackableVersion: 1, fieldTrackableId: 'procedure-type', fieldTrackableVersion: 1, sortOrder: 0, enabled: true, completionBehavior: 'optional' }
    data.trackableFields = [field]
    data.logRecords = [...data.logRecords, ...eventDays.map((index) => record(index, 'procedure'))]
    data.observations = [...data.observations, ...eventDays.map((index) => observation(index, 'procedure-type', choice(), 'procedure'))]
    data.observationSelections = eventDays.map((index, position) => selection(`procedure-type:${index}`, position % 2 ? 'b' : 'a'))
    const catalog = discoverRelationships(data, request('target', { endDate: day(124), asOfDate: day(124), featureFamilies: ['event'], sourceTrackableIds: ['procedure'] }))
    const specific = catalog.candidates.filter((item) => item.predictor.transformation.kind === 'event' && item.predictor.transformation.predicate.optionId === 'a')
    expect(specific.some((item) => item.support.eventCount === 6 && item.support.eventEpisodes === 6)).toBe(true)
    expect(specific.some((item) => item.predictor.transformation.kind === 'event' && item.predictor.transformation.statistic === 'post-window' && item.effectDirection === 'positive')).toBe(true)
  })

  it('links a nearby structured occurrence to a target shift even when event features are not requested', () => {
    const data = numericData((index) => index < 50 ? 2 : 12)
    data.trackables = [...data.trackables, trackable('procedure', true), trackable('procedure-type')]
    data.trackableVersions = [...data.trackableVersions, version('procedure', 'boolean'), version('procedure-type', 'single_choice')]
    data.trackableOptions = [option('procedure-type', 1, 'replacement')]
    data.trackableFields = [{ ...sync, id: 'procedure-field', ownerTrackableId: 'procedure', ownerTrackableVersion: 1, fieldTrackableId: 'procedure-type', fieldTrackableVersion: 1, sortOrder: 0, enabled: true, completionBehavior: 'optional' }]
    data.logRecords = [...data.logRecords, record(49, 'procedure')]
    data.observations = [...data.observations, observation(49, 'procedure-type', choice(), 'procedure')]
    data.observationSelections = [selection('procedure-type:49', 'replacement')]
    const catalog = discoverRelationships(data, request('target', { featureFamilies: ['lag'] }))
    expect(catalog.changePoints.some((point) => point.nearbyEvents.some((event) => event.predicate?.optionId === 'replacement' && event.relation === 'nearby-in-time'))).toBe(true)
  })

  it('records minimum-fold and unstable-pattern screening instead of reporting a strong relationship', () => {
    const short = discoverRelationships(numericData((index) => signal(index - 1), 32), request('target', { endDate: day(31), asOfDate: day(31) }))
    const shortLag = short.candidates.find((item) => item.predictor.source?.trackableId === 'source' && item.predictor.transformation.kind === 'lag' && item.predictor.transformation.days === 1)
    expect(shortLag?.reason).toBe('insufficient-folds')
    const reversing = discoverRelationships(numericData((index) => (index < 50 ? 1 : -1) * signal(index - 1)), request())
    const reversedLag = reversing.candidates.find((item) => item.predictor.source?.trackableId === 'source' && item.predictor.transformation.kind === 'lag' && item.predictor.transformation.days === 1)
    expect(reversedLag?.status).toBe('screened_out')
    expect(reversedLag?.strength).toBe('insufficient')
  })

  it('keeps future observations out and honors strict per-row availability for a late backfill', () => {
    const data = numericData((index) => 10 + signal(index - 1))
    const original = discoverRelationships(data, request())
    data.logRecords = [...data.logRecords, record(120)]
    data.observations = [...data.observations, observation(120, 'source', number(999)), observation(120, 'target', number(999))]
    expect(discoverRelationships(data, request())).toEqual(original)
    const lateStamp = `${day(60)}T12:00:00.000Z`
    data.logRecords = data.logRecords.map((item) => item.id === 'day:40' ? { ...item, createdAt: lateStamp, updatedAt: lateStamp } : item)
    data.observations = data.observations.map((item) => item.id === 'source:40' || item.id === 'target:40' ? { ...item, createdAt: lateStamp, updatedAt: lateStamp } : item)
    const strict = discoverRelationships(data, request('target', { asOfTimestamp: `${day(99)}T23:59:59.999Z` }))
    const lag = strict.candidates.find((item) => item.predictor.source?.trackableId === 'source' && item.predictor.transformation.kind === 'lag' && item.predictor.transformation.days === 1)!
    expect(lag.alignedDates).not.toContain(day(40))
    expect(lag.alignedDates).not.toContain(day(41))
  })
})
