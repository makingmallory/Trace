import type { TrendsData } from './AnalyticsProvider.ts'
import type { AnalysisMappingMeasurementType, AnalysisValueMapping, InputType, Observation, Trackable, TrackableOption, TrackableVersion } from '../domain/models/index.ts'
import { isOccurrenceTrackable } from '../domain/trackables/trackableSemantics.ts'
import type { TrendRange } from './trendsAnalytics.ts'
import { analysisMappingCompatibility, applyAnalysisMapping, mappingCoverage, sourceKeyForAnalysisValue, validateMappingEntries } from './analysisMappings.ts'

export type AnalysisMeasurementType =
  | 'continuous'
  | 'ordinal'
  | 'binary'
  | 'nominal-single'
  | 'nominal-multiselect'
  | 'count'
  | 'duration'
  | 'time'
  | 'event'

export type AnalysisTransformation = 'raw' | 'normalize' | 'z-score'
export type AnalysisSourceInputType = InputType | 'event'

export interface AnalysisSeriesDescriptor {
  id: string
  trackableId: string
  ownerTrackableId?: string
  ownerTrackableVersion?: number
  name: string
  parentName?: string
  categoryId: string
  categoryName: string
  /** The persisted Trackable input type, kept separate from analysis measurement semantics. */
  sourceInputType: AnalysisSourceInputType
  measurementType: AnalysisMeasurementType
  recordedCount: number
}

export interface AnalysisValue {
  id: string
  localDate: string
  display: string
  version: number
  versionName: string
  measurementType: AnalysisMeasurementType
  numericValue?: number
  booleanValue?: boolean
  categories?: readonly { id: string; label: string }[]
  originalMeasurementType?: AnalysisMeasurementType
  /** Audit trail retained when a user-defined canonical mapping is applied. */
  rawDisplay?: string
  rawMeasurementType?: AnalysisMeasurementType
  rawNumericValue?: number
  sourceValue?: string
  analysisMappingId?: string
  userMapped?: boolean
}

export interface AnalysisWarning {
  code: 'missing-version' | 'incompatible-version' | 'incompatible-unit' | 'unmapped-value'
  message: string
  recordId?: string
  count?: number
}

export type AnalysisCompatibilityStatus = 'fully-compatible' | 'partially-mapped' | 'unmapped-historical' | 'incompatible'

export interface AnalysisMappingValueOption {
  value: string
  label: string
  observedCount: number
}

export interface AnalysisMappingOpportunity {
  trackableId: string
  sourceVersion: number
  targetVersion: number
  sourceName: string
  targetName: string
  sourceMeasurementType: AnalysisMeasurementType | null
  targetRawMeasurementType: AnalysisMeasurementType | null
  targetMeasurementType: AnalysisMeasurementType | null
  compatibility: 'supported' | 'incompatible'
  status: AnalysisCompatibilityStatus
  sourceValues: readonly AnalysisMappingValueOption[]
  targetValues: readonly AnalysisMappingValueOption[]
  ordinalOrder?: readonly string[]
  /** Multi-select without a user mapping counts uniquely observed options that resolve automatically. */
  coverage: { mapped: number; total: number; percent: number }
  mapping?: AnalysisValueMapping
}

export interface AnalysisSummary {
  recordedCount: number
  latest: AnalysisValue | null
  average?: number
  min?: number
  max?: number
  mostFrequent?: readonly { label: string; count: number }[]
}

export interface AnalysisTrack {
  descriptor: AnalysisSeriesDescriptor
  values: readonly AnalysisValue[]
  summary: AnalysisSummary
  warnings: readonly AnalysisWarning[]
  lanes: readonly { id: string; label: string; dates: readonly string[]; count: number }[]
  unit: string | null
  compatibilityStatus: AnalysisCompatibilityStatus
  mappingOpportunities: readonly AnalysisMappingOpportunity[]
}

export interface AnalysisView {
  tracks: readonly AnalysisTrack[]
  layout: 'stacked' | 'overlay'
  transformation: AnalysisTransformation
  dates: readonly string[]
}

const explicitTypes = new Set<AnalysisMeasurementType>([
  'continuous', 'ordinal', 'binary', 'nominal-single', 'nominal-multiselect', 'count', 'duration', 'time', 'event',
])

function explicitMeasurement(version: TrackableVersion): AnalysisMeasurementType | null {
  const configured = version.configuration.analysisMeasurementType
  return typeof configured === 'string' && explicitTypes.has(configured as AnalysisMeasurementType)
    ? configured as AnalysisMeasurementType
    : null
}

/** Analysis semantics are derived without changing the persisted Trackable schema. */
export function measurementTypeForVersion(version: TrackableVersion, trackable?: Trackable): AnalysisMeasurementType | null {
  if (trackable && isOccurrenceTrackable(trackable)) return 'event'
  const explicit = explicitMeasurement(version)
  if (explicit) return explicit
  switch (version.inputType) {
    case 'number': return 'continuous'
    case 'scale': return 'ordinal'
    case 'boolean': return 'binary'
    case 'single_choice': return 'nominal-single'
    case 'multi_select': return 'nominal-multiselect'
    case 'duration': return 'duration'
    case 'time': return 'time'
    default: return null
  }
}

