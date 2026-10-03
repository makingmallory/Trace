import { describe, expect, it } from 'vitest'
import { pivotRecordedValues, recordedValuesDefaultOpen } from './recordedValuesTable.ts'
import type { AnalysisTrack } from './analysisModel.ts'

function track(id: string, name: string, values: readonly { id: string; localDate: string; display: string }[]): AnalysisTrack {
  return { descriptor: { id, trackableId: id, name, categoryId: 'category', categoryName: 'Category', sourceInputType: 'number', measurementType: 'continuous', recordedCount: values.length }, values: values.map((value) => ({ ...value, version: 1, versionName: name, measurementType: 'continuous' })), summary: { recordedCount: values.length, latest: null }, warnings: [], lanes: [], unit: null, compatibilityStatus: 'fully-compatible', mappingOpportunities: [] }
}

describe('recorded values table', () => {
  it('defaults to collapsed', () => expect(recordedValuesDefaultOpen).toBe(false))

  it('pivots selected Trackables to one row per date with missing values left absent for placeholders', () => {
    const rows = pivotRecordedValues([track('energy', 'Energy', [{ id: 'e1', localDate: '2026-08-02', display: '4' }, { id: 'e2', localDate: '2026-08-01', display: '3' }]), track('mood', 'Mood', [{ id: 'm1', localDate: '2026-08-02', display: 'Good' }])])
    expect(rows).toEqual([
      { localDate: '2026-08-02', valuesBySeriesId: { energy: '4', mood: 'Good' } },
      { localDate: '2026-08-01', valuesBySeriesId: { energy: '3' } },
    ])
  })

  it('keeps multi-select and multiple same-day occurrences together in one cell', () => {
    const rows = pivotRecordedValues([
      track('color', 'Discharge Color', [{ id: 'c1', localDate: '2026-08-02', display: 'Clear, White' }]),
      track('event', 'Migraine', [{ id: 'm1', localDate: '2026-08-02', display: 'Migraine' }, { id: 'm2', localDate: '2026-08-02', display: 'Migraine (evening)' }]),
    ])
    expect(rows[0].valuesBySeriesId).toEqual({ color: 'Clear, White', event: 'Migraine; Migraine (evening)' })
  })

  it('uses all selected tracks regardless of chart legend visibility', () => {
    const selectedTracks = [track('energy', 'Energy', [{ id: 'e1', localDate: '2026-08-02', display: '4' }]), track('sleep', 'Sleep', [{ id: 's1', localDate: '2026-08-02', display: '8' }])]
    expect(pivotRecordedValues(selectedTracks)[0].valuesBySeriesId).toEqual({ energy: '4', sleep: '8' })
  })
})
