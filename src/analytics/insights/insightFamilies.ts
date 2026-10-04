import type { TrendsData } from '../AnalyticsProvider.ts'
import { analysisSeriesOptions } from '../analysisModel.ts'
import { defaultRelationshipPolicy } from '../relationships/relationshipDiscovery.ts'
import type { RelationshipCandidate, RelationshipCatalog } from '../relationships/relationshipTypes.ts'
import type { FeatureTransformation } from '../features/featureTypes.ts'
import { routineCoverage, type RoutineCoverage } from './insightCoverage.ts'

export type PredictorSemanticClass = 'substantive-value' | 'event-occurrence' | 'data-availability' | 'calendar-context'
export type InsightSuppressionReason = 'logging-density' | 'technical-calendar' | 'redundancy' | 'insufficient-strength-support' | 'grouped-variant' | 'already-reviewed-family' | 'diversity-cap' | 'batch-limit'
export interface CandidateInsightDiagnostic { candidateId: string; familyIdentity: string; reason: InsightSuppressionReason | null }
export interface RelationshipFamily {
  identity: string
  targetKey: string
  targetParentId: string
  predictorSourceKey: string
  sourceLabel: string
  semanticClass: PredictorSemanticClass
  broadFamily: string
  direction: 'positive' | 'negative' | 'none'
  members: readonly RelationshipCandidate[]
  representative: RelationshipCandidate
  surfaceable: boolean
  suppressionReason: InsightSuppressionReason | null
  suppressionDetail?: string
  routineCoverage?: RoutineCoverage
  temporalSummary: string
  nearbyWindowsTied: boolean
  groupingReason: string
}

const tier = { insufficient: 0, weak: 1, moderate: 2, strong: 3 }

export function candidateQuality(candidate: RelationshipCandidate): number {
  return tier[candidate.strength] * 100 + (candidate.improvement ?? 0) * 100 + candidate.stability.foldWinRate * 12 + candidate.stability.directionConsistency * 8
    + Math.abs(candidate.standardizedEffect ?? 0) * 10 + Math.min(candidate.support.sampleSize, 100) / 15
}

function meaningFor(transform: FeatureTransformation, source: string, effectDirection: RelationshipFamily['direction']): { semanticClass: PredictorSemanticClass; broadFamily: string; sourceKey: string; direction: RelationshipFamily['direction'] } {
  if (transform.kind === 'rolling' && transform.statistic === 'observed-count') return { semanticClass: 'data-availability', broadFamily: 'answer-density', sourceKey: source, direction: effectDirection }
  if (transform.kind === 'event') {
    const predicate = transform.predicate
    const sourceKey = JSON.stringify([predicate.ownerTrackableId, predicate.fieldDescriptorId ?? '', predicate.fieldTrackableId ?? '', predicate.optionId ?? ''])
    const broadFamily = transform.statistic === 'count-today' || transform.statistic === 'count-window' ? 'event-frequency' : 'event-proximity'
    const direction = transform.statistic === 'days-since' ? effectDirection === 'positive' ? 'negative' : effectDirection === 'negative' ? 'positive' : 'none' : effectDirection
    return { semanticClass: 'event-occurrence', broadFamily, sourceKey, direction }
  }
  if (transform.kind === 'calendar') return { semanticClass: 'calendar-context', broadFamily: transform.statistic === 'weekend' ? 'weekend' : 'cyclic-calendar', sourceKey: `${transform.statistic}/${transform.period ?? ''}`, direction: effectDirection }
  if (transform.kind === 'lag' && transform.optionId) return { semanticClass: 'substantive-value', broadFamily: 'option-presence', sourceKey: `${source}/${transform.optionId}`, direction: effectDirection }
  if (transform.kind === 'lag' && transform.encoding === 'binary') return { semanticClass: 'substantive-value', broadFamily: 'binary-state', sourceKey: source, direction: effectDirection }
  if (transform.kind === 'rolling' && transform.statistic === 'standard-deviation') return { semanticClass: 'substantive-value', broadFamily: 'value-variability', sourceKey: source, direction: effectDirection }
  if (transform.kind === 'rolling' && transform.statistic === 'slope') return { semanticClass: 'substantive-value', broadFamily: 'value-trend', sourceKey: source, direction: effectDirection }
  return { semanticClass: 'substantive-value', broadFamily: 'value-level', sourceKey: source, direction: effectDirection }
}

function predictorMeaning(candidate: RelationshipCandidate): ReturnType<typeof meaningFor> {
  return meaningFor(candidate.predictor.transformation, candidate.predictor.source?.descriptorId ?? candidate.predictor.source?.trackableId ?? 'none', candidate.effectDirection)
}

export function relationshipFamilyIdentityFromParts(targetDescriptorId: string, optionId: string | undefined, sourceDescriptorId: string | undefined, transformation: FeatureTransformation, direction: RelationshipFamily['direction']): string {
  const meaning = meaningFor(transformation, sourceDescriptorId ?? 'none', direction)
  return `family/${encodeURIComponent(JSON.stringify([targetDescriptorId, optionId ?? '', meaning.sourceKey, meaning.broadFamily, meaning.direction]))}`
}

export function relationshipFamilyIdentity(candidate: RelationshipCandidate): string {
  return relationshipFamilyIdentityFromParts(candidate.target.descriptorId, candidate.target.optionId, candidate.predictor.source?.descriptorId ?? candidate.predictor.source?.trackableId, candidate.predictor.transformation, candidate.effectDirection)
}

function fallbackSourceLabel(candidate: RelationshipCandidate): string {
  return candidate.predictor.label.split(' — ')[0].replace(/^(?:Average|Minimum|Maximum|Standard deviation of|Observed count of|Trend in) /, '').replace(/^Days since /, '')
}