function cutoffDate(today: string, range: Exclude<TrendRange, 'all'>): string {
  const [year, month, day] = today.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day - range + 1)).toISOString().slice(0, 10)
}

function inRange(localDate: string, range: TrendRange, today: string): boolean {
  return localDate <= today && (range === 'all' || localDate >= cutoffDate(today, range))
}

function compositeFieldId(ownerTrackableId: string, ownerVersion: number | undefined, fieldTrackableId: string, fieldVersion: number): string {
  return `field:${ownerTrackableId}:${ownerVersion ?? '*'}:${fieldTrackableId}:${fieldVersion}`
}

function currentVersion(data: TrendsData, trackable: Trackable): TrackableVersion | undefined {
  return data.trackableVersions.find((item) => item.trackableId === trackable.id && item.version === trackable.currentVersion && !item.deletedAt)
}

function activeMappings(data: TrendsData, trackableId: string): readonly AnalysisValueMapping[] {
  return data.analysisMappings.filter((mapping) => mapping.trackableId === trackableId && !mapping.deletedAt)
}

function canonicalMeasurementType(data: TrendsData, trackable: Trackable, version: TrackableVersion): AnalysisMeasurementType | null {
  const raw = measurementTypeForVersion(version, trackable)
  const configured = activeMappings(data, trackable.id).find((mapping) => mapping.targetTrackableVersion === version.version)
  return configured?.targetMeasurementType ?? raw
}

function activeRecords(data: TrendsData) {
  return data.logRecords.filter((record) => !record.deletedAt)
}

function observationCount(data: TrendsData, trackableId: string, ownerTrackableId?: string): number {
  const records = new Map(activeRecords(data).map((record) => [record.id, record]))
  return data.observations.filter((observation) => {
    if (observation.deletedAt || observation.answer.state !== 'answered' || observation.trackableId !== trackableId) return false
    const record = records.get(observation.logRecordId)
    if (!record || (ownerTrackableId && record.trackableId !== ownerTrackableId)) return false
    if (!ownerTrackableId && record.trackableId && data.trackableFields.some((field) => !field.deletedAt && field.enabled && field.ownerTrackableId === record.trackableId && field.fieldTrackableId === trackableId && field.fieldTrackableVersion === observation.trackableVersion)) return false
    return true
  }).length
}

export function analysisSeriesOptions(data: TrendsData): readonly AnalysisSeriesDescriptor[] {
  const records = activeRecords(data)
  const results: AnalysisSeriesDescriptor[] = []
  const categoryName = (categoryId: string) => data.categories.find((category) => category.id === categoryId && !category.deletedAt)?.name ?? 'Uncategorized'
  for (const trackable of data.trackables) {
    if (!trackable.active || trackable.deletedAt) continue
    const version = currentVersion(data, trackable)
    if (!version) continue
    const measurementType = canonicalMeasurementType(data, trackable, version)
    if (!measurementType) continue
    const recordedCount = isOccurrenceTrackable(trackable)
      ? records.filter((record) => record.recordKind === 'quick_log' && record.trackableId === trackable.id).length
      : observationCount(data, trackable.id)
    if (recordedCount > 0) results.push({ id: trackable.id, trackableId: trackable.id, name: version.name, categoryId: trackable.categoryId, categoryName: categoryName(trackable.categoryId), sourceInputType: isOccurrenceTrackable(trackable) ? 'event' : version.inputType, measurementType, recordedCount })
  }

  for (const field of data.trackableFields) {
    if (!field.enabled || field.deletedAt) continue
    const owner = data.trackables.find((item) => item.id === field.ownerTrackableId && !item.deletedAt)
    const fieldTrackable = data.trackables.find((item) => item.id === field.fieldTrackableId && !item.deletedAt)
    const ownerVersion = data.trackableVersions.find((item) => item.trackableId === field.ownerTrackableId && item.version === (field.ownerTrackableVersion ?? owner?.currentVersion) && !item.deletedAt)
    const fieldVersion = data.trackableVersions.find((item) => item.trackableId === field.fieldTrackableId && item.version === field.fieldTrackableVersion && !item.deletedAt)
    if (!owner || !fieldTrackable || !ownerVersion || !fieldVersion) continue
    const measurementType = canonicalMeasurementType(data, fieldTrackable, fieldVersion)
    const recordedCount = observationCount(data, field.fieldTrackableId, field.ownerTrackableId)
    if (!measurementType || recordedCount === 0) continue
    results.push({
      id: compositeFieldId(field.ownerTrackableId, field.ownerTrackableVersion, field.fieldTrackableId, field.fieldTrackableVersion),
      trackableId: field.fieldTrackableId,
      ownerTrackableId: field.ownerTrackableId,
      ownerTrackableVersion: field.ownerTrackableVersion,
      name: `${ownerVersion.name} → ${fieldVersion.name}`,
      parentName: ownerVersion.name,
      categoryId: owner.categoryId,
      categoryName: categoryName(owner.categoryId),
      sourceInputType: fieldVersion.inputType,
      measurementType,
      recordedCount,
    })
  }
  return results.sort((left, right) => left.name.localeCompare(right.name))
}

