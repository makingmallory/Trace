import type { AnalysisMeasurementType } from '../analysisModel.ts'
import type { EventPredicate, FeatureDefinition, FeatureFamily, FeatureGenerationRequest, FeatureMissingness } from '../features/featureTypes.ts'

export type TargetKind = 'numeric' | 'ordinal' | 'binary'
export type ScreeningReason = 'insufficient-history' | 'insufficient-classes' | 'insufficient-category-support' | 'sparse-event' | 'constant-predictor' | 'insufficient-folds' | 'no-improvement' | 'negligible-effect' | 'unstable' | 'redundant'
export type RelationshipStrength = 'insufficient' | 'weak' | 'moderate' | 'strong'

export interface RelationshipPolicy {
  minimumUsable: number
  minimumClassCases: number
  minimumCategoryCases: number
  minimumEventOccurrences: number
  minimumEventEpisodes: number
  minimumTraining: number
  minimumValidation: number
  minimumFolds: number
  maximumFolds: number
  minimumImprovement: number
  minimumStandardizedEffect: number
  moderateStandardizedEffect: number
  strongStandardizedEffect: number
  moderateImprovement: number
  strongImprovement: number
  minimumFoldWinRate: number
  minimumEffectConsistency: number
  redundancyCorrelation: number
  minimumChangeSide: number
  minimumChangeEffect: number
  minimumBinaryRateShift: number
  nearbyEventDays: number
}

export interface RelationshipRequest extends Omit<FeatureGenerationRequest, 'targetTrackableId' | 'trackableIds'> {
  targetDescriptorId: string
  sourceTrackableIds?: readonly string[]
  featureFamilies?: readonly FeatureFamily[]
  relationshipPolicy?: Partial<RelationshipPolicy>
  /** Future callers may choose full history or the detected current regime. */
  evaluateCurrentRegime?: boolean
}

export interface RelationshipTarget {
  descriptorId: string
  trackableId: string
  ownerTrackableId?: string
  label: string
  measurementType: AnalysisMeasurementType
  kind: TargetKind
  /** Nominal and multi-select outcomes are independent one-versus-rest indicators. */
  optionId?: string
  optionLabel?: string
}

export interface RelationshipFold {
  trainStart: string
  trainEnd: string
  validationStart: string
  validationEnd: string
  trainingCount: number
  validationCount: number
  baselineScore: number
  candidateScore: number
  improvement: number
  effect: number
}

export interface RelationshipSupport {
  sampleSize: number
  firstDate: string | null
  lastDate: string | null
  missingnessRate: number
  mappedHistoricalValues: boolean
  predictorStatusCounts: Partial<Record<FeatureMissingness, number>>
  targetPositiveCount?: number
  targetNegativeCount?: number
  eventCount?: number
  eventEpisodes?: number
  targetObservations?: number
}

export interface ChangePointEventContext {
  eventRecordId: string
  ownerTrackableId: string
  label: string
  predicate?: EventPredicate
  daysFromChange: number
  repeatedSupport: number
  /** Temporal proximity only; never a causal assertion. */
  relation: 'nearby-in-time'
}

export interface TargetChangePoint {
  id: string
  target: RelationshipTarget
  date: string
  preCount: number
  postCount: number
  preCenter: number
  postCenter: number
  effect: number
  strength: number
  supportStart: string
  supportEnd: string
  nearbyEvents: readonly ChangePointEventContext[]
}

export interface TargetRegime {
  targetId: string
  startDate: string
  endDate: string
  observationCount: number
  current: boolean
}

export interface RelationshipCandidate {
  id: string
  target: RelationshipTarget
  predictor: FeatureDefinition
  status: 'screened_out' | 'candidate' | 'observed'
  reason?: ScreeningReason
  strength: RelationshipStrength
  support: RelationshipSupport
  rawAssociation: { method: 'spearman' | 'point-biserial' | 'rate-difference' | 'pearson'; value: number | null }
  effectDirection: 'positive' | 'negative' | 'none'
  effectMagnitude: number | null
  standardizedEffect: number | null
  primaryMetric: 'mae' | 'brier' | 'ordinal-brier'
  baselineScore: number | null
  validationScore: number | null
  improvement: number | null
  stability: { foldWinRate: number; directionConsistency: number; effectConsistency: number }
  folds: readonly RelationshipFold[]
  currentRegimeSupport?: RelationshipSupport
  currentRegimeValidation?: { folds: readonly RelationshipFold[]; baselineScore: number; candidateScore: number; improvement: number }
  changePointIds: readonly string[]
  suppressedBy?: string
  explanation: { targetLabel: string; predictorLabel: string; temporalQualifier: string; direction: 'positive' | 'negative' | 'none'; magnitude: number | null; supportCount: number; validationConfidence: RelationshipStrength }
  /** Dates are retained for developer inspection, not persisted or synced. */
  alignedDates: readonly string[]
}

export interface RelationshipCatalog {
  targetDescriptorId: string
  candidates: readonly RelationshipCandidate[]
  ranked: readonly RelationshipCandidate[]
  changePoints: readonly TargetChangePoint[]
  regimes: Readonly<Record<string, readonly TargetRegime[]>>
  diagnostics: { featureCount: number; targetOutcomeCount: number; alignedPairCount: number; omittedFeatureCount: number }
}
