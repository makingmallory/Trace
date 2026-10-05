import type { AnalysisMeasurementType } from '../analysisModel.ts'
import type { RelationshipReview } from '../insights/insightReview.ts'

export type ForecastTargetKind = 'numeric' | 'ordinal' | 'binary' | 'nominal' | 'multiselect'
export type ForecastModelKind = 'baseline' | 'ridge' | 'logistic'
export type ForecastConfidence = 'low' | 'moderate' | 'high'
export type ForecastStatus = 'ready' | 'insufficient-history' | 'not-forecastable'
export type ForecastCapability = 'basic' | 'validated' | 'model'
export type ForecastUncertaintyMethod = 'holdout-residuals' | 'recent-dispersion' | 'target-fallback' | 'not-applicable'
export type ForecastHorizonState = 'ready' | 'rough' | 'insufficient'
export type ForecastFeatureAvailability = 'calendar-known' | 'historically-known' | 'recursive-target' | 'unavailable-future'

export interface ForecastPolicy {
  minimumBaselineNumeric: number
  minimumBaselineCategorical: number
  minimumRecentObservations: number
  recentCoverageDays: number
  maximumLatestAgeDays: number
  minimumTraining: number
  minimumValidation: number
  minimumFolds: number
  maximumFolds: number
  minimumClassCases: number
  maximumMissingness: number
  recentWindow: number
  prevalenceWindow: number
  regularization: readonly number[]
  maximumPredictors: number
  minimumResidualSupport: number
  horizonObservationStep: number
  minimumHorizonCalibration: number
}

export interface ForecastTarget {
  descriptorId: string
  trackableId: string
  label: string
  measurementType: AnalysisMeasurementType
  kind: ForecastTargetKind
  options?: readonly { id: string; label: string }[]
  minimum?: number
  maximum?: number
}

export interface ForecastFold {
  trainEnd: string
  validationStart: string
  validationEnd: string
  baselineScore: number
  modelScore: number
  validationCount: number
  baselineResiduals: readonly number[]
  modelResiduals: readonly number[]
}

export interface ForecastFeatureSummary {
  key: string
  label: string
  coefficient: number
  source: 'self-history' | 'calendar' | 'relationship'
  reviewWeight?: number
}

export interface ForecastDiagnostics {
  usableObservations: number
  missingness: number
  folds: readonly ForecastFold[]
  reviewedFeatureFeedback: readonly { featureKey: string; judgment: RelationshipReview['judgment']; confidence: RelationshipReview['confidence']; weight: number; validationOverrode: boolean }[]
  excludedFeatureKeys: readonly string[]
  capability?: ForecastCapability
  uncertaintyMethod?: ForecastUncertaintyMethod
  uninformativeRange?: boolean
  limitedVariation?: boolean
  horizon?: number
  horizonCalibrationCount?: number
  horizonCalibrationError?: number
  recursiveInputs?: readonly RecursiveForecastInput[]
  featureAvailability?: readonly { featureKey: string; availability: ForecastFeatureAvailability }[]
}

export interface RecursiveForecastInput {
  sourceHorizon: number
  forecastDate: string
  kind: ForecastPrediction['kind']
  value: number | string | readonly string[]
  uncertainty: number
}

export interface NumericPrediction { kind: 'numeric'; estimate: number; likelyLow: number; likelyHigh: number; label?: string }
export interface OrdinalPrediction { kind: 'ordinal'; estimate: number; likelyLow: number; likelyHigh: number; label?: string }
export interface BinaryPrediction { kind: 'binary'; probability: number }
export interface NominalPrediction { kind: 'nominal'; probabilities: readonly { id: string; label: string; probability: number }[] }
export interface MultiSelectPrediction { kind: 'multiselect'; probabilities: readonly { id: string; label: string; probability: number }[] }
export type ForecastPrediction = NumericPrediction | OrdinalPrediction | BinaryPrediction | NominalPrediction | MultiSelectPrediction

export interface ForecastResult {
  status: ForecastStatus
  target: ForecastTarget
  forecastDate: string
  generatedAt: string
  dataCutoffDate: string
  prediction?: ForecastPrediction
  confidence?: ForecastConfidence
  selectedModelKind?: ForecastModelKind
  baselineModel: 'persistence' | 'recent-mean' | 'recent-prevalence'
  validationMetric?: 'mae' | 'brier' | 'multiclass-brier'
  validationScore?: number
  baselineScore?: number
  improvement?: number
  regimeStrategy?: 'full-history' | 'current-regime'
  contributors: readonly ForecastFeatureSummary[]
  warnings: readonly string[]
  diagnostics: ForecastDiagnostics
}

export interface HorizonForecastResult extends ForecastResult {
  horizon: number
  horizonState: ForecastHorizonState
  usedRecursiveInputs: boolean
}

export interface ForecastWeekResult {
  target: ForecastTarget
  days: readonly HorizonForecastResult[]
  weeklyConfidence: ForecastConfidence
  confidenceSummary: string
  summary: string
}

export interface ForecastRangeRequest extends Omit<ForecastRequest, 'forecastDate'> {
  horizonDays: number
}

export interface ForecastRequest {
  forecastDate: string
  asOfDate: string
  /** Internal multi-step context; omitted by the stable one-step API and therefore defaults to h1. */
  horizon?: number
  /** Root cutoff for training outcomes during recursion; predicted rows after this date are feature inputs only. */
  historyCutoffDate?: string
  asOfTimestamp?: string
  targetDescriptorIds?: readonly string[]
  reviews?: readonly RelationshipReview[]
  policy?: Partial<ForecastPolicy>
}