export function hasSupportedAnalysisDefinition(data: TrendsData): boolean {
  return data.trackables.some((trackable) => {
    if (!trackable.active || trackable.deletedAt) return false
    const version = currentVersion(data, trackable)
    return Boolean(version && measurementTypeForVersion(version, trackable))
  })
}

function selectedOptions(data: TrendsData, observation: Observation): readonly TrackableOption[] {
  const optionIds = new Set(data.observationSelections.filter((selection) => selection.observationId === observation.id && !selection.deletedAt).map((selection) => selection.optionId))
  return data.trackableOptions.filter((option) => option.trackableId === observation.trackableId
    && option.trackableVersion === observation.trackableVersion && !option.deletedAt && optionIds.has(option.optionId))
}

function answerValue(data: TrendsData, observation: Observation, localDate: string, version: TrackableVersion, measurementType: AnalysisMeasurementType): AnalysisValue | null {
  if (observation.answer.state !== 'answered') return null
  const base = { id: observation.id, localDate, version: version.version, versionName: version.name, measurementType }
  const value = observation.answer.value
  if (value.kind === 'scale' && measurementType === 'ordinal') {
    const labels = version.configuration.ordinalLabels
    const labelRecord = labels && typeof labels === 'object' && !Array.isArray(labels) ? labels as Readonly<Record<string, unknown>> : null
    const display = labelRecord && typeof labelRecord[String(value.value)] === 'string'
      ? labelRecord[String(value.value)] as string
      : String(value.value)
    return { ...base, numericValue: value.value, sourceValue: `number:${value.value}`, display }
  }
  if (value.kind === 'number' && (measurementType === 'continuous' || measurementType === 'count')) {
    const unit = value.unit ?? version.unit
    return { ...base, numericValue: value.value, sourceValue: `number:${value.value}`, display: `${value.value}${unit ? ` ${unit}` : ''}` }
  }
  if (value.kind === 'duration' && measurementType === 'duration') return { ...base, numericValue: value.value, sourceValue: `duration:${value.value}`, display: `${value.value} min` }
  if (value.kind === 'boolean' && measurementType === 'binary') return { ...base, booleanValue: value.value, numericValue: value.value ? 1 : 0, sourceValue: `boolean:${value.value}`, display: value.value ? 'Yes' : 'No' }
  if (value.kind === 'time' && measurementType === 'time') {
    const [hours, minutes] = value.value.split(':').map(Number)
    return { ...base, numericValue: Number.isFinite(hours + minutes) ? hours * 60 + minutes : undefined, sourceValue: `time:${value.value}`, display: value.value }
  }
  if (value.kind === 'choice' && (measurementType === 'nominal-single' || measurementType === 'nominal-multiselect' || measurementType === 'ordinal')) {
    const options = selectedOptions(data, observation).map((option) => ({ id: option.optionId, label: option.label }))
    if (observation.customChoiceValue) options.push({ id: `custom:${observation.customChoiceValue}`, label: observation.customChoiceValue })
    if (!options.length) return null
    if (measurementType === 'ordinal') {
      const orderedIds = version.configuration.orderedOptionIds
      if (!Array.isArray(orderedIds)) return { ...base, measurementType: 'nominal-single', originalMeasurementType: measurementType, categories: options, display: options.map((option) => option.label).join(', ') }
      const position = orderedIds.findIndex((id) => id === options[0].id)
      if (position < 0) return null
      return { ...base, numericValue: position, sourceValue: `option:${options[0].id}`, categories: options, display: options[0].label }
    }
    return { ...base, sourceValue: options.length === 1 ? `option:${options[0].id}` : undefined, categories: options, display: options.map((option) => option.label).join(', ') }
  }
  return null
}

function unitForVersion(version: TrackableVersion, measurementType: AnalysisMeasurementType): string | null {
  if (measurementType === 'duration') return 'min'
  return measurementType === 'continuous' || measurementType === 'count' ? version.unit ?? null : null
}

function summarize(values: readonly AnalysisValue[], type: AnalysisMeasurementType): AnalysisSummary {
  const latest = values.at(-1) ?? null
  if (type === 'continuous' || type === 'count' || type === 'duration' || type === 'ordinal') {
    const numbers = values.flatMap((item) => item.numericValue === undefined ? [] : [item.numericValue])
    return { recordedCount: values.length, latest, ...(numbers.length ? { average: numbers.reduce((sum, item) => sum + item, 0) / numbers.length, min: Math.min(...numbers), max: Math.max(...numbers) } : {}) }
  }
  const counts = new Map<string, number>()
  for (const value of values) for (const category of value.categories ?? [{ id: String(value.booleanValue), label: value.display }]) counts.set(category.label, (counts.get(category.label) ?? 0) + 1)
  return { recordedCount: values.length, latest, mostFrequent: [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) }
}

