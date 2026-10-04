import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import type { TrendsData } from '../AnalyticsProvider.ts'
import type { FeatureTransformation } from '../features/featureTypes.ts'
import type { RelationshipCandidate, RelationshipCatalog, TargetChangePoint } from '../relationships/relationshipTypes.ts'
import { routineCoverage } from './insightCoverage.ts'
import { groupRelationshipFamilies, relationshipFamilyIdentity } from './insightFamilies.ts'
import { buildInsightFeed, remainingReviewBatch, selectReviewBatch, type InsightItem } from './insightFeed.ts'
import { changePointIdentity, evidenceSignature, matchingReview, normalizeLegacyReview, relationshipIdentity, reviewFeedbackWeight, reviewLifecycle, upsertReview, type RelationshipReview } from './insightReview.ts'
import { presentInsight } from './insightWording.ts'
import { IndexedDbRelationshipReviewRepository } from '../../data/local/IndexedDbRelationshipReviewRepository.ts'
import type { LogRecord, Observation, RoutineItem } from '../../domain/models/index.ts'

const target = { descriptorId: 'target', trackableId: 'target', label: 'Energy', measurementType: 'continuous' as const, kind: 'numeric' as const }
function candidate(key = 'lag-1', transformation: FeatureTransformation = { kind: 'lag', days: 1, encoding: 'numeric' }, overrides: Partial<RelationshipCandidate> = {}): RelationshipCandidate {
  const family = transformation.kind === 'event' ? 'event' : transformation.kind === 'calendar' ? 'calendar' : transformation.kind
  return { id: `relationship/target//${key}`, target, predictor: { key, label: transformation.kind === 'rolling' ? `Minimum Sleep — previous ${transformation.days} days` : 'Sleep — 1 day ago', description: 'A recorded Sleep value.', family, source: { descriptorId: 'sleep', trackableId: 'sleep', measurementType: 'continuous' }, transformation, valueType: 'number' }, status: 'candidate', strength: 'moderate',
    support: { sampleSize: 65, firstDate: '2026-01-01', lastDate: '2026-03-01', missingnessRate: 0, mappedHistoricalValues: false, predictorStatusCounts: {} }, rawAssociation: { method: 'pearson', value: .6 }, effectDirection: 'positive', effectMagnitude: .5, standardizedEffect: .6, primaryMetric: 'mae', baselineScore: 1, validationScore: .7, improvement: .3, stability: { foldWinRate: .8, directionConsistency: 1, effectConsistency: .7 }, folds: [], changePointIds: [], explanation: { targetLabel: 'Energy', predictorLabel: 'Sleep', temporalQualifier: '1 day earlier', direction: 'positive', magnitude: .5, supportCount: 65, validationConfidence: 'moderate' }, alignedDates: [], ...overrides }
}
function change(date = '2026-02-01'): TargetChangePoint { return { id: `change/target//${date}`, target, date, preCount: 30, postCount: 31, preCenter: 3, postCenter: 5, effect: 1.2, strength: 5, supportStart: '2026-01-01', supportEnd: '2026-03-01', nearbyEvents: [{ eventRecordId: 'event1', ownerTrackableId: 'procedure', label: 'Procedure', daysFromChange: -2, repeatedSupport: 1, relation: 'nearby-in-time' }] } }
function catalog(candidates: RelationshipCandidate[], points: TargetChangePoint[] = []): RelationshipCatalog { return { targetDescriptorId: 'target', candidates, ranked: candidates.filter((item) => item.status !== 'screened_out'), changePoints: points, regimes: {}, diagnostics: { featureCount: 1, targetOutcomeCount: 1, alignedPairCount: 300, omittedFeatureCount: 0 } } }
function item(c: RelationshipCandidate): InsightItem { const family = groupRelationshipFamilies([catalog([c])])[0]; return { kind: 'relationship', identity: family.identity, family, candidate: c } }
function review(c = candidate()): RelationshipReview { const insight = item(c); return upsertReview(undefined, { relationshipIdentity: insight.identity, kind: 'relationship', targetDescriptorId: c.target.descriptorId, targetTrackableId: c.target.trackableId, predictorFeatureKey: c.predictor.key, predictorDescriptorId: c.predictor.source?.descriptorId, predictorTrackableId: c.predictor.source?.trackableId, predictorTransformation: c.predictor.transformation, technicalCandidateIdAtReview: c.id, judgment: 'probably', confidence: 'medium', evidenceSignature: evidenceSignature(c), titleAtReview: presentInsight(insight).title }, '2026-03-01T00:00:00.000Z') }
const rolling = (days: number, statistic: 'min' | 'mean' | 'max' | 'observed-count' = 'min'): FeatureTransformation => ({ kind: 'rolling', days, statistic, minimumObservations: statistic === 'observed-count' ? 0 : 1 })

