import { describe, expect, it } from 'vitest'
import type { TrendsData } from './AnalyticsProvider.ts'
import { analysisMappingOpportunity, analysisSeriesOptions, buildAnalysisTrack, expandMultiSelectPresence } from './analysisModel.ts'
import { pivotRecordedValues } from './recordedValuesTable.ts'
import type { LogRecord, Observation, Trackable, TrackableOption, TrackableVersion } from '../domain/models/index.ts'

const timestamp = '2026-09-01T12:00:00.000Z'
const sync = { createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
const name = 'Acne Location'
type Choice = { id: string; label: string }

function fixture(historical: readonly Choice[], current: readonly Choice[], answers: readonly (readonly string[])[]): TrendsData {
  const trackable: Trackable = { ...sync, id: name, categoryId: 'skin', active: true, archivedAt: null, currentVersion: 3, tags: [], dataRole: 'measurement', recordSemantics: 'daily_value' }
  const version = (number: number): TrackableVersion => ({ ...sync, id: `acne:v${number}`, trackableId: name, version: number, name, inputType: 'multi_select', valueDirection: 'neutral', configuration: {}, retiredAt: null })
  const option = (choice: Choice, number: number, sortOrder: number): TrackableOption => ({ ...sync, id: `${choice.id}:v${number}`, optionId: choice.id, trackableId: name, trackableVersion: number, storedValue: choice.label.toLowerCase(), label: choice.label, sortOrder, active: true })
  const logRecords: LogRecord[] = answers.map((_, index) => ({ ...sync, id: `record-${index}`, recordKind: 'routine', localDate: `2026-10-${String(index + 1).padStart(2, '0')}`, startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'app' }))
  const observations: Observation[] = answers.map((_, index) => ({ ...sync, id: `answer-${index}`, logRecordId: `record-${index}`, trackableId: name, trackableVersion: 2, answer: { state: 'answered', value: { kind: 'choice', value: null } } }))
  return {
    analysisMappings: [], categories: [], trackables: [trackable], trackableVersions: [version(2), version(3)],
    trackableOptions: [...historical.map((choice, index) => option(choice, 2, index)), ...current.map((choice, index) => option(choice, 3, index))],
    logRecords, observations, observationSelections: answers.flatMap((selected, index) => selected.map((optionId) => ({ ...sync, id: `selection-${index}-${optionId}`, observationId: `answer-${index}`, optionId }))),
    trackableFields: [], trackableDailyAssertions: [],
  }
}

function track(data: TrendsData) { return buildAnalysisTrack(data, analysisSeriesOptions(data)[0], 'all', '2026-10-31') }

describe('historical multi-select continuity', () => {
  it('keeps 25 v2 combinations with unchanged option IDs and labels in Trends and Recorded Values', () => {
    const choices = ['Forehead', 'Chin', 'Temples', 'Jaw', 'Cheeks'].map((label) => ({ id: label.toLowerCase(), label }))
    const answers = Array.from({ length: 25 }, (_, index) => index % 2 ? ['forehead', 'chin', 'jaw'] : ['temples', 'cheeks'])
    const data = fixture(choices, [...choices].reverse(), answers)
    const original = structuredClone(data)
    const result = track(data)
    expect(result.compatibilityStatus).toBe('fully-compatible')
    expect(result.mappingOpportunities[0].status).toBe('fully-compatible')
    expect(result.warnings).toEqual([])
    expect(result.summary.recordedCount).toBe(25)
    expect(result.lanes.find((lane) => lane.id === 'forehead')).toMatchObject({ count: 12 })
    expect(result.lanes.find((lane) => lane.id === 'temples')).toMatchObject({ count: 13 })
    expect(pivotRecordedValues([result])).toHaveLength(25)
    expect(pivotRecordedValues([result])[0].valuesBySeriesId[name]).toBe('Temples, Cheeks')
    expect(data).toEqual(original)
  })

  it('matches each selected option by unique exact normalized label when version IDs changed, regardless of current order', () => {
    const data = fixture(
      [{ id: 'old-forehead', label: 'Forehead' }, { id: 'old-chin', label: 'Chin' }, { id: 'old-jaw', label: 'Jaw' }, { id: 'old-temples', label: 'Temples' }],
      [{ id: 'new-temples', label: 'Temples' }, { id: 'new-jaw', label: 'Jaw' }, { id: 'new-chin', label: 'CHIN' }, { id: 'new-forehead', label: ' Forehead ' }],
      [['old-forehead', 'old-chin', 'old-jaw'], ['old-temples']],
    )
    const result = track(data)
    expect(result.compatibilityStatus).toBe('fully-compatible')
    expect(result.warnings).toEqual([])
    expect(result.values[0].categories?.map((category) => category.id)).toEqual(['new-forehead', 'new-chin', 'new-jaw'])
    expect(result.lanes.find((lane) => lane.id === 'new-chin')?.count).toBe(1)
    expect(expandMultiSelectPresence(result).filter((item) => item.localDate === '2026-10-01' && ['new-chin', 'new-temples'].includes(item.optionId))).toEqual([
      { optionId: 'new-chin', label: 'CHIN', localDate: '2026-10-01', present: true },
      { optionId: 'new-temples', label: 'Temples', localDate: '2026-10-01', present: false },
    ])
  })

  it('reports only the genuinely removed option once, with its affected observation count', () => {
    const data = fixture(
      [{ id: 'forehead', label: 'Forehead' }, { id: 'temples', label: 'Temples' }, { id: 'chin', label: 'Chin' }],
      [{ id: 'chin', label: 'Chin' }, { id: 'forehead', label: 'Forehead' }],
      [...Array.from({ length: 25 }, () => ['forehead', 'temples']), ['forehead', 'chin']],
    )
    const opportunity = analysisMappingOpportunity(data, analysisSeriesOptions(data)[0], 2)!
    const result = track(data)
    expect(opportunity.status).toBe('unmapped-historical')
    expect(opportunity.coverage).toEqual({ mapped: 2, total: 3, percent: 67 })
    expect(result.summary.recordedCount).toBe(1)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({ code: 'unmapped-value', count: 25 })
    expect(result.warnings[0].message).toContain('Temples')
    expect(result.warnings[0].message).not.toContain('Forehead')
  })

  it('prefers stable IDs for a renamed option but does not guess when both ID and meaning changed', () => {
    const renamed = fixture([{ id: 'chin', label: 'Chin' }], [{ id: 'chin', label: 'Lower Chin' }], [['chin']])
    const stable = track(renamed)
    expect(stable.compatibilityStatus).toBe('fully-compatible')
    expect(stable.values[0]).toMatchObject({ display: 'Chin', categories: [{ id: 'chin', label: 'Lower Chin' }] })
    const replaced = fixture([{ id: 'old-chin', label: 'Chin' }], [{ id: 'new-chin', label: 'Lower Chin' }], [['old-chin']])
    const unresolved = track(replaced)
    expect(unresolved.compatibilityStatus).toBe('unmapped-historical')
    expect(unresolved.values).toEqual([])
    expect(unresolved.warnings).toHaveLength(1)
  })

  it('rejects ambiguous label fallback from malformed duplicate current definitions', () => {
    const data = fixture([{ id: 'old', label: 'Jaw' }], [{ id: 'new-a', label: 'Jaw' }, { id: 'new-b', label: ' jaw ' }], [['old']])
    expect(track(data).values).toEqual([])
    expect(track(data).warnings).toHaveLength(1)
  })
})