function lanesFor(values: readonly AnalysisValue[], type: AnalysisMeasurementType, catalog: readonly { id: string; label: string }[] = []) {
  if (type === 'binary') return ['Yes', 'No'].map((label) => ({ id: label.toLowerCase(), label, dates: values.filter((value) => value.display === label).map((value) => value.localDate), count: values.filter((value) => value.display === label).length }))
  const lanes = new Map(catalog.map((item) => [item.id, { ...item, dates: [] as string[] }]))
  for (const value of values) for (const category of value.categories ?? []) {
    const lane = lanes.get(category.id) ?? { id: category.id, label: category.label, dates: [] }
    lane.dates.push(value.localDate); lanes.set(category.id, lane)
  }
  const order = new Map(catalog.map((item, index) => [item.id, index]))
  return [...lanes.values()].map((lane) => ({ ...lane, count: lane.dates.length })).sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label))
}

function compatibleType(current: AnalysisMeasurementType, historical: AnalysisMeasurementType): boolean {
  return current === historical || (current === 'continuous' && historical === 'count') || (current === 'count' && historical === 'continuous')
}

function normalizedOptionLabel(label: string): string {
  return label.trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase()
}

/** Resolve each selected option independently; never compare a multi-label combination as one value. */
function resolveHistoricalChoices(data: TrendsData, source: TrackableVersion, target: TrackableVersion, value: AnalysisValue): { categories: readonly { id: string; label: string }[]; unresolved: readonly { id: string; label: string }[] } {
  const sourceOptions = data.trackableOptions.filter((option) => option.trackableId === source.trackableId && option.trackableVersion === source.version && !option.deletedAt)
  const targetOptions = data.trackableOptions.filter((option) => option.trackableId === target.trackableId && option.trackableVersion === target.version && !option.deletedAt)
  const categories: { id: string; label: string }[] = []
  const unresolved: { id: string; label: string }[] = []
  for (const selected of value.categories ?? []) {
    const sameId = targetOptions.filter((option) => option.optionId === selected.id)
    let resolved = sameId.length === 1 ? sameId[0] : undefined
    if (!resolved && sameId.length === 0 && !selected.id.startsWith('custom:')) {
      const historical = sourceOptions.filter((option) => option.optionId === selected.id)
      if (historical.length === 1) {
        const label = normalizedOptionLabel(historical[0].label)
        const sourceMatches = sourceOptions.filter((option) => normalizedOptionLabel(option.label) === label)
        const targetMatches = targetOptions.filter((option) => normalizedOptionLabel(option.label) === label)
        if (label && sourceMatches.length === 1 && targetMatches.length === 1) resolved = targetMatches[0]
      }
    }
    if (resolved) {
      if (!categories.some((category) => category.id === resolved.optionId)) categories.push({ id: resolved.optionId, label: resolved.label })
    } else unresolved.push(selected)
  }
  return { categories, unresolved }
}

function automaticallyCompatibleWithoutMapping(data: TrendsData, sourceType: AnalysisMeasurementType | null, targetType: AnalysisMeasurementType | null, observed: readonly AnalysisValue[], targetValues: readonly AnalysisMappingValueOption[], sourceVersion: TrackableVersion, targetVersion: TrackableVersion): boolean {
  if (!sourceType || !targetType || !compatibleType(targetType, sourceType)) return false
  if (targetType === 'ordinal' && JSON.stringify(sourceVersion.configuration.orderedOptionIds ?? null) !== JSON.stringify(targetVersion.configuration.orderedOptionIds ?? null)) return false
  if (targetType === 'nominal-single' || targetType === 'nominal-multiselect' || targetType === 'ordinal') return observed.every((value) => {
    if (!value.categories?.length) return targetType === 'ordinal' && Boolean(value.sourceValue && targetValues.some((target) => target.value === value.sourceValue))
    const resolved = resolveHistoricalChoices(data, sourceVersion, targetVersion, value)
    return resolved.unresolved.length === 0 && resolved.categories.length === (value.categories?.length ?? 0)
  })
  return true
}

function numericDefinitionValues(version: TrackableVersion): readonly number[] {
  if (version.inputType !== 'scale' || version.scaleMin === undefined || version.scaleMax === undefined) return []
  const step = version.scaleStep && version.scaleStep > 0 ? version.scaleStep : 1
  const values: number[] = []
  for (let value = version.scaleMin; value <= version.scaleMax + step / 1000 && values.length < 500; value += step) values.push(Number(value.toFixed(8)))
  return values
}