describe('human relationship families', () => {
  it('groups 14/30/90-day technical variants but keeps their exact IDs and strongest representative', () => {
    const fourteen = candidate('rolling-14', rolling(14), { improvement: .22 })
    const thirty = candidate('rolling-30', rolling(30), { improvement: .32 })
    const ninety = candidate('rolling-90', rolling(90), { improvement: .19 })
    const feed = buildInsightFeed([catalog([fourteen, thirty, ninety])], [])
    expect(feed.families).toHaveLength(1)
    expect(feed.families[0].representative.id).toBe(thirty.id)
    expect(feed.families[0].members.map((member) => member.id)).toEqual(expect.arrayContaining([fourteen.id, thirty.id, ninety.id]))
    expect(feed.queue).toHaveLength(1)
    expect(feed.diagnostics.find((entry) => entry.candidateId === fourteen.id)?.reason).toBe('grouped-variant')
    expect(relationshipIdentity(fourteen)).not.toBe(relationshipIdentity(thirty))
    expect(relationshipFamilyIdentity(fourteen)).toBe(relationshipFamilyIdentity(thirty))
    expect(relationshipFamilyIdentity(ninety)).toBe(relationshipFamilyIdentity(thirty))
  })
  it('describes nearly tied windows broadly rather than asking the person to judge a parameter', () => {
    const fourteen = candidate('rolling-14', rolling(14), { improvement: .3 })
    const thirty = candidate('rolling-30', rolling(30), { improvement: .32 })
    const insight = buildInsightFeed([catalog([fourteen, thirty])], []).queue[0]
    expect(insight.kind).toBe('relationship')
    if (insight.kind !== 'relationship') return
    expect(insight.family.nearbyWindowsTied).toBe(true)
    expect(insight.family.temporalSummary).toBe('roughly the previous 2–4 weeks')
    const wording = presentInsight(insight)
    expect(wording.title).toContain('during periods when Sleep was higher')
    expect(wording.title).not.toMatch(/min|14|30/i)
    expect(wording.context).toContain('2–4 weeks')
    expect(wording.details).toContain('strongest defensible representative')
  })
  it('keeps a review when the winning window changes and normalizes an old exact-ID review', () => {
    const fourteen = candidate('rolling-14', rolling(14), { improvement: .33 })
    const thirty = candidate('rolling-30', rolling(30), { improvement: .29 })
    const saved = review(fourteen)
    const later = [candidate('rolling-14', rolling(14), { improvement: .24 }), candidate('rolling-30', rolling(30), { improvement: .37 })]
    const feed = buildInsightFeed([catalog(later)], [saved])
    expect(feed.families[0].representative.id).toBe(thirty.id)
    expect(feed.queue).toEqual([])
    expect(feed.reviewed[0].item?.identity).toBe(saved.relationshipIdentity)
    expect(feed.diagnostics.some((entry) => entry.reason === 'already-reviewed-family')).toBe(true)
    const legacy = { ...saved, relationshipIdentity: fourteen.id, technicalCandidateIdAtReview: undefined }
    expect(buildInsightFeed([catalog(later)], [legacy]).queue).toEqual([])
    const normalized = normalizeLegacyReview(legacy, feed.families)
    expect(normalized.relationshipIdentity).toBe(saved.relationshipIdentity)
    expect(normalized.technicalCandidateIdAtReview).toBe(fourteen.id)
    expect(normalized.id).toBe(legacy.id)
    const onlyThirty = buildInsightFeed([catalog([later[1]])], [legacy])
    expect(onlyThirty.queue).toEqual([])
    expect(normalizeLegacyReview(legacy, onlyThirty.families).relationshipIdentity).toBe(saved.relationshipIdentity)
    expect(relationshipFamilyIdentity(candidate('lag-1'))).toBe(relationshipFamilyIdentity(thirty))
    expect(relationshipFamilyIdentity(candidate('other-source', rolling(30), { predictor: { ...thirty.predictor, source: { ...thirty.predictor.source!, descriptorId: 'medication', trackableId: 'medication' } } }))).not.toBe(saved.relationshipIdentity)
  })
  it('does not merge opposite directions or different target options', () => {
    const first = candidate('jaw', rolling(14), { target: { ...target, kind: 'binary', optionId: 'jaw', optionLabel: 'Jaw' } })
    const opposite = candidate('jaw-negative', rolling(30), { target: first.target, effectDirection: 'negative' })
    const forehead = candidate('forehead', rolling(14), { target: { ...first.target, optionId: 'forehead', optionLabel: 'Forehead' } })
    expect(groupRelationshipFamilies([catalog([first, opposite, forehead])])).toHaveLength(3)
  })
  it('groups event recency with inverse days-since direction but separates distinct predicates', () => {
    const recent = candidate('event-recent', { kind: 'event', statistic: 'post-window', days: 7, predicate: { ownerTrackableId: 'procedure', optionId: 'type-a' } })
    const since = candidate('event-since', { kind: 'event', statistic: 'days-since', predicate: { ownerTrackableId: 'procedure', optionId: 'type-a' } }, { effectDirection: 'negative' })
    const different = candidate('event-other', { kind: 'event', statistic: 'post-window', days: 7, predicate: { ownerTrackableId: 'procedure', optionId: 'type-b' } })
    expect(relationshipFamilyIdentity(recent)).toBe(relationshipFamilyIdentity(since))
    expect(relationshipFamilyIdentity(recent)).not.toBe(relationshipFamilyIdentity(different))
    expect(groupRelationshipFamilies([catalog([recent, since, different])])).toHaveLength(2)
  })
})