function temporalEvidence(representative: RelationshipCandidate, members: readonly RelationshipCandidate[]): { summary: string; tied: boolean } {
  const transform = representative.predictor.transformation
  const nearby = members.filter((item) => item.id !== representative.id && item.effectDirection === representative.effectDirection
    && item.support.sampleSize >= representative.support.sampleSize * .7 && Math.abs((item.improvement ?? 0) - (representative.improvement ?? 0)) <= .04
    && Math.abs(item.stability.foldWinRate - representative.stability.foldWinRate) <= .15 && (item.status !== 'screened_out' || item.reason === 'redundant'))
  const windows = [representative, ...nearby].map((item) => item.predictor.transformation).filter((item): item is typeof transform & { days: number } => 'days' in item && typeof item.days === 'number').map((item) => item.days)
  if (windows.length > 1 && Math.min(...windows) !== Math.max(...windows)) {
    const shortest = Math.min(...windows); const longest = Math.max(...windows)
    if (transform.kind === 'rolling') return { summary: longest <= 42 ? `roughly the previous ${Math.max(1, Math.round(shortest / 7))}–${Math.max(1, Math.round(longest / 7))} weeks` : 'recent weeks to months', tied: true }
    return { summary: `roughly ${shortest}–${longest} days earlier`, tied: true }
  }
  if (transform.kind === 'rolling') return { summary: `the previous ${transform.days} days`, tied: false }
  if (transform.kind === 'lag') return { summary: `${transform.days} day${transform.days === 1 ? '' : 's'} earlier`, tied: false }
  if (transform.kind === 'event' && transform.days) return { summary: `within about ${transform.days} days of the event`, tied: false }
  return { summary: '', tied: false }
}

export function groupRelationshipFamilies(catalogs: readonly RelationshipCatalog[], data?: TrendsData): RelationshipFamily[] {
  const names = new Map(data ? analysisSeriesOptions(data).map((option) => [option.id, option.name]) : [])
  const byIdentity = new Map<string, RelationshipCandidate[]>()
  for (const candidate of catalogs.flatMap((catalog) => catalog.candidates)) {
    const identity = relationshipFamilyIdentity(candidate)
    byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), candidate])
  }
  const coverageCache = new Map<string, RoutineCoverage>()
  return [...byIdentity].map(([identity, members]): RelationshipFamily => {
    const ordered = [...members].sort((a, b) => candidateQuality(b) - candidateQuality(a) || a.id.localeCompare(b.id))
    const eligible = ordered.filter((item) => item.status !== 'screened_out' && !item.suppressedBy && tier[item.strength] >= 2 && item.support.sampleSize >= defaultRelationshipPolicy.minimumUsable)
    const representative = eligible[0] ?? ordered[0]
    const meaning = predictorMeaning(representative)
    const sourceTrackableId = representative.predictor.source?.trackableId
    let coverage: RoutineCoverage | undefined
    if (meaning.semanticClass === 'data-availability' && data && sourceTrackableId) {
      coverage = coverageCache.get(sourceTrackableId) ?? routineCoverage(data, sourceTrackableId)
      coverageCache.set(sourceTrackableId, coverage)
    }
    const suppressionReason: InsightSuppressionReason | null = meaning.semanticClass === 'data-availability' ? 'logging-density'
      : meaning.broadFamily === 'cyclic-calendar' ? 'technical-calendar' : eligible.length ? null
      : ordered.every((item) => item.reason === 'redundant') ? 'redundancy' : 'insufficient-strength-support'
    const temporal = temporalEvidence(representative, members)
    return { identity, targetKey: `${representative.target.descriptorId}/${representative.target.optionId ?? ''}`, targetParentId: representative.target.ownerTrackableId ?? representative.target.trackableId,
      predictorSourceKey: meaning.sourceKey, sourceLabel: meaning.broadFamily === 'value-level' || meaning.broadFamily === 'value-variability' || meaning.broadFamily === 'value-trend' || meaning.broadFamily === 'binary-state'
        ? names.get(representative.predictor.source?.descriptorId ?? '') ?? fallbackSourceLabel(representative) : fallbackSourceLabel(representative),
      semanticClass: meaning.semanticClass, broadFamily: meaning.broadFamily, direction: meaning.direction, members: ordered, representative,
      surfaceable: suppressionReason === null, suppressionReason,
      ...(suppressionReason === 'logging-density' ? { suppressionDetail: coverage?.routinelyAnswered
        ? `Expected routine question answered on ${coverage.answeredDays}/${coverage.eligibleDays} eligible completed Check-In days; observation count mainly tracks logging density.`
        : 'Answer count measures data availability rather than the recorded value; retained for diagnostics, not surfaced as a substantive insight.' } : {}),
      ...(coverage ? { routineCoverage: coverage } : {}), temporalSummary: temporal.summary, nearbyWindowsTied: temporal.tied,
      groupingReason: 'Same target option, predictor source and broad meaning; technical windows/statistics are retained as members.' }
  }).sort((a, b) => candidateQuality(b.representative) - candidateQuality(a.representative) || a.identity.localeCompare(b.identity))
}

export function familyDiagnostics(families: readonly RelationshipFamily[]): CandidateInsightDiagnostic[] {
  return families.flatMap((family) => family.members.map((candidate): CandidateInsightDiagnostic => ({ candidateId: candidate.id, familyIdentity: family.identity,
    reason: family.suppressionReason ?? (candidate.id !== family.representative.id ? candidate.reason === 'redundant' ? 'redundancy' : 'grouped-variant' : null) })))
}