function versionCatalog(data: TrendsData, version: TrackableVersion, observedValues: readonly AnalysisValue[]): readonly AnalysisMappingValueOption[] {
  const counts = new Map<string, number>()
  for (const value of observedValues) {
    const keys = value.measurementType === 'nominal-multiselect'
      ? value.categories?.map((category) => `option:${category.id}`) ?? []
      : [sourceKeyForAnalysisValue(value)].filter((key): key is string => Boolean(key))
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  if (version.inputType === 'single_choice' || version.inputType === 'multi_select') {
    const options = data.trackableOptions.filter((option) => option.trackableId === version.trackableId && option.trackableVersion === version.version && !option.deletedAt).sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label))
    const catalog = options.map((option) => ({ value: `option:${option.optionId}`, label: option.label, observedCount: counts.get(`option:${option.optionId}`) ?? 0 }))
    const known = new Set(catalog.map((item) => item.value))
    return [...catalog, ...observedValues.flatMap((value) => value.sourceValue && !known.has(value.sourceValue) ? [{ value: value.sourceValue, label: value.display, observedCount: counts.get(value.sourceValue) ?? 0 }] : [])]
  }
  if (version.inputType === 'scale') {
    const labels = version.configuration.ordinalLabels
    const labelRecord = labels && typeof labels === 'object' && !Array.isArray(labels) ? labels as Readonly<Record<string, unknown>> : null
    return numericDefinitionValues(version).map((value) => ({ value: `number:${value}`, label: typeof labelRecord?.[String(value)] === 'string' ? labelRecord[String(value)] as string : String(value), observedCount: counts.get(`number:${value}`) ?? 0 }))
  }
  const values = new Map<string, AnalysisMappingValueOption>()
  for (const value of observedValues) if (value.sourceValue) values.set(value.sourceValue, { value: value.sourceValue, label: value.display, observedCount: counts.get(value.sourceValue) ?? 0 })
  return [...values.values()].sort((left, right) => left.label.localeCompare(right.label))
}

function observedValuesForVersion(data: TrendsData, descriptor: AnalysisSeriesDescriptor, version: TrackableVersion): readonly AnalysisValue[] {
  const records = new Map(activeRecords(data).map((record) => [record.id, record]))
  const measurementType = measurementTypeForVersion(version)
  if (!measurementType) return []
  return data.observations.flatMap((observation) => {
    if (observation.deletedAt || observation.trackableId !== descriptor.trackableId || observation.trackableVersion !== version.version) return []
    const record = records.get(observation.logRecordId)
    if (!record || (descriptor.ownerTrackableId && record.trackableId !== descriptor.ownerTrackableId)) return []
    const interpreted = answerValue(data, observation, record.localDate, version, measurementType)
    return interpreted ? [interpreted] : []
  })
}

export function analysisMappingOpportunity(data: TrendsData, descriptor: AnalysisSeriesDescriptor, sourceVersionNumber: number): AnalysisMappingOpportunity | null {
  const trackable = data.trackables.find((item) => item.id === descriptor.trackableId && !item.deletedAt)
  if (!trackable || sourceVersionNumber === trackable.currentVersion) return null
  const source = data.trackableVersions.find((version) => version.trackableId === trackable.id && version.version === sourceVersionNumber && !version.deletedAt)
  const target = currentVersion(data, trackable)
  if (!source || !target) return null
  const sourceType = measurementTypeForVersion(source)
  const currentRawType = measurementTypeForVersion(target, trackable)
  const mapping = activeMappings(data, trackable.id).find((item) => item.sourceTrackableVersion === source.version && item.targetTrackableVersion === target.version)
  const targetRepresentation = activeMappings(data, trackable.id).find((item) => item.targetTrackableVersion === target.version)
  const targetType = mapping?.targetMeasurementType ?? targetRepresentation?.targetMeasurementType ?? currentRawType
  const observed = observedValuesForVersion(data, descriptor, source)
  const sourceValues = versionCatalog(data, source, observed)
  const targetValues = versionCatalog(data, target, [])
  const observedKeys = sourceType === 'nominal-multiselect'
    ? [...new Set(observed.flatMap((value) => value.categories?.map((category) => `option:${category.id}`) ?? []))]
    : observed.flatMap((value) => value.sourceValue ? [value.sourceValue] : [])
  const resolvedSourceIds = new Set<string>()
  if (!mapping && sourceType === 'nominal-multiselect' && targetType === 'nominal-multiselect') for (const value of observed) {
    const unresolved = new Set(resolveHistoricalChoices(data, source, target, value).unresolved.map((category) => category.id))
    for (const category of value.categories ?? []) if (!unresolved.has(category.id)) resolvedSourceIds.add(category.id)
  }
  const coverage = !mapping && sourceType === 'nominal-multiselect' && targetType === 'nominal-multiselect'
    ? { mapped: observedKeys.filter((key) => resolvedSourceIds.has(key.slice('option:'.length))).length, total: observedKeys.length, percent: observedKeys.length ? Math.round(resolvedSourceIds.size / observedKeys.length * 100) : 100 }
    : mappingCoverage(observedKeys, mapping?.valueMappings ?? [])
  const compatibility = analysisMappingCompatibility(sourceType, targetType)
  const status: AnalysisCompatibilityStatus = mapping
    ? (coverage.mapped === coverage.total ? 'fully-compatible' : 'partially-mapped')
    : automaticallyCompatibleWithoutMapping(data, sourceType, targetType, observed, targetValues, source, target)
      ? 'fully-compatible'
      : compatibility === 'supported' || (sourceType === 'nominal-multiselect' && targetType === 'nominal-multiselect') ? 'unmapped-historical' : 'incompatible'
  const ordinalOrder = mapping?.ordinalOrder ?? targetRepresentation?.ordinalOrder
  return { trackableId: trackable.id, sourceVersion: source.version, targetVersion: target.version, sourceName: source.name, targetName: target.name, sourceMeasurementType: sourceType, targetRawMeasurementType: currentRawType, targetMeasurementType: targetType, compatibility, status, sourceValues, targetValues, coverage, ...(ordinalOrder ? { ordinalOrder } : {}), ...(mapping ? { mapping } : {}) }
}

