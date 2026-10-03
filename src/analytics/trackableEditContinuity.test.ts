import { describe, expect, it } from 'vitest'
import type { TrendsData } from './AnalyticsProvider.ts'
import { assessTrackableEditContinuity } from './trackableEditContinuity.ts'
import type { AnalysisValueMapping, LogRecord, Observation, Trackable, TrackableOption, TrackableVersion } from '../domain/models/index.ts'
import type { TrackableDetails, TrackableDraft } from '../domain/trackables/TrackableEngine.ts'

const timestamp = '2026-10-03T12:00:00.000Z'
const sync = { createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
const trackable: Trackable = { ...sync, id: 'severity', categoryId: 'category', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'symptom', recordSemantics: 'daily_value' }
const version: TrackableVersion = { ...sync, id: 'severity:v1', trackableId: 'severity', version: 1, name: 'Severity', inputType: 'scale', scaleMin: 1, scaleMax: 5, scaleStep: 1, valueDirection: 'worse', configuration: {}, retiredAt: null }
const record: LogRecord = { ...sync, id: 'day', recordKind: 'routine', localDate: '2026-10-02', startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'app' }
const observation: Observation = { ...sync, id: 'answer', logRecordId: 'day', trackableId: 'severity', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'scale', value: 3 } } }
const details: TrackableDetails = { trackable, version, options: [] }
const draft: TrackableDraft = { name: 'Severity', categoryId: 'category', inputType: 'scale', recordSemantics: 'daily_value', dataRole: 'symptom', valueDirection: 'worse', scaleMin: 1, scaleMax: 5, scaleStep: 1, tags: [] }
const data = (extras: Partial<TrendsData> = {}): TrendsData => ({ analysisMappings: [], categories: [], logRecords: [record], observations: [observation], observationSelections: [], trackables: [trackable], trackableOptions: [], trackableVersions: [version], trackableFields: [], trackableDailyAssertions: [], ...extras })

function choiceDetails(): TrackableDetails {
  const choiceVersion = { ...version, inputType: 'single_choice' as const, scaleMin: undefined, scaleMax: undefined, scaleStep: undefined }
  const options: readonly TrackableOption[] = ['low', 'high'].map((id, sortOrder) => ({ ...sync, id: `${id}:v1`, optionId: id, trackableId: 'severity', trackableVersion: 1, storedValue: id, label: id === 'low' ? 'Low' : 'High', sortOrder, active: true }))
  return { trackable, version: choiceVersion, options }
}

describe('Edit Trackable historical continuity assessment', () => {
  it('does not interrupt cosmetic or non-analysis edits', () => {
    expect(assessTrackableEditContinuity(details, { ...draft, name: 'Severity score', description: 'Updated copy', tags: ['health'] }, data())).toEqual({ kind: 'none' })
  })

  it('offers mapping for a changed scale definition with historical answers', () => {
    expect(assessTrackableEditContinuity(details, { ...draft, scaleMax: 10 }, data())).toMatchObject({ kind: 'mappable', sourceVersion: 1, targetVersion: 2, sourceType: 'ordinal', targetType: 'ordinal' })
  })

  it('offers mapping when a single-choice value is renamed or replaced', () => {
    const current = choiceDetails()
    const choiceObservation = { ...observation, answer: { state: 'answered' as const, value: { kind: 'choice' as const, value: null } } }
    const choiceData = data({ trackableVersions: [current.version], trackableOptions: current.options, observations: [choiceObservation] })
    const next: TrackableDraft = { ...draft, inputType: 'single_choice', scaleMin: undefined, scaleMax: undefined, scaleStep: undefined, options: [{ optionId: 'mild', label: 'Mild' }, { optionId: 'high', label: 'High' }] }
    expect(assessTrackableEditContinuity(current, next, choiceData).kind).toBe('mappable')
  })

  it('warns without inventing a mapping path for an unsupported change', () => {
    expect(assessTrackableEditContinuity(details, { ...draft, inputType: 'boolean', scaleMin: undefined, scaleMax: undefined, scaleStep: undefined }, data())).toMatchObject({ kind: 'unsupported', sourceType: 'ordinal', targetType: 'binary' })
  })

  it('does not prompt without relevant history or when the transition already has a mapping', () => {
    expect(assessTrackableEditContinuity(details, { ...draft, scaleMax: 10 }, data({ observations: [] }))).toEqual({ kind: 'none' })
    const existing: AnalysisValueMapping = { ...sync, id: 'analysis-mapping:severity:1:2', trackableId: 'severity', sourceTrackableVersion: 1, targetTrackableVersion: 2, targetMeasurementType: 'ordinal', ordinalOrder: ['number:1'], valueMappings: [] }
    expect(assessTrackableEditContinuity(details, { ...draft, scaleMax: 10 }, data({ analysisMappings: [existing] }))).toEqual({ kind: 'none' })
  })

  it('only considers the immediately previous version and never mutates raw observations', () => {
    const earlier = { ...observation, id: 'older-answer', trackableVersion: 0 }
    const source = data({ observations: [earlier] })
    const before = structuredClone(source.observations)
    expect(assessTrackableEditContinuity(details, { ...draft, scaleMax: 10 }, source)).toEqual({ kind: 'none' })
    expect(source.observations).toEqual(before)
  })
})