describe('predictor semantics and routine coverage', () => {
  it('suppresses observation-count features but retains a Quick Log event count', () => {
    const density = candidate('density', rolling(14, 'observed-count'))
    const event = candidate('event-count', { kind: 'event', statistic: 'count-window', days: 14, predicate: { ownerTrackableId: 'medication' } }, { predictor: { ...candidate().predictor, key: 'event-count', label: 'Medication Taken — count in previous 14 days', family: 'event', source: { descriptorId: 'medication', trackableId: 'medication', measurementType: 'event' }, transformation: { kind: 'event', statistic: 'count-window', days: 14, predicate: { ownerTrackableId: 'medication' } } } })
    const feed = buildInsightFeed([catalog([density, event])], [])
    expect(feed.families.find((family) => family.representative.id === density.id)?.semanticClass).toBe('data-availability')
    expect(feed.diagnostics.find((entry) => entry.candidateId === density.id)?.reason).toBe('logging-density')
    expect(feed.queue.map((insight) => insight.kind === 'relationship' ? insight.candidate.id : insight.identity)).toEqual([event.id])
    expect(feed.families.find((family) => family.representative.id === event.id)?.semanticClass).toBe('event-occurrence')
  })
  it('counts only eligible completed Check-In days for a conditional question', () => {
    const dates = Array.from({ length: 40 }, (_, index) => new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10))
    const records = dates.map((localDate, index) => ({ id: `routine-${index}`, recordKind: 'routine', status: 'completed', routineId: 'daily', localDate, createdAt: '2026-02-20T00:00:00.000Z', deletedAt: null })) as LogRecord[]
    const observations = dates.flatMap((_, index) => [
      { id: `condition-${index}`, logRecordId: `routine-${index}`, trackableId: 'condition', answer: { state: 'answered', value: { kind: 'boolean', value: index < 20 } }, deletedAt: null },
      ...(index < 18 ? [{ id: `dependent-${index}`, logRecordId: `routine-${index}`, trackableId: 'dependent', answer: { state: 'answered', value: { kind: 'number', value: 3 } }, deletedAt: null }] : []),
    ]) as Observation[]
    const routineItem = { id: 'item', routineId: 'daily', target: { kind: 'trackable', trackableId: 'dependent' }, enabled: true, frequency: 'every_day', conditionalRule: { sourceTrackableId: 'condition', operator: 'equals', expectedValue: true }, completionBehavior: 'expected', createdAt: '2026-01-01T00:00:00.000Z', deletedAt: null } as RoutineItem
    const data = { routineItems: [routineItem], logRecords: records, observations, observationSelections: [], analysisMappings: [], categories: [], trackables: [], trackableOptions: [], trackableVersions: [], trackableFields: [], trackableDailyAssertions: [] } as TrendsData
    const coverage = routineCoverage(data, 'dependent')
    expect(coverage).toMatchObject({ eligibleDays: 20, answeredDays: 18, ineligibleDays: 20, eligibleButUnansweredDays: 2, coverage: .9, routinelyAnswered: true, expectedQuestion: true })
    const unknown = { ...data, observations: observations.filter((observation) => observation.id !== 'condition-20') }
    expect(routineCoverage(unknown, 'dependent')).toMatchObject({ eligibleDays: 20, ineligibleDays: 19, unknownEligibilityDays: 1 })
    const density = candidate('density', rolling(14, 'observed-count'))
    density.predictor.source = { descriptorId: 'dependent', trackableId: 'dependent', measurementType: 'continuous' }
    const feed = buildInsightFeed([catalog([density])], [], data)
    expect(feed.families[0].routineCoverage?.routinelyAnswered).toBe(true)
    expect(feed.queue).toEqual([])
  })
})

