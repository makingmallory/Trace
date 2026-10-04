import type { AnalysisMeasurementType } from '../analysisModel.ts'

export type FeatureFamily = 'lag' | 'rolling' | 'event' | 'calendar'
export type FeatureValueType = 'number' | 'boolean' | 'ordinal-rank'
export type FeatureMissingness =
  | 'observed'
  | 'observed-zero'
  | 'no-recorded-event'
  | 'explicit-no'
  | 'no-check-in'
  | 'unanswered'
  | 'skipped'
  | 'not-presented'
  | 'unavailable'
  | 'unknown'
  | 'no-observation'
  | 'unmapped'
  | 'no-prior-event'
  | 'insufficient-observations'

export interface FeatureSource {
  /** Stable AnalysisSeriesDescriptor identity; structured fields include owner/version identity. */
  descriptorId: string
  trackableId: string
  ownerTrackableId?: string
  fieldTrackableId?: string
  measurementType: AnalysisMeasurementType
}

export interface EventPredicate {
  ownerTrackableId: string
  fieldDescriptorId?: string
  fieldTrackableId?: string
  optionId?: string
}

export type FeatureTransformation =
  | { kind: 'lag'; days: number; encoding: 'numeric' | 'binary' | 'ordinal-rank' | 'category-indicator' | 'multi-indicator'; optionId?: string }
  | { kind: 'rolling'; days: number; statistic: 'mean' | 'min' | 'max' | 'standard-deviation' | 'observed-count' | 'slope'; minimumObservations: number }
  | { kind: 'event'; statistic: 'occurred-today' | 'count-today' | 'days-since' | 'count-window' | 'post-window'; predicate: EventPredicate; days?: number }
  | { kind: 'calendar'; statistic: 'weekend' | 'cyclic'; period?: 'weekday' | 'month' | 'day-of-month'; component?: 'sin' | 'cos'; pairKey?: string }

export interface FeatureDefinition {
  key: string
  label: string
  description: string
  family: FeatureFamily
  source?: FeatureSource
  transformation: FeatureTransformation
  valueType: FeatureValueType
  /** Ordinal ranks preserve order only; callers must not assume equal intervals. */
  ordinalDistanceMeaningful?: false
}

export interface FeatureProvenance {
  recordId: string
  observationId?: string
  localDate: string
  trackableId: string
  trackableVersion: number
  mappingId?: string
  rawValue?: string
  canonicalValue: string
}

export interface FeatureCell {
  value: number | boolean | null
  missingness: FeatureMissingness
  /** Every contributing observation/event; empty for calendar and observed-zero counts. */
  provenance: readonly FeatureProvenance[]
  observedCount?: number
}

export interface FeatureRow {
  date: string
  /** End-of-day snapshot in local-date semantics, bounded by the request cutoff. */
  asOfDate: string
  cells: Readonly<Record<string, FeatureCell>>
}

export interface LongitudinalFeatureFrame {
  dates: readonly string[]
  catalog: readonly FeatureDefinition[]
  rows: readonly FeatureRow[]
  /** Candidates skipped by the global feature limit. */
  omittedCandidateCount: number
}

export interface FeaturePolicy {
  lagDays: readonly number[]
  categoricalLagDays: readonly number[]
  rollingDays: readonly number[]
  eventCountDays: readonly number[]
  postEventDays: readonly number[]
  maximumCategoricalCardinality: number
  maximumStructuredPredicates: number
  maximumFeatures: number
  families: readonly FeatureFamily[]
}

export interface FeatureGenerationRequest {
  startDate: string
  endDate: string
  /** Last local date whose observations may enter any feature. */
  asOfDate: string
  /** Optional strict knowledge cutoff for records, observations, definitions, and mappings. */
  asOfTimestamp?: string
  trackableIds?: readonly string[]
  /** When set, same-day features from this target are excluded; its past lags remain available. */
  targetTrackableId?: string
  policy?: Partial<FeaturePolicy>
}
