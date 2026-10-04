import type { RelationshipCandidate, TargetChangePoint } from '../relationships/relationshipTypes.ts'
import type { FeatureTransformation } from '../features/featureTypes.ts'
import type { RelationshipFamily } from './insightFamilies.ts'
import { relationshipFamilyIdentityFromParts } from './insightFamilies.ts'

export type ReviewJudgment = 'yes' | 'probably' | 'unknown' | 'probably-not' | 'no'
export type ReviewConfidence = 'low' | 'medium' | 'high'
export type ReviewLifecycle = 'supported' | 'uncertain' | 'questioned'

export interface RelationshipReview {
  id: string
  relationshipIdentity: string
  kind: 'relationship' | 'change-point'
  targetDescriptorId: string
  targetTrackableId: string
  predictorFeatureKey?: string
  predictorTrackableId?: string
  predictorDescriptorId?: string
  predictorTransformation?: FeatureTransformation
  technicalCandidateIdAtReview?: string
  changeDate?: string
  changeDirection?: 'higher' | 'lower'
  judgment: ReviewJudgment
  confidence: ReviewConfidence
  evidenceSignature: string
  titleAtReview: string
  createdAt: string
  updatedAt: string
}

/** Exact generated-feature identity, retained for modeling and diagnostics. */
export function relationshipIdentity(candidate: RelationshipCandidate): string { return candidate.id }

function legacyFamilyIdentity(review: RelationshipReview): string | null {
  if (review.kind !== 'relationship' || !review.relationshipIdentity.startsWith('relationship/') || !review.predictorTransformation) return null
  const parts = review.relationshipIdentity.split('/')
  if (parts.length !== 4) return null
  let targetDescriptorId: string; let optionId: string
  try { targetDescriptorId = decodeURIComponent(parts[1]); optionId = decodeURIComponent(parts[2]) } catch { return null }
  if (targetDescriptorId !== review.targetDescriptorId) return null
  let direction: unknown
  try { direction = JSON.parse(review.evidenceSignature)[1] } catch { return null }
  if (direction !== 'positive' && direction !== 'negative' && direction !== 'none') return null
  const source = review.predictorDescriptorId ?? review.predictorTrackableId
  if (!source && review.predictorTransformation.kind !== 'calendar' && review.predictorTransformation.kind !== 'event') return null
  return relationshipFamilyIdentityFromParts(targetDescriptorId, optionId || undefined, source, review.predictorTransformation, direction)
}

/** Before this refinement, local reviews used exact candidate IDs. Recognize and normalize those without touching observations. */
export function matchingFamilyReview(family: RelationshipFamily, reviews: readonly RelationshipReview[]): RelationshipReview | undefined {
  return reviews.find((review) => review.kind === 'relationship' && (review.relationshipIdentity === family.identity || legacyFamilyIdentity(review) === family.identity || family.members.some((member) => member.id === review.relationshipIdentity)))
}

export function normalizeLegacyReview(review: RelationshipReview, families: readonly RelationshipFamily[]): RelationshipReview {
  if (review.kind !== 'relationship' || review.relationshipIdentity.startsWith('family/')) return review
  const derived = legacyFamilyIdentity(review)
  const family = families.find((item) => item.identity === derived || item.members.some((member) => member.id === review.relationshipIdentity))
  return family ? { ...review, relationshipIdentity: family.identity, technicalCandidateIdAtReview: review.relationshipIdentity } : review
}

/** Change dates are approximate. Reconnection also checks same target/direction within seven days. */
export function changePointIdentity(point: TargetChangePoint): string {
  return `change/${encodeURIComponent(point.target.descriptorId)}/${encodeURIComponent(point.target.optionId ?? '')}/${point.effect >= 0 ? 'higher' : 'lower'}/${point.date}`
}

export function matchingReview(identity: string, kind: RelationshipReview['kind'], reviews: readonly RelationshipReview[], point?: TargetChangePoint): RelationshipReview | undefined {
  const exact = reviews.find((review) => review.relationshipIdentity === identity)
  if (exact || kind !== 'change-point' || !point) return exact
  return reviews.find((review) => review.kind === 'change-point' && review.targetDescriptorId === point.target.descriptorId && review.changeDirection === (point.effect >= 0 ? 'higher' : 'lower') && review.changeDate && Math.abs(Date.parse(`${review.changeDate}T00:00:00Z`) - Date.parse(`${point.date}T00:00:00Z`)) <= 7 * 86400000)
}

export function reviewLifecycle(judgment: ReviewJudgment): ReviewLifecycle {
  return judgment === 'unknown' ? 'uncertain' : judgment === 'yes' || judgment === 'probably' ? 'supported' : 'questioned'
}

/** Bounded prior for a later model; it must never override observed evidence. */
export function reviewFeedbackWeight(review: Pick<RelationshipReview, 'judgment' | 'confidence'>): number {
  const base: Record<ReviewJudgment, number> = { yes: 1, probably: .5, unknown: 0, 'probably-not': -.5, no: -1 }
  const confidence: Record<ReviewConfidence, number> = { low: .2, medium: .4, high: .6 }
  return base[review.judgment] * confidence[review.confidence]
}

export function evidenceSignature(candidate: RelationshipCandidate | TargetChangePoint): string {
  if ('predictor' in candidate) return JSON.stringify([candidate.strength, candidate.effectDirection, Math.round((candidate.improvement ?? 0) * 10), Math.floor(candidate.support.sampleSize / 10)])
  return JSON.stringify([candidate.effect >= 0 ? 'higher' : 'lower', Math.floor(candidate.strength), Math.floor(Math.min(candidate.preCount, candidate.postCount) / 10)])
}

export function upsertReview(existing: RelationshipReview | undefined, draft: Omit<RelationshipReview, 'id' | 'createdAt' | 'updatedAt'>, now: string): RelationshipReview {
  return { ...draft, id: existing?.id ?? crypto.randomUUID(), createdAt: existing?.createdAt ?? now, updatedAt: now }
}