describe('bounded diverse review sessions', () => {
  it('uses different parent Trackables and predictor sources where supported alternatives exist', () => {
    const acne = (optionId: string, improvement: number) => candidate(`acne-${optionId}`, rolling(14), { target: { ...target, descriptorId: 'acne', trackableId: 'acne', label: 'Acne Location', kind: 'binary', optionId, optionLabel: optionId }, improvement })
    const other = (id: string, source: string) => candidate(`other-${id}`, rolling(14), { target: { ...target, descriptorId: id, trackableId: id, label: id }, predictor: { ...candidate().predictor, key: `other-${id}`, source: { descriptorId: source, trackableId: source, measurementType: 'continuous' }, transformation: rolling(14) }, improvement: .25 })
    const feed = buildInsightFeed([catalog([acne('forehead', .36), acne('jaw', .34), acne('chin', .32), other('mood', 'mood-source'), other('pain', 'activity')])], [])
    expect(feed.queue).toHaveLength(3)
    expect(feed.queue.filter((insight) => insight.kind === 'relationship' && insight.family.targetParentId === 'acne')).toHaveLength(1)
    expect(new Set(feed.queue.filter((insight) => insight.kind === 'relationship').map((insight) => insight.family.predictorSourceKey)).size).toBe(3)
    expect(feed.diagnostics.some((entry) => entry.reason === 'diversity-cap')).toBe(true)
  })
  it('does not backfill 3→2→1→0, then offers a separate batch from the backlog', () => {
    const candidates = Array.from({ length: 7 }, (_, index) => candidate(`candidate-${index}`, rolling(14), { target: { ...target, descriptorId: `target-${index}`, trackableId: `target-${index}` }, predictor: { ...candidate().predictor, key: `candidate-${index}`, source: { descriptorId: `source-${index}`, trackableId: `source-${index}`, measurementType: 'continuous' } } }))
    let reviews: RelationshipReview[] = []
    const first = buildInsightFeed([catalog(candidates)], reviews)
    const session = first.queue.map((insight) => insight.identity)
    expect(session).toHaveLength(3)
    for (const remaining of [2, 1, 0]) {
      const chosen = first.queue[3 - remaining - 1]
      if (chosen.kind === 'relationship') reviews = [...reviews, review(chosen.candidate)]
      const next = buildInsightFeed([catalog(candidates)], reviews)
      expect(remainingReviewBatch(session, next.available)).toHaveLength(remaining)
      expect(next.available.length).toBe(7 - reviews.length)
    }
    const later = buildInsightFeed([catalog(candidates)], reviews)
    const nextSession = selectReviewBatch(later.available, 3, session)
    expect(nextSession).toHaveLength(3)
    expect(nextSession.every((insight) => !session.includes(insight.identity))).toBe(true)
  })
})

