import type { TrendsData } from '../AnalyticsProvider.ts'
import { analysisSeriesOptions } from '../analysisModel.ts'
import { defaultRelationshipPolicy, discoverRelationships } from '../relationships/relationshipDiscovery.ts'
import type { RelationshipCandidate, RelationshipCatalog, TargetChangePoint } from '../relationships/relationshipTypes.ts'
import { candidateQuality, familyDiagnostics, groupRelationshipFamilies, type CandidateInsightDiagnostic, type RelationshipFamily } from './insightFamilies.ts'
import { changePointIdentity, matchingFamilyReview, matchingReview, type RelationshipReview } from './insightReview.ts'

export type InsightItem = { kind: 'relationship'; identity: string; family: RelationshipFamily; candidate: RelationshipCandidate } | { kind: 'change-point'; identity: string; point: TargetChangePoint }
export type InsightEmptyReason = 'not-enough-data' | 'nothing-strong' | 'all-reviewed'
export interface InsightFeed {
  /** Initial suggested session, never a live auto-backfilling queue. */
  queue: InsightItem[]
  available: InsightItem[]
  reviewed: { item: InsightItem | null; review: RelationshipReview }[]
  families: RelationshipFamily[]
  diagnostics: CandidateInsightDiagnostic[]
  emptyReason: InsightEmptyReason
}

function itemScore(item: InsightItem): number {
  return item.kind === 'relationship' ? candidateQuality(item.candidate) : 150 + item.point.strength * 12 + Math.min(item.point.preCount, item.point.postCount) / 10
}
function targetParent(item: InsightItem): string { return item.kind === 'relationship' ? item.family.targetParentId : item.point.target.ownerTrackableId ?? item.point.target.trackableId }
function predictorSource(item: InsightItem): string { return item.kind === 'relationship' ? item.family.predictorSourceKey : `change:${targetParent(item)}` }

/** Diversity is a selection constraint, not deletion. Later batches can draw from the same ranked backlog. */
export function selectReviewBatch(available: readonly InsightItem[], size = 3, excludeIdentities: readonly string[] = []): InsightItem[] {
  const limit = Math.max(0, Math.min(5, size))
  const sorted = available.filter((item) => !excludeIdentities.includes(item.identity)).sort((a, b) => itemScore(b) - itemScore(a) || a.identity.localeCompare(b.identity))
  const selected: InsightItem[] = []
  const passes = [{ maxPerTarget: 1, distinctPredictor: true }, { maxPerTarget: 1, distinctPredictor: false }, { maxPerTarget: 2, distinctPredictor: true }, { maxPerTarget: 2, distinctPredictor: false }, { maxPerTarget: Infinity, distinctPredictor: false }]
  for (const pass of passes) for (const item of sorted) {
    if (selected.length >= limit) return selected
    if (selected.some((chosen) => chosen.identity === item.identity)) continue
    if (selected.filter((chosen) => targetParent(chosen) === targetParent(item)).length >= pass.maxPerTarget) continue
    if (pass.distinctPredictor && selected.some((chosen) => predictorSource(chosen) === predictorSource(item))) continue
    selected.push(item)
  }
  return selected
}

/** A session retains its original identities; reviewing one never pulls from the backlog. */
export function remainingReviewBatch(batchIds: readonly string[], available: readonly InsightItem[]): InsightItem[] {
  return batchIds.flatMap((identity) => available.find((item) => item.identity === identity) ?? [])
}

export function buildInsightFeed(catalogs: readonly RelationshipCatalog[], reviews: readonly RelationshipReview[], data?: TrendsData, batchSize = 3, preparedFamilies?: readonly RelationshipFamily[]): InsightFeed {
  const families = preparedFamilies ? [...preparedFamilies] : groupRelationshipFamilies(catalogs, data)
  const familyItems: InsightItem[] = families.map((family) => ({ kind: 'relationship', identity: family.identity, family, candidate: family.representative }))
  const changes: InsightItem[] = catalogs.flatMap((catalog) => catalog.changePoints.map((point): InsightItem => ({ kind: 'change-point', identity: changePointIdentity(point), point })))
  const reviewed = reviews.map((review) => ({ review, item: review.kind === 'relationship'
    ? familyItems.find((item) => item.kind === 'relationship' && matchingFamilyReview(item.family, [review])) ?? null
    : changes.find((item) => item.kind === 'change-point' && matchingReview(item.identity, 'change-point', [review], item.point)) ?? null }))
  const available = [...familyItems.filter((item) => item.kind === 'relationship' && item.family.surfaceable && !matchingFamilyReview(item.family, reviews)),
    ...changes.filter((item) => item.kind === 'change-point' && item.point.strength >= 4 && Math.min(item.point.preCount, item.point.postCount) >= 15 && !matchingReview(item.identity, 'change-point', reviews, item.point))]
    .sort((a, b) => itemScore(b) - itemScore(a) || a.identity.localeCompare(b.identity))
  const queue = selectReviewBatch(available, batchSize)
  const selected = new Set(queue.map((item) => item.identity))
  const familyByIdentity = new Map(families.map((family) => [family.identity, family]))
  const diagnostics = familyDiagnostics(families).map((entry): CandidateInsightDiagnostic => {
    const family = familyByIdentity.get(entry.familyIdentity)!
    return { ...entry, reason: entry.reason ?? (matchingFamilyReview(family, reviews) ? 'already-reviewed-family' : !selected.has(family.identity)
      ? queue.some((item) => targetParent(item) === family.targetParentId) ? 'diversity-cap' : 'batch-limit' : null) }
  })
  const hasEnoughData = catalogs.some((catalog) => catalog.candidates.some((candidate) => candidate.support.sampleSize >= defaultRelationshipPolicy.minimumUsable) || catalog.changePoints.length > 0)
  return { queue, available, reviewed, families, diagnostics, emptyReason: !hasEnoughData ? 'not-enough-data' : available.length === 0 && reviewed.length ? 'all-reviewed' : 'nothing-strong' }
}

/** Discovery remains feature-level and derived; no candidate is persisted or removed for UI convenience. */
export function discoverInsightCatalogs(data: TrendsData): RelationshipCatalog[] {
  const options = analysisSeriesOptions(data)
  const dates = data.logRecords.map((record) => record.localDate).sort()
  if (!dates.length) return []
  const startDate = dates[0]
  const endDate = dates.at(-1)!
  return options.map((option) => discoverRelationships(data, { targetDescriptorId: option.id, startDate, endDate, asOfDate: endDate }))
}