function mappingOpportunities(data: TrendsData, descriptor: AnalysisSeriesDescriptor): readonly AnalysisMappingOpportunity[] {
  const records = new Map(activeRecords(data).map((record) => [record.id, record]))
  const sourceVersions = new Set(data.observations.filter((observation) => {
    if (observation.deletedAt || observation.trackableId !== descriptor.trackableId) return false
    const record = records.get(observation.logRecordId)
    return Boolean(record && (!descriptor.ownerTrackableId || record.trackableId === descriptor.ownerTrackableId))
  }).map((observation) => observation.trackableVersion))
  return [...sourceVersions].sort((left, right) => left - right).flatMap((version) => analysisMappingOpportunity(data, descriptor, version) ?? [])
}

/** Lists observed historical transitions independently of Trends selection or visibility. */
export function analysisMappingOpportunitiesForTrackable(data: TrendsData, trackableId: string): readonly AnalysisMappingOpportunity[] {
  const trackable = data.trackables.find((item) => item.id === trackableId && !item.deletedAt)
  if (!trackable) return []
  const version = currentVersion(data, trackable)
  const measurementType = version ? canonicalMeasurementType(data, trackable, version) : null
  if (!version || !measurementType) return []
  const descriptor: AnalysisSeriesDescriptor = {
    id: trackable.id,
    trackableId: trackable.id,
    name: version.name,
    categoryId: trackable.categoryId,
    categoryName: data.categories.find((category) => category.id === trackable.categoryId)?.name ?? 'Uncategorized',
    sourceInputType: isOccurrenceTrackable(trackable) ? 'event' : version.inputType,
    measurementType,
    recordedCount: observationCount(data, trackable.id),
  }
  return mappingOpportunities(data, descriptor)
}

function aggregateCompatibility(opportunities: readonly AnalysisMappingOpportunity[]): AnalysisCompatibilityStatus {
  if (opportunities.some((item) => item.status === 'incompatible')) return 'incompatible'
  if (opportunities.some((item) => item.status === 'partially-mapped')) return 'partially-mapped'
  if (opportunities.some((item) => item.status === 'unmapped-historical')) return 'unmapped-historical'
  return 'fully-compatible'
}

export function validateAnalysisMappingDefinition(data: TrendsData, mapping: Pick<AnalysisValueMapping, 'trackableId' | 'sourceTrackableVersion' | 'targetTrackableVersion' | 'targetMeasurementType' | 'valueMappings' | 'ordinalOrder'>): string | null {
  const trackable = data.trackables.find((item) => item.id === mapping.trackableId && !item.deletedAt)
  const source = data.trackableVersions.find((item) => item.trackableId === mapping.trackableId && item.version === mapping.sourceTrackableVersion && !item.deletedAt)
  const target = data.trackableVersions.find((item) => item.trackableId === mapping.trackableId && item.version === mapping.targetTrackableVersion && !item.deletedAt)
  if (!trackable || !source || !target || source.version === target.version || target.version !== trackable.currentVersion) return 'Mapping versions do not match the current Trackable definition.'
  const sourceType = measurementTypeForVersion(source)
  const rawTargetType = measurementTypeForVersion(target, trackable)
  if (mapping.targetMeasurementType === 'ordinal' && !['ordinal', 'nominal-single'].includes(rawTargetType ?? '')) return 'This current definition cannot be treated as ordered categories.'
  if (mapping.targetMeasurementType === 'nominal-single' && rawTargetType !== 'nominal-single') return 'This current definition is not categorical.'
  if (analysisMappingCompatibility(sourceType, mapping.targetMeasurementType) !== 'supported') return 'These historical and current formats cannot be safely mapped.'
  const established = activeMappings(data, mapping.trackableId).find((item) => item.targetTrackableVersion === mapping.targetTrackableVersion && item.sourceTrackableVersion !== mapping.sourceTrackableVersion)
  if (established && (established.targetMeasurementType !== mapping.targetMeasurementType || JSON.stringify(established.ordinalOrder ?? []) !== JSON.stringify(mapping.ordinalOrder ?? []))) return 'Use the same target ordering for every historical version of this Trackable.'
  const targetValues = new Set(versionCatalog(data, target, []).map((item) => item.value))
  if (targetValues.size === 0) return 'The current definition has no target values to map to.'
  if (mapping.targetMeasurementType === 'ordinal' && !mapping.ordinalOrder) return 'Choose an explicit order for the mapped values.'
  return validateMappingEntries(mapping.valueMappings, targetValues, mapping.ordinalOrder)
}

