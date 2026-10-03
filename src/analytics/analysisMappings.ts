import type { AnalysisValueMapping, AnalysisValueMappingEntry } from '../domain/models/index.ts'
import type { AnalysisMeasurementType, AnalysisValue } from './analysisModel.ts'

export type AnalysisMappingCompatibility = 'supported' | 'incompatible'

export function analysisMappingId(trackableId: string, sourceVersion: number, targetVersion: number): string {
  return `analysis-mapping:${encodeURIComponent(trackableId)}:${sourceVersion}:${targetVersion}`
}

/** Mapping is deliberately narrow: scalar numeric/ordinal/category sources into category/ordinal targets. */
export function analysisMappingCompatibility(source: AnalysisMeasurementType | null, target: AnalysisMeasurementType | null): AnalysisMappingCompatibility {
  if (!source || !target || !['nominal-single', 'ordinal'].includes(target)) return 'incompatible'
  return ['continuous', 'count', 'ordinal', 'nominal-single'].includes(source) ? 'supported' : 'incompatible'
}

export function sourceKeyForAnalysisValue(value: AnalysisValue): string | null {
  const category = value.categories?.length === 1 ? value.categories[0] : null
  if (category) return `option:${category.id}`
  if (value.numericValue !== undefined && ['continuous', 'count', 'ordinal'].includes(value.measurementType)) return `number:${value.numericValue}`
  return null
}

export function applyAnalysisMapping(value: AnalysisValue, mapping: AnalysisValueMapping): AnalysisValue | null {
  const sourceValue = sourceKeyForAnalysisValue(value)
  if (!sourceValue) return null
  const entry = mapping.valueMappings.find((item) => item.sourceValue === sourceValue)
  if (!entry) return null
  const label = entry.label ?? entry.mappedValue
  const numericValue = mapping.targetMeasurementType === 'ordinal'
    ? mapping.ordinalOrder?.indexOf(entry.mappedValue)
    : undefined
  if (mapping.targetMeasurementType === 'ordinal' && (numericValue === undefined || numericValue < 0)) return null
  return {
    ...value,
    display: label,
    measurementType: mapping.targetMeasurementType,
    categories: [{ id: entry.mappedValue, label }],
    numericValue,
    booleanValue: undefined,
    rawDisplay: value.display,
    rawMeasurementType: value.measurementType,
    rawNumericValue: value.numericValue,
    sourceValue,
    analysisMappingId: mapping.id,
    userMapped: true,
  }
}

export function mappingCoverage(sourceValues: readonly string[], entries: readonly AnalysisValueMappingEntry[]): { mapped: number; total: number; percent: number } {
  const mappedKeys = new Set(entries.map((entry) => entry.sourceValue))
  const mapped = sourceValues.filter((value) => mappedKeys.has(value)).length
  const total = sourceValues.length
  return { mapped, total, percent: total === 0 ? 100 : Math.round((mapped / total) * 100) }
}

export function validateMappingEntries(entries: readonly AnalysisValueMappingEntry[], targetValues: ReadonlySet<string>, ordinalOrder?: readonly string[]): string | null {
  const sourceKeys = new Set<string>()
  for (const entry of entries) {
    if (!entry.sourceValue || sourceKeys.has(entry.sourceValue)) return 'Each historical value may be mapped only once.'
    if (!targetValues.has(entry.mappedValue)) return 'A mapped value does not exist in the target definition.'
    sourceKeys.add(entry.sourceValue)
  }
  if (ordinalOrder) {
    if (ordinalOrder.length !== targetValues.size || new Set(ordinalOrder).size !== ordinalOrder.length || ordinalOrder.some((value) => !targetValues.has(value))) return 'Ordinal order must include every target value exactly once.'
  }
  return null
}
