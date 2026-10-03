import type { AnalysisTrack } from './analysisModel.ts'

export interface RecordedValuesRow {
  localDate: string
  valuesBySeriesId: Readonly<Record<string, string>>
}

/** Creates a one-row-per-date, all-selected-series table without consulting chart visibility. */
export function pivotRecordedValues(tracks: readonly AnalysisTrack[]): readonly RecordedValuesRow[] {
  const valuesByDate = new Map<string, Map<string, string[]>>()
  for (const track of tracks) for (const value of track.values) {
    const bySeries = valuesByDate.get(value.localDate) ?? new Map<string, string[]>()
    const values = bySeries.get(track.descriptor.id) ?? []
    values.push(value.display)
    bySeries.set(track.descriptor.id, values)
    valuesByDate.set(value.localDate, bySeries)
  }
  return [...valuesByDate].sort(([left], [right]) => right.localeCompare(left)).map(([localDate, bySeries]) => ({
    localDate,
    valuesBySeriesId: Object.fromEntries([...bySeries].map(([id, values]) => [id, [...new Set(values)].join('; ')])),
  }))
}

export const recordedValuesDefaultOpen = false