function canonicalizeCurrentValue(value: AnalysisValue, targetType: AnalysisMappingMeasurementType, order?: readonly string[]): AnalysisValue | null {
  if (value.measurementType === targetType) return value
  const sourceValue = sourceKeyForAnalysisValue(value)
  if (!sourceValue || targetType !== 'ordinal' || !order) return null
  const position = order.indexOf(sourceValue)
  if (position < 0) return null
  return { ...value, measurementType: 'ordinal', numericValue: position, sourceValue }
}

export function buildAnalysisTrack(data: TrendsData, descriptor: AnalysisSeriesDescriptor, range: TrendRange, today: string): AnalysisTrack {
  const warnings: AnalysisWarning[] = []
  const unresolvedValues = new Map<string, { version: TrackableVersion; label: string; reason: 'option' | 'order' | 'mapping'; count: number }>()
  const noteUnresolved = (version: TrackableVersion, key: string, label: string, reason: 'option' | 'order' | 'mapping') => {
    const identity = `${version.version}:${reason}:${key}`
    const previous = unresolvedValues.get(identity)
    unresolvedValues.set(identity, { version, label, reason, count: (previous?.count ?? 0) + 1 })
  }
  const records = new Map(activeRecords(data).filter((record) => inRange(record.localDate, range, today)).map((record) => [record.id, record]))
  const values: AnalysisValue[] = []
  const units = new Set<string>()
  const opportunities = descriptor.measurementType === 'event' ? [] : mappingOpportunities(data, descriptor)
  const descriptorTrackable = data.trackables.find((item) => item.id === descriptor.trackableId)
  const targetVersion = descriptorTrackable ? currentVersion(data, descriptorTrackable) : undefined
  const targetRepresentation = targetVersion ? activeMappings(data, descriptor.trackableId).find((mapping) => mapping.targetTrackableVersion === targetVersion.version) : undefined

  if (descriptor.measurementType === 'event') {
    for (const record of records.values()) {
      if (record.recordKind !== 'quick_log' || record.trackableId !== descriptor.trackableId) continue
      const version = data.trackableVersions.find((item) => item.trackableId === descriptor.trackableId && item.version === record.trackableVersion && !item.deletedAt)
      if (!version) { warnings.push({ code: 'missing-version', recordId: record.id, message: `${descriptor.name}: one occurrence has no readable pinned definition.` }); continue }
      values.push({ id: record.id, localDate: record.localDate, version: version.version, versionName: version.name, measurementType: 'event', display: version.name })
    }
  } else {
    for (const observation of data.observations) {
      if (observation.deletedAt || observation.trackableId !== descriptor.trackableId) continue
      const record = records.get(observation.logRecordId)
      if (!record || (descriptor.ownerTrackableId && record.trackableId !== descriptor.ownerTrackableId)) continue
      const version = data.trackableVersions.find((item) => item.trackableId === descriptor.trackableId && item.version === observation.trackableVersion && !item.deletedAt)
      if (!version) { warnings.push({ code: 'missing-version', recordId: record.id, message: `${descriptor.name}: a historical value has no readable pinned definition.` }); continue }
      const historicalType = measurementTypeForVersion(version)
      if (!historicalType) {
        warnings.push({ code: 'incompatible-version', recordId: record.id, message: `${version.name} v${version.version} is ${historicalType ?? version.inputType}; it was kept separate rather than coerced into ${descriptor.measurementType}.` })
        continue
      }
      const mapping = targetVersion && version.version !== targetVersion.version ? activeMappings(data, descriptor.trackableId).find((item) => item.sourceTrackableVersion === version.version && item.targetTrackableVersion === targetVersion.version) : undefined
      if (targetVersion && version.version !== targetVersion.version && !mapping && !compatibleType(descriptor.measurementType, historicalType)) {
        warnings.push({ code: 'incompatible-version', recordId: record.id, message: `${version.name} v${version.version} is ${historicalType}; map its historical values before combining them with ${descriptor.name}.` })
        continue
      }
      let interpreted = answerValue(data, observation, record.localDate, version, historicalType)
      if (!interpreted) continue
      if (targetVersion && version.version !== targetVersion.version && !mapping && ['nominal-single', 'nominal-multiselect', 'ordinal'].includes(descriptor.measurementType)) {
        const resolved = resolveHistoricalChoices(data, version, targetVersion, interpreted)
        const orderChanged = descriptor.measurementType === 'ordinal' && JSON.stringify(version.configuration.orderedOptionIds ?? null) !== JSON.stringify(targetVersion.configuration.orderedOptionIds ?? null)
        const scalarKey = sourceKeyForAnalysisValue(interpreted)
        const unmatchedScalar = !interpreted.categories?.length && (!scalarKey || !versionCatalog(data, targetVersion, []).some((target) => target.value === scalarKey))
        if (orderChanged || unmatchedScalar || resolved.unresolved.length || resolved.categories.length !== (interpreted.categories?.length ?? 0)) {
          const unmatched = orderChanged ? interpreted.categories ?? [] : resolved.unresolved
          for (const category of unmatched) noteUnresolved(version, category.id, category.label, orderChanged ? 'order' : 'option')
          if (unmatchedScalar || (orderChanged && !unmatched.length)) noteUnresolved(version, scalarKey ?? interpreted.display, interpreted.display, orderChanged ? 'order' : 'option')
          continue
        }
        interpreted = { ...interpreted, categories: resolved.categories }
      }
      if (targetVersion && version.version === targetVersion.version) {
        const canonical = targetRepresentation
          ? canonicalizeCurrentValue(interpreted, targetRepresentation.targetMeasurementType, targetRepresentation.ordinalOrder)
          : interpreted
        if (canonical) {
          values.push(canonical)
          if (!targetRepresentation) { const unit = unitForVersion(version, historicalType); if (unit) units.add(unit) }
        }
        continue
      }
      if (mapping) {
        const mapped = applyAnalysisMapping(interpreted, mapping)
        if (mapped) values.push(mapped)
        else noteUnresolved(version, sourceKeyForAnalysisValue(interpreted) ?? interpreted.display, interpreted.display, 'mapping')
        continue
      }
      const unit = unitForVersion(version, historicalType)
      if (unit) units.add(unit)
      values.push(interpreted)
    }
  }
  for (const item of [...unresolvedValues.values()].sort((left, right) => left.version.version - right.version.version || left.label.localeCompare(right.label))) {
    const cause = item.reason === 'order' ? 'has a different current ordinal order' : item.reason === 'mapping' ? 'has no analysis mapping' : 'has no safely matching option in the current definition'
    warnings.push({ code: 'unmapped-value', count: item.count, message: `${item.version.name} v${item.version.version}: ${item.label} ${cause} (${item.count} observation${item.count === 1 ? '' : 's'}).` })
  }
  values.sort((a, b) => a.localDate.localeCompare(b.localDate) || a.id.localeCompare(b.id))
  if (units.size > 1) warnings.push({ code: 'incompatible-unit', message: `${descriptor.name} uses multiple historical units (${[...units].join(', ')}); raw values are not overlaid.` })
  const catalog = descriptor.measurementType === 'nominal-multiselect' && descriptorTrackable && targetVersion
    ? data.trackableOptions
      .filter((option) => option.trackableId === descriptor.trackableId && option.trackableVersion === descriptorTrackable.currentVersion && !option.deletedAt)
      .sort((left, right) => {
        const configured = targetVersion.configuration.orderedOptionIds
        if (!Array.isArray(configured)) return left.label.localeCompare(right.label)
        return configured.indexOf(left.optionId) - configured.indexOf(right.optionId)
      })
      .map((option) => ({ id: option.optionId, label: option.label }))
    : []
  return { descriptor, values, summary: summarize(values, descriptor.measurementType), warnings, lanes: lanesFor(values, descriptor.measurementType, catalog), unit: units.size === 1 ? [...units][0] : null, compatibilityStatus: aggregateCompatibility(opportunities), mappingOpportunities: opportunities }
}

