import { describe, expect, it } from 'vitest'
import type { TrendsData } from './AnalyticsProvider.ts'
import { analysisMappingOpportunitiesForTrackable, analysisMappingOpportunity, analysisSeriesOptions, buildAnalysisTrack, buildAnalysisView, expandMultiSelectPresence, measurementTypeForVersion, validateAnalysisMappingDefinition } from './analysisModel.ts'
import type { AnalysisValueMapping, LogRecord, Observation, Trackable, TrackableField, TrackableOption, TrackableVersion } from '../domain/models/index.ts'

const timestamp = '2026-08-01T12:00:00.000Z'
const sync = { createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
const trackable = (id: string, currentVersion = 1, extras: Partial<Trackable> = {}): Trackable => ({ ...sync, id, categoryId: 'category', active: true, archivedAt: null, currentVersion, tags: [], dataRole: 'measurement', ...extras })
const version = (trackableId: string, inputType: TrackableVersion['inputType'], extras: Partial<TrackableVersion> = {}): TrackableVersion => ({ ...sync, id: `${trackableId}:v${extras.version ?? 1}`, trackableId, version: 1, name: trackableId, inputType, valueDirection: 'neutral', configuration: {}, retiredAt: null, ...extras })
const record = (id: string, localDate: string, extras: Partial<LogRecord> = {}): LogRecord => ({ ...sync, id, recordKind: 'routine', localDate, startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'app', ...extras })
const observation = (id: string, logRecordId: string, trackableId: string, answer: Observation['answer'], trackableVersion = 1): Observation => ({ ...sync, id, logRecordId, trackableId, trackableVersion, answer })
const option = (trackableId: string, trackableVersion: number, optionId: string, label: string, sortOrder = 0): TrackableOption => ({ ...sync, id: `${trackableId}:${trackableVersion}:${optionId}`, trackableId, trackableVersion, optionId, storedValue: optionId, label, sortOrder, active: true })
const mapping = (trackableId: string, sourceTrackableVersion: number, targetTrackableVersion: number, valueMappings: AnalysisValueMapping['valueMappings'], extras: Partial<AnalysisValueMapping> = {}): AnalysisValueMapping => ({ ...sync, id: `map:${trackableId}:${sourceTrackableVersion}:${targetTrackableVersion}`, trackableId, sourceTrackableVersion, targetTrackableVersion, targetMeasurementType: 'nominal-single', valueMappings, ...extras })
const emptyData = (extras: Partial<TrendsData> = {}): TrendsData => ({ analysisMappings: [], categories: [], logRecords: [], observations: [], observationSelections: [], trackables: [], trackableOptions: [], trackableVersions: [], trackableFields: [], trackableDailyAssertions: [], ...extras })

describe('typed analysis model', () => {
  it.each([
    ['number', 'continuous'], ['scale', 'ordinal'], ['boolean', 'binary'], ['single_choice', 'nominal-single'], ['multi_select', 'nominal-multiselect'], ['duration', 'duration'], ['time', 'time'],
  ] as const)('classifies %s definitions as %s', (inputType, expected) => {
    expect(measurementTypeForVersion(version('metric', inputType))).toBe(expected)
  })

  it('supports explicit count and user-defined ordered-choice metadata without treating ordinary choices as ordered', () => {
    expect(measurementTypeForVersion(version('count', 'number', { configuration: { analysisMeasurementType: 'count' } }))).toBe('count')
    expect(measurementTypeForVersion(version('ordered', 'single_choice', { configuration: { analysisMeasurementType: 'ordinal', orderedOptionIds: ['low', 'high'] } }))).toBe('ordinal')
    expect(measurementTypeForVersion(version('nominal', 'single_choice'))).toBe('nominal-single')
  })

  it('classifies occurrence Trackables as events independently of their answer input', () => {
    expect(measurementTypeForVersion(version('event', 'boolean'), trackable('event', 1, { recordSemantics: 'occurrence' }))).toBe('event')
  })

  it('expands one multi-select observation into explicit option-presence features', () => {
    const data = emptyData({
      trackables: [trackable('color')], trackableVersions: [version('color', 'multi_select', { name: 'Color' })],
      trackableOptions: [option('color', 1, 'clear', 'Clear'), option('color', 1, 'white', 'White'), option('color', 1, 'brown', 'Brown')],
      logRecords: [record('day', '2026-08-10')], observations: [observation('answer', 'day', 'color', { state: 'answered', value: { kind: 'choice', value: null } })],
      observationSelections: [{ ...sync, id: 's1', observationId: 'answer', optionId: 'clear' }, { ...sync, id: 's2', observationId: 'answer', optionId: 'white' }],
    })
    const descriptor = analysisSeriesOptions(data)[0]
    const track = buildAnalysisTrack(data, descriptor, 'all', '2026-08-11')
    expect(track.values[0].display).toBe('Clear, White')
    expect(expandMultiSelectPresence(track)).toEqual([
      { optionId: 'brown', label: 'Brown', localDate: '2026-08-10', present: false },
      { optionId: 'clear', label: 'Clear', localDate: '2026-08-10', present: true },
      { optionId: 'white', label: 'White', localDate: '2026-08-10', present: true },
    ])
  })

  it('uses explicit multi-select option order only when the definition declares it', () => {
    const orderedVersion = version('color', 'multi_select', { configuration: { orderedOptionIds: ['white', 'brown', 'clear'] } })
    const orderedData = emptyData({
      trackables: [trackable('color')], trackableVersions: [orderedVersion],
      trackableOptions: [option('color', 1, 'clear', 'Clear'), option('color', 1, 'white', 'White'), option('color', 1, 'brown', 'Brown')],
      logRecords: [record('day', '2026-08-10')], observations: [observation('answer', 'day', 'color', { state: 'answered', value: { kind: 'choice', value: null } })],
      observationSelections: [{ ...sync, id: 's1', observationId: 'answer', optionId: 'white' }],
    })
    const track = buildAnalysisTrack(orderedData, analysisSeriesOptions(orderedData)[0], 'all', '2026-08-11')
    expect(track.lanes.map((lane) => lane.id)).toEqual(['white', 'brown', 'clear'])
  })

  it('offers a structured field independently with a clear parent label', () => {
    const field: TrackableField = { ...sync, id: 'procedure:type', ownerTrackableId: 'procedure', ownerTrackableVersion: 1, fieldTrackableId: 'procedure-type', fieldTrackableVersion: 1, sortOrder: 0, enabled: true, completionBehavior: 'optional' }
    const data = emptyData({
      trackables: [trackable('procedure', 1, { recordSemantics: 'occurrence' }), trackable('procedure-type')],
      trackableVersions: [version('procedure', 'boolean', { name: 'Procedure' }), version('procedure-type', 'single_choice', { name: 'Procedure Type' })], trackableFields: [field],
      logRecords: [record('event', '2026-08-10', { recordKind: 'quick_log', trackableId: 'procedure', trackableVersion: 1 })],
      observations: [observation('type', 'event', 'procedure-type', { state: 'answered', value: { kind: 'choice', value: null } })],
      trackableOptions: [option('procedure-type', 1, 'iud', 'IUD Replacement')], observationSelections: [{ ...sync, id: 'selection', observationId: 'type', optionId: 'iud' }],
    })
    expect(analysisSeriesOptions(data).map((item) => [item.name, item.measurementType])).toEqual([['Procedure', 'event'], ['Procedure → Procedure Type', 'nominal-single']])
  })

  it('uses the definition pinned to each observation for historical labels', () => {
    const data = emptyData({
      trackables: [trackable('severity', 2)], trackableVersions: [version('severity', 'single_choice', { name: 'Severity old' }), version('severity', 'single_choice', { id: 'severity:v2', version: 2, name: 'Severity' })],
      trackableOptions: [option('severity', 1, 'low', 'Low (old meaning)'), option('severity', 2, 'low', 'Mild')], logRecords: [record('day', '2026-08-10')],
      observations: [observation('answer', 'day', 'severity', { state: 'answered', value: { kind: 'choice', value: null } })], observationSelections: [{ ...sync, id: 'selection', observationId: 'answer', optionId: 'low' }],
    })
    const track = buildAnalysisTrack(data, analysisSeriesOptions(data)[0], 'all', '2026-08-11')
    expect(track.values[0]).toMatchObject({ display: 'Low (old meaning)', versionName: 'Severity old', version: 1 })
  })

  it('flags incompatible historical definitions instead of coercing them', () => {
    const data = emptyData({ trackables: [trackable('metric', 2)], trackableVersions: [version('metric', 'single_choice'), version('metric', 'number', { id: 'metric:v2', version: 2 })], logRecords: [record('old', '2026-08-10')], observations: [observation('old-answer', 'old', 'metric', { state: 'answered', value: { kind: 'choice', value: null } })] })
    const track = buildAnalysisTrack(data, analysisSeriesOptions(data)[0], 'all', '2026-08-11')
    expect(track.values).toEqual([])
    expect(track.warnings[0]?.code).toBe('incompatible-version')
  })

  it('overlays comparable numeric Trackables and stacks mixed measurement types', () => {
    const baseData = emptyData({
      trackables: [trackable('energy'), trackable('weight')], trackableVersions: [version('energy', 'number'), version('weight', 'number')],
      logRecords: [record('day', '2026-08-10')], observations: [observation('energy-a', 'day', 'energy', { state: 'answered', value: { kind: 'number', value: 4 } }), observation('weight-a', 'day', 'weight', { state: 'answered', value: { kind: 'number', value: 120 } })],
    })
    expect(buildAnalysisView(baseData, ['energy', 'weight'], 'all', '2026-08-11', 'normalize').layout).toBe('overlay')
    const mixed = { ...baseData, trackables: [...baseData.trackables, trackable('flag')], trackableVersions: [...baseData.trackableVersions, version('flag', 'boolean')], observations: [...baseData.observations, observation('flag-a', 'day', 'flag', { state: 'answered', value: { kind: 'boolean', value: true } })] }
    expect(buildAnalysisView(mixed, ['energy', 'flag'], 'all', '2026-08-11', 'raw').layout).toBe('stacked')
  })

  it('does not assign numeric values to nominal categories and adapts summary metrics', () => {
    const data = emptyData({ trackables: [trackable('state')], trackableVersions: [version('state', 'single_choice')], trackableOptions: [option('state', 1, 'red', 'Red')], logRecords: [record('day', '2026-08-10')], observations: [observation('answer', 'day', 'state', { state: 'answered', value: { kind: 'choice', value: null } })], observationSelections: [{ ...sync, id: 'selection', observationId: 'answer', optionId: 'red' }] })
    const track = buildAnalysisTrack(data, analysisSeriesOptions(data)[0], 'all', '2026-08-11')
    expect(track.values[0].numericValue).toBeUndefined()
    expect(track.summary.average).toBeUndefined()
    expect(track.summary.mostFrequent).toEqual([{ label: 'Red', count: 1 }])
  })

  it('maps pinned scale history into the current categorical representation without changing the raw observation', () => {
    const raw = observation('old-answer', 'old-day', 'volume', { state: 'answered', value: { kind: 'scale', value: 2 } }, 1)
    const before = structuredClone(raw)
    const data = emptyData({
      trackables: [trackable('volume', 2)],
      trackableVersions: [version('volume', 'scale', { name: 'Volume old', scaleMin: 1, scaleMax: 5 }), version('volume', 'single_choice', { id: 'volume:v2', version: 2, name: 'Volume' })],
      trackableOptions: [option('volume', 2, 'low', 'Low'), option('volume', 2, 'mild', 'Mild')],
      logRecords: [record('old-day', '2026-08-10')], observations: [raw],
      analysisMappings: [mapping('volume', 1, 2, [{ sourceValue: 'number:2', mappedValue: 'option:mild', label: 'Mild' }])],
    })
    const track = buildAnalysisTrack(data, analysisSeriesOptions(data)[0], 'all', '2026-08-11')
    expect(track.values[0]).toMatchObject({ display: 'Mild', rawDisplay: '2', version: 1, sourceValue: 'number:2', userMapped: true })
    expect(raw).toEqual(before)
  })

  it('merges multiple historical categories into one canonical category', () => {
    const data = emptyData({
      trackables: [trackable('flow', 2)],
      trackableVersions: [version('flow', 'single_choice', { name: 'Flow old' }), version('flow', 'single_choice', { id: 'flow:v2', version: 2, name: 'Flow' })],
      trackableOptions: [option('flow', 1, 'spotting', 'Spotting'), option('flow', 1, 'light-flow', 'Light flow'), option('flow', 2, 'light', 'Light')],
      logRecords: [record('day-1', '2026-08-09'), record('day-2', '2026-08-10')],
      observations: [observation('spotting-answer', 'day-1', 'flow', { state: 'answered', value: { kind: 'choice', value: null } }), observation('light-answer', 'day-2', 'flow', { state: 'answered', value: { kind: 'choice', value: null } })],
      observationSelections: [{ ...sync, id: 'spotting-selection', observationId: 'spotting-answer', optionId: 'spotting' }, { ...sync, id: 'light-selection', observationId: 'light-answer', optionId: 'light-flow' }],
      analysisMappings: [mapping('flow', 1, 2, [{ sourceValue: 'option:spotting', mappedValue: 'option:light', label: 'Light' }, { sourceValue: 'option:light-flow', mappedValue: 'option:light', label: 'Light' }])],
    })
    const track = buildAnalysisTrack(data, analysisSeriesOptions(data)[0], 'all', '2026-08-11')
    expect(track.values.map((value) => value.display)).toEqual(['Light', 'Light'])
    expect(track.summary.mostFrequent).toEqual([{ label: 'Light', count: 2 }])
  })

  it('uses explicit canonical ordering for historical and current categorical values', () => {
    const ordered = mapping('severity', 1, 2, [{ sourceValue: 'number:1', mappedValue: 'option:low', label: 'Low' }], { targetMeasurementType: 'ordinal', ordinalOrder: ['option:low', 'option:high'] })
    const data = emptyData({
      trackables: [trackable('severity', 2)],
      trackableVersions: [version('severity', 'scale', { scaleMin: 1, scaleMax: 2 }), version('severity', 'single_choice', { id: 'severity:v2', version: 2 })],
      trackableOptions: [option('severity', 2, 'low', 'Low'), option('severity', 2, 'high', 'High')],
      logRecords: [record('old', '2026-08-09'), record('current', '2026-08-10')],
      observations: [observation('old-answer', 'old', 'severity', { state: 'answered', value: { kind: 'scale', value: 1 } }), observation('current-answer', 'current', 'severity', { state: 'answered', value: { kind: 'choice', value: null } }, 2)],
      observationSelections: [{ ...sync, id: 'current-selection', observationId: 'current-answer', optionId: 'high' }], analysisMappings: [ordered],
    })
    const track = buildAnalysisTrack(data, analysisSeriesOptions(data)[0], 'all', '2026-08-11')
    expect(track.descriptor.measurementType).toBe('ordinal')
    expect(track.values.map((value) => [value.display, value.numericValue])).toEqual([['Low', 0], ['High', 1]])
  })

  it('reports partial mapping coverage and leaves unmapped values out of canonical analysis', () => {
    const data = emptyData({
      trackables: [trackable('volume', 2)], trackableVersions: [version('volume', 'scale', { scaleMin: 1, scaleMax: 2 }), version('volume', 'single_choice', { id: 'volume:v2', version: 2 })],
      trackableOptions: [option('volume', 2, 'low', 'Low')], logRecords: [record('one', '2026-08-09'), record('two', '2026-08-10')],
      observations: [observation('one-answer', 'one', 'volume', { state: 'answered', value: { kind: 'scale', value: 1 } }), observation('two-answer', 'two', 'volume', { state: 'answered', value: { kind: 'scale', value: 2 } })],
      analysisMappings: [mapping('volume', 1, 2, [{ sourceValue: 'number:1', mappedValue: 'option:low', label: 'Low' }])],
    })
    const descriptor = analysisSeriesOptions(data)[0]
    const opportunity = analysisMappingOpportunity(data, descriptor, 1)!
    const track = buildAnalysisTrack(data, descriptor, 'all', '2026-08-11')
    expect(opportunity.coverage).toEqual({ mapped: 1, total: 2, percent: 50 })
    expect(track.compatibilityStatus).toBe('partially-mapped')
    expect(track.values.map((value) => value.display)).toEqual(['Low'])
    expect(track.warnings.some((warning) => warning.code === 'unmapped-value')).toBe(true)
  })

  it('marks a removed recorded category unresolved until the user maps it', () => {
    const data = emptyData({
      trackables: [trackable('state', 2)],
      trackableVersions: [version('state', 'single_choice'), version('state', 'single_choice', { id: 'state:v2', version: 2 })],
      trackableOptions: [option('state', 1, 'keep', 'Keep'), option('state', 1, 'removed', 'Removed'), option('state', 2, 'keep', 'Keep')],
      logRecords: [record('old', '2026-08-10')], observations: [observation('old-answer', 'old', 'state', { state: 'answered', value: { kind: 'choice', value: null } })],
      observationSelections: [{ ...sync, id: 'old-selection', observationId: 'old-answer', optionId: 'removed' }],
    })
    const opportunity = analysisMappingOpportunity(data, analysisSeriesOptions(data)[0], 1)
    expect(opportunity?.status).toBe('unmapped-historical')
    expect(opportunity?.coverage).toEqual({ mapped: 0, total: 1, percent: 0 })
  })

  it('still excludes an out-of-range historical ordinal scale value without a mapping', () => {
    const data = emptyData({ trackables: [trackable('severity', 2)], trackableVersions: [version('severity', 'scale', { scaleMin: 1, scaleMax: 5 }), version('severity', 'scale', { id: 'severity:v2', version: 2, scaleMin: 4, scaleMax: 10 })],
      logRecords: [record('old', '2026-08-10')], observations: [observation('old-answer', 'old', 'severity', { state: 'answered', value: { kind: 'scale', value: 2 } })],
    })
    const result = buildAnalysisTrack(data, analysisSeriesOptions(data)[0], 'all', '2026-08-11')
    expect(result.compatibilityStatus).toBe('unmapped-historical')
    expect(result.values).toEqual([])
    expect(result.warnings).toMatchObject([{ code: 'unmapped-value', count: 1 }])
  })

  it('keys mappings to the source version and restores raw version-aware behavior after deletion', () => {
    const active = mapping('volume', 1, 3, [{ sourceValue: 'number:1', mappedValue: 'option:low', label: 'Low' }])
    const data = emptyData({
      trackables: [trackable('volume', 3)], trackableVersions: [version('volume', 'scale', { scaleMin: 1, scaleMax: 1 }), version('volume', 'scale', { id: 'volume:v2', version: 2, scaleMin: 1, scaleMax: 1 }), version('volume', 'single_choice', { id: 'volume:v3', version: 3 })],
      trackableOptions: [option('volume', 3, 'low', 'Low')], logRecords: [record('v1', '2026-08-09'), record('v2', '2026-08-10')],
      observations: [observation('v1-answer', 'v1', 'volume', { state: 'answered', value: { kind: 'scale', value: 1 } }, 1), observation('v2-answer', 'v2', 'volume', { state: 'answered', value: { kind: 'scale', value: 1 } }, 2)], analysisMappings: [active],
    })
    const descriptor = analysisSeriesOptions(data)[0]
    expect(buildAnalysisTrack(data, descriptor, 'all', '2026-08-11').values.map((value) => value.id)).toEqual(['v1-answer'])
    const deleted = { ...active, deletedAt: timestamp }
    expect(buildAnalysisTrack({ ...data, analysisMappings: [deleted] }, descriptor, 'all', '2026-08-11').values).toEqual([])
  })

  it('finds every independently mappable historical transition for one Trackable', () => {
    const data = emptyData({
      trackables: [trackable('severity', 3)],
      trackableVersions: [
        version('severity', 'scale'),
        version('severity', 'single_choice', { id: 'severity:v2', version: 2 }),
        version('severity', 'single_choice', { id: 'severity:v3', version: 3 }),
      ],
      trackableOptions: [option('severity', 2, 'mild', 'Mild'), option('severity', 3, 'low', 'Low'), option('severity', 3, 'high', 'High')],
      logRecords: [record('old-1', '2026-08-08'), record('old-2', '2026-08-09')],
      observations: [
        observation('answer-1', 'old-1', 'severity', { state: 'answered', value: { kind: 'scale', value: 2 } }, 1),
        observation('answer-2', 'old-2', 'severity', { state: 'answered', value: { kind: 'choice', value: null } }, 2),
      ],
      observationSelections: [{ ...sync, id: 'selection-2', observationId: 'answer-2', optionId: 'mild' }],
    })
    expect(analysisMappingOpportunitiesForTrackable(data, 'severity').map((item) => item.sourceVersion)).toEqual([1, 2])
  })

  it('rejects unsafe multi-select, duration, and nominal-to-continuous mappings', () => {
    const unsafe = emptyData({ trackables: [trackable('metric', 2)], trackableVersions: [version('metric', 'multi_select'), version('metric', 'single_choice', { id: 'metric:v2', version: 2 })], trackableOptions: [option('metric', 2, 'target', 'Target')] })
    expect(validateAnalysisMappingDefinition(unsafe, mapping('metric', 1, 2, []))).toMatch(/cannot be safely mapped/)
    const continuousTarget = emptyData({ trackables: [trackable('metric', 2)], trackableVersions: [version('metric', 'single_choice'), version('metric', 'number', { id: 'metric:v2', version: 2 })] })
    expect(validateAnalysisMappingDefinition(continuousTarget, mapping('metric', 1, 2, []))).toMatch(/not categorical/)
  })
})
