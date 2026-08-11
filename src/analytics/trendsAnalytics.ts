import type { TrendsData } from './AnalyticsProvider.ts'
import type { InputType, Observation, ObservationAnswer } from '../domain/models/index.ts'

export type TrendRange = 7 | 30 | 90 | 'all'
export type TrendMetricKind = 'numeric' | 'categorical'

export interface TrendMetricOption {
  trackableId: string
  name: string
  kind: TrendMetricKind
}

export interface NumericTrendPoint {
  observationId: string
  localDate: string
  value: number
  display: string
  versionName: string
}

export interface NumericTrendSummary {
  kind: 'numeric'
  name: string
  unit: string | null
  points: readonly NumericTrendPoint[]
  count: number
  latest: NumericTrendPoint | null
  average: number | null
  min: number | null
  max: number | null
}

export interface CategoricalTrendEntry {
  observationId: string
  localDate: string
  display: string
}

export interface CategoryCount {
  value: string
  count: number
}

export interface CategoricalTrendSummary {
  kind: 'categorical'
  name: string
  entries: readonly CategoricalTrendEntry[]
  counts: readonly CategoryCount[]
  mostCommon: CategoryCount | null
}

export type TrendSummary = NumericTrendSummary | CategoricalTrendSummary

const numericTypes: readonly InputType[] = ['scale', 'number', 'duration']
const categoricalTypes: readonly InputType[] = ['boolean', 'single_choice', 'multi_select']

function cutoffDate(today: string, range: Exclude<TrendRange, 'all'>): string {
  const [year, month, day] = today.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day - range + 1))
  return date.toISOString().slice(0, 10)
}

function metricKind(inputType: InputType): TrendMetricKind | null {
  if (numericTypes.includes(inputType)) return 'numeric'
  if (categoricalTypes.includes(inputType)) return 'categorical'
  return null
}

function activeRecordedObservations(data: TrendsData) {
  const records = new Map(data.logRecords.filter((record) => !record.deletedAt).map((record) => [record.id, record]))
  return data.observations
    .filter((observation) => !observation.deletedAt && observation.answer.state === 'answered' && records.has(observation.logRecordId))
    .map((observation) => ({ observation, record: records.get(observation.logRecordId)! }))
}

export function trendMetricOptions(data: TrendsData): readonly TrendMetricOption[] {
  const recordedIds = new Set(activeRecordedObservations(data).map(({ observation }) => observation.trackableId))
  return data.trackables.flatMap((trackable): TrendMetricOption[] => {
    if (!trackable.active || trackable.deletedAt || !recordedIds.has(trackable.id)) return []
    const current = data.trackableVersions.find((version) => version.trackableId === trackable.id && version.version === trackable.currentVersion && !version.deletedAt)
    const kind = current ? metricKind(current.inputType) : null
    return current && kind ? [{ trackableId: trackable.id, name: current.name, kind }] : []
  }).sort((left, right) => left.name.localeCompare(right.name))
}

export function hasCompatibleActiveTrackable(data: TrendsData): boolean {
  return data.trackables.some((trackable) => {
    if (!trackable.active || trackable.deletedAt) return false
    const current = data.trackableVersions.find((version) => version.trackableId === trackable.id && version.version === trackable.currentVersion && !version.deletedAt)
    return Boolean(current && metricKind(current.inputType))
  })
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

function numericValue(answer: Extract<ObservationAnswer, { state: 'answered' }>['value']): number | null {
  return answer.kind === 'scale' || answer.kind === 'number' || answer.kind === 'duration' ? answer.value : null
}

function optionLabels(data: TrendsData, observationId: string, trackableId: string, version: number): readonly string[] {
  const selectedIds = new Set(data.observationSelections.filter((selection) => selection.observationId === observationId && !selection.deletedAt).map((selection) => selection.optionId))
  return data.trackableOptions
    .filter((option) => option.trackableId === trackableId && option.trackableVersion === version && !option.deletedAt && selectedIds.has(option.optionId))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label))
    .map((option) => option.label)
}

function categoricalValues(data: TrendsData, observation: Observation): readonly string[] {
  if (observation.answer.state !== 'answered') return []
  if (observation.answer.value.kind === 'boolean') return [observation.answer.value.value ? 'Yes' : 'No']
  if (observation.answer.value.kind === 'choice') return optionLabels(data, observation.id, observation.trackableId, observation.trackableVersion)
  return []
}

export function buildTrendSummary(data: TrendsData, trackableId: string, range: TrendRange, today: string): TrendSummary | null {
  const trackable = data.trackables.find((item) => item.id === trackableId && item.active && !item.deletedAt)
  if (!trackable) return null
  const currentVersion = data.trackableVersions.find((version) => version.trackableId === trackableId && version.version === trackable.currentVersion && !version.deletedAt)
  const kind = currentVersion ? metricKind(currentVersion.inputType) : null
  if (!currentVersion || !kind) return null
  const cutoff = range === 'all' ? null : cutoffDate(today, range)
  const candidates = activeRecordedObservations(data)
    .filter(({ observation, record }) => observation.trackableId === trackableId && (!cutoff || record.localDate >= cutoff) && record.localDate <= today)
    .sort((left, right) => left.record.localDate.localeCompare(right.record.localDate) || left.observation.createdAt.localeCompare(right.observation.createdAt) || left.observation.id.localeCompare(right.observation.id))

  if (kind === 'numeric') {
    const points = candidates.flatMap(({ observation, record }): NumericTrendPoint[] => {
      if (observation.answer.state !== 'answered') return []
      const value = numericValue(observation.answer.value)
      if (value === null) return []
      const version = data.trackableVersions.find((item) => item.trackableId === trackableId && item.version === observation.trackableVersion && !item.deletedAt)
      if (!version) return []
      const unit = observation.answer.value.kind === 'duration' ? 'min' : observation.answer.value.kind === 'number' ? observation.answer.value.unit ?? version.unit : version.unit
      return [{ observationId: observation.id, localDate: record.localDate, value, display: `${formatNumber(value)}${unit ? ` ${unit}` : ''}`, versionName: version.name }]
    })
    const values = points.map((point) => point.value)
    const units = new Set(points.map((point) => point.display.replace(/^[-+]?\d+(?:\.\d+)?\s*/, '')).filter(Boolean))
    return {
      kind, name: currentVersion.name, unit: units.size === 1 ? [...units][0] : null, points, count: points.length,
      latest: points.at(-1) ?? null,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
    }
  }

  const entries = candidates.flatMap(({ observation, record }): CategoricalTrendEntry[] => {
    const values = categoricalValues(data, observation)
    return values.length ? [{ observationId: observation.id, localDate: record.localDate, display: values.join(', ') }] : []
  })
  const counts = new Map<string, number>()
  for (const { observation } of candidates) for (const value of categoricalValues(data, observation)) counts.set(value, (counts.get(value) ?? 0) + 1)
  const orderedCounts = [...counts].map(([value, count]) => ({ value, count })).sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
  return { kind, name: currentVersion.name, entries, counts: orderedCounts, mostCommon: orderedCounts[0] ?? null }
}

export function formatTrendNumber(value: number): string {
  return formatNumber(value)
}