function transformTrack(track: AnalysisTrack, transformation: AnalysisTransformation): AnalysisTrack {
  if (transformation === 'raw') return track
  const numbers = track.values.flatMap((value) => value.numericValue === undefined ? [] : [value.numericValue])
  if (!numbers.length) return track
  const min = Math.min(...numbers); const max = Math.max(...numbers)
  const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length
  const deviation = Math.sqrt(numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / numbers.length)
  return { ...track, values: track.values.map((value) => value.numericValue === undefined ? value : {
    ...value,
    numericValue: transformation === 'normalize' ? (max === min ? 50 : ((value.numericValue - min) / (max - min)) * 100) : (deviation === 0 ? 0 : (value.numericValue - mean) / deviation),
  }) }
}

export function buildAnalysisView(data: TrendsData, selectedIds: readonly string[], range: TrendRange, today: string, transformation: AnalysisTransformation): AnalysisView {
  const options = analysisSeriesOptions(data)
  const tracks = selectedIds.flatMap((id) => {
    const descriptor = options.find((option) => option.id === id)
    return descriptor ? [buildAnalysisTrack(data, descriptor, range, today)] : []
  })
  const quantitative = tracks.every((track) => ['continuous', 'ordinal', 'count', 'duration'].includes(track.descriptor.measurementType))
  const rawComparable = new Set(tracks.map((track) => `${track.descriptor.measurementType}:${track.unit ?? ''}`)).size === 1
  const layout = tracks.length > 1 && quantitative && (transformation !== 'raw' || rawComparable) ? 'overlay' : 'stacked'
  const transformed = layout === 'overlay' ? tracks.map((track) => transformTrack(track, transformation)) : tracks
  return { tracks: transformed, layout, transformation, dates: [...new Set(tracks.flatMap((track) => track.values.map((value) => value.localDate)))].sort() }
}

export function expandMultiSelectPresence(track: AnalysisTrack): readonly { optionId: string; label: string; localDate: string; present: boolean }[] {
  const options = new Map(track.lanes.map((lane) => [lane.id, lane.label]))
  return track.values.flatMap((value) => {
    const selected = new Set((value.categories ?? []).map((category) => category.id))
    return [...options].map(([optionId, label]) => ({ optionId, label, localDate: value.localDate, present: selected.has(optionId) }))
  })
}