describe('review model, wording and persistence', () => {
  it('keeps change-point matching tolerant of small date shifts and feedback bounded', () => {
    const point = change(); const saved = { ...review(), relationshipIdentity: changePointIdentity(point), kind: 'change-point' as const, changeDate: point.date, changeDirection: 'higher' as const }
    expect(matchingReview(changePointIdentity(change('2026-02-03')), 'change-point', [saved], change('2026-02-03'))).toEqual(saved)
    expect(matchingReview(changePointIdentity(change('2026-03-03')), 'change-point', [saved], change('2026-03-03'))).toBeUndefined()
    expect(reviewLifecycle('yes')).toBe('supported'); expect(reviewLifecycle('unknown')).toBe('uncertain'); expect(reviewLifecycle('no')).toBe('questioned')
    expect(reviewFeedbackWeight({ judgment: 'yes', confidence: 'high' })).toBe(.6)
    expect(reviewFeedbackWeight({ judgment: 'probably', confidence: 'medium' })).toBe(.2)
    expect(reviewFeedbackWeight({ judgment: 'unknown', confidence: 'high' })).toBe(0)
    expect(reviewFeedbackWeight({ judgment: 'no', confidence: 'low' })).toBe(-.2)
  })
  it('uses human-level non-causal wording for value, option, event and change-point concepts', () => {
    const forms: FeatureTransformation[] = [{ kind: 'lag', days: 2, encoding: 'numeric' }, rolling(7, 'mean'), { kind: 'event', statistic: 'post-window', days: 10, predicate: { ownerTrackableId: 'procedure' } }, { kind: 'event', statistic: 'days-since', predicate: { ownerTrackableId: 'procedure' } }, { kind: 'event', statistic: 'count-window', days: 7, predicate: { ownerTrackableId: 'procedure' } }]
    for (const [index, transform] of forms.entries()) {
      const wording = presentInsight(item(candidate(`form-${index}`, transform)))
      expect(wording.title).toContain('tended to be')
      expect(wording.title).not.toMatch(/14|30|90|minimum|rolling|observed count/i)
      expect(`${wording.title} ${wording.details}`).not.toMatch(/caus(?:e|ed)|because of|leads to|results in/i)
    }
    const binary = candidate('jaw', rolling(14), { target: { ...target, kind: 'binary', optionId: 'jaw', optionLabel: 'Jaw', label: 'Acne Location' }, effectDirection: 'negative' })
    expect(presentInsight(item(binary)).title).toContain('Jaw (Acne Location) tended to be less common')
    const option = candidate('option', { kind: 'lag', days: 1, encoding: 'multi-indicator', optionId: 'jaw' }, { predictor: { ...candidate().predictor, key: 'option', label: 'Acne Location: Jaw — 1 day ago', transformation: { kind: 'lag', days: 1, encoding: 'multi-indicator', optionId: 'jaw' } } })
    expect(presentInsight(item(option)).title).toContain('Acne Location: Jaw was selected')
    const shift = presentInsight({ kind: 'change-point', identity: changePointIdentity(change()), point: change() })
    expect(shift.context).toContain('2 days before this shift')
  })
  it('persists, edits and resets human reviews without derived candidates or raw data', async () => {
    const factory = new IDBFactory(); const name = 'insight-review-family-test'
    const first = new IndexedDbRelationshipReviewRepository(name, factory)
    const saved = review(); await first.save(saved); first.close()
    const second = new IndexedDbRelationshipReviewRepository(name, factory)
    expect(await second.all()).toEqual([saved])
    const edited = upsertReview(saved, { ...saved, judgment: 'no', confidence: 'high' }, '2026-03-02T00:00:00.000Z')
    expect(edited.id).toBe(saved.id); expect(edited.createdAt).toBe(saved.createdAt)
    await second.save(edited); expect(await second.all()).toEqual([edited])
    expect(JSON.stringify((await second.all())[0])).not.toContain('alignedDates')
    await second.remove(saved.id); expect(await second.all()).toEqual([])
    second.close()
  })
  it('rejects malformed saved metadata', async () => {
    const factory = new IDBFactory(); const name = 'insight-review-invalid-test'
    const repository = new IndexedDbRelationshipReviewRepository(name, factory)
    expect(await repository.all()).toEqual([])
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = factory.open(name, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    await new Promise<void>((resolve, reject) => { const transaction = db.transaction('reviews', 'readwrite'); transaction.objectStore('reviews').put({ id: 'bad', judgment: 'yes' }); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error) })
    db.close()
    await expect(repository.all()).rejects.toThrow('Invalid saved relationship review')
    repository.close()
  })
})
