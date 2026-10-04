import { useEffect, useMemo, useState } from 'react'
import type { TrendsData } from '../../analytics/AnalyticsProvider.ts'
import { buildInsightFeed, remainingReviewBatch, selectReviewBatch, type InsightItem } from '../../analytics/insights/insightFeed.ts'
import { evidenceSignature, matchingFamilyReview, matchingReview, normalizeLegacyReview, reviewLifecycle, upsertReview, type RelationshipReview, type ReviewConfidence, type ReviewJudgment } from '../../analytics/insights/insightReview.ts'
import { presentInsight } from '../../analytics/insights/insightWording.ts'
import type { RelationshipCatalog } from '../../analytics/relationships/relationshipTypes.ts'
import type { RelationshipFamily } from '../../analytics/insights/insightFamilies.ts'
import { IndexedDbRelationshipReviewRepository } from '../../data/local/IndexedDbRelationshipReviewRepository.ts'

const reviewStore = new IndexedDbRelationshipReviewRepository()
const judgments: readonly { value: ReviewJudgment; label: string }[] = [{ value: 'yes', label: 'Yes' }, { value: 'probably', label: 'Probably' }, { value: 'unknown', label: 'I don’t know' }, { value: 'probably-not', label: 'Probably not' }, { value: 'no', label: 'No' }]
const confidences: readonly ReviewConfidence[] = ['low', 'medium', 'high']

export function InsightCard({ item, review, onSave, onRemove, onExplore }: { item: InsightItem; review?: RelationshipReview; onSave: (item: InsightItem, judgment: ReviewJudgment, confidence: ReviewConfidence, existing?: RelationshipReview) => void; onRemove: (review: RelationshipReview) => void; onExplore: (target: string, source?: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [judgment, setJudgment] = useState<ReviewJudgment | null>(review?.judgment ?? null)
  const [confidence, setConfidence] = useState<ReviewConfidence>(review?.confidence ?? 'medium')
  const presentation = presentInsight(item)
  const target = item.kind === 'relationship' ? item.candidate.target.descriptorId : item.point.target.descriptorId
  const source = item.kind === 'relationship' ? item.candidate.predictor.source?.descriptorId : undefined
  const showForm = !review || editing
  return <article className="insight-card"><div className="insight-card__main"><h3>{presentation.title}</h3><p className="insight-card__support"><strong>{presentation.strength}</strong><span>{presentation.support}</span></p>{presentation.context ? <p className="insight-card__context">{presentation.context}</p> : null}{review && !editing ? <p className="insight-card__review">Your review: {judgments.find((choice) => choice.value === review.judgment)?.label} · {review.confidence} confidence · {reviewLifecycle(review.judgment)}</p> : null}{review && review.evidenceSignature !== evidenceSignature(item.kind === 'relationship' ? item.candidate : item.point) ? <p className="insight-card__changed">Evidence has changed since you reviewed this.</p> : null}</div>
    <div className="insight-card__actions"><button type="button" onClick={() => onExplore(target, source)}>View in Explore</button>{review && !editing ? <button type="button" onClick={() => { setJudgment(review.judgment); setConfidence(review.confidence); setEditing(true) }}>Edit review</button> : null}</div>
    {showForm ? <fieldset className="insight-review"><legend>Does this connection fit your experience?</legend><div className="insight-review__choices">{judgments.map((choice) => <button type="button" key={choice.value} aria-pressed={judgment === choice.value} onClick={() => setJudgment(choice.value)}>{choice.label}</button>)}</div><span className="insight-review__label">Your confidence</span><div className="insight-review__choices insight-review__choices--confidence">{confidences.map((choice) => <button type="button" key={choice} aria-pressed={confidence === choice} onClick={() => setConfidence(choice)}>{choice[0].toUpperCase() + choice.slice(1)}</button>)}</div><div className="insight-review__actions"><button type="button" disabled={!judgment} onClick={() => { if (judgment) { onSave(item, judgment, confidence, review); setEditing(false) } }}>Save review</button>{review ? <button type="button" onClick={() => setEditing(false)}>Cancel</button> : null}{review ? <button type="button" onClick={() => { onRemove(review); setEditing(false) }}>Reset review</button> : null}</div></fieldset> : null}
    <details className="insight-card__details"><summary>Why am I seeing this?</summary><p>{presentation.details}</p></details>
  </article>
}

function ArchivedReviewCard({ review, onEdit, onRemove, onExplore }: { review: RelationshipReview; onEdit: (review: RelationshipReview, judgment: ReviewJudgment, confidence: ReviewConfidence) => void; onRemove: (review: RelationshipReview) => void; onExplore: (target: string, source?: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [judgment, setJudgment] = useState(review.judgment)
  const [confidence, setConfidence] = useState(review.confidence)
  return <article className="insight-card"><h3>{review.titleAtReview}</h3><p className="insight-card__review">Your review: {judgments.find((choice) => choice.value === review.judgment)?.label} · {review.confidence} confidence</p><p className="insight-card__changed">This pattern is not in the current set of surfaced findings.</p><div className="insight-card__actions"><button type="button" onClick={() => onExplore(review.targetDescriptorId, review.predictorDescriptorId ?? review.predictorTrackableId)}>View in Explore</button><button type="button" onClick={() => setEditing((value) => !value)}>{editing ? 'Cancel' : 'Edit review'}</button><button type="button" onClick={() => onRemove(review)}>Reset review</button></div>{editing ? <fieldset className="insight-review"><legend>Does this connection fit your experience?</legend><div className="insight-review__choices">{judgments.map((choice) => <button type="button" key={choice.value} aria-pressed={judgment === choice.value} onClick={() => setJudgment(choice.value)}>{choice.label}</button>)}</div><span className="insight-review__label">Your confidence</span><div className="insight-review__choices insight-review__choices--confidence">{confidences.map((choice) => <button type="button" key={choice} aria-pressed={confidence === choice} onClick={() => setConfidence(choice)}>{choice[0].toUpperCase() + choice.slice(1)}</button>)}</div><div className="insight-review__actions"><button type="button" onClick={() => { onEdit(review, judgment, confidence); setEditing(false) }}>Save review</button></div></fieldset> : null}</article>
}

export function InsightsPanel({ data, onExplore }: { data: TrendsData | null; onExplore: (target: string, source?: string) => void }) {
  const [catalogs, setCatalogs] = useState<RelationshipCatalog[] | null>(null)
  const [families, setFamilies] = useState<RelationshipFamily[] | null>(null)
  const [reviews, setReviews] = useState<RelationshipReview[]>([])
  const [reviewsLoaded, setReviewsLoaded] = useState(false)
  const [reviewsUnavailable, setReviewsUnavailable] = useState(false)
  const [discoveryUnavailable, setDiscoveryUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [showReviewed, setShowReviewed] = useState(false)
  const [batchIds, setBatchIds] = useState<readonly string[] | null>(null)
  useEffect(() => { let active = true; void reviewStore.all().then((items) => { if (active) { setReviews(items); setReviewsLoaded(true) } }).catch(() => { if (active) { setReviewsUnavailable(true); setError('Saved reviews could not be loaded.') } }); return () => { active = false } }, [])
  useEffect(() => {
    if (!data) return
    let active = true
    setCatalogs(null)
    setFamilies(null)
    setBatchIds(null)
    setDiscoveryUnavailable(false)
    let worker: Worker
    try { worker = new Worker(new URL('./insightsWorker.ts', import.meta.url), { type: 'module' }) }
    catch { setDiscoveryUnavailable(true); setError('Patterns could not be checked right now.'); return }
    worker.onmessage = (event: MessageEvent<{ catalogs?: RelationshipCatalog[]; families?: RelationshipFamily[]; error?: string }>) => { if (!active) return; if (event.data.error) { setDiscoveryUnavailable(true); setCatalogs([]); setError('Patterns could not be checked right now.') } else { setCatalogs(event.data.catalogs ?? []); setFamilies(event.data.families ?? []); setError('') } }
    worker.onerror = () => { if (active) { setDiscoveryUnavailable(true); setCatalogs([]); setError('Patterns could not be checked right now.') } }
    worker.postMessage(data)
    return () => { active = false; worker.terminate() }
    // Data is refreshed by the repository event; tab navigation does not trigger discovery.
  }, [data])
  const feed = useMemo(() => catalogs && families && reviewsLoaded ? buildInsightFeed(catalogs, reviews, data ?? undefined, 3, families) : null, [catalogs, families, reviews, reviewsLoaded, data])
  useEffect(() => { if (feed && batchIds === null) setBatchIds(feed.queue.map((item) => item.identity)) }, [feed, batchIds])
  useEffect(() => {
    if (!feed) return
    const normalized = reviews.map((review) => normalizeLegacyReview(review, feed.families)).filter((review, index) => review !== reviews[index])
    if (!normalized.length) return
    void Promise.all(normalized.map((review) => reviewStore.save(review))).then(() => setReviews((current) => current.map((review) => normalized.find((next) => next.id === review.id) ?? review))).catch(() => setError('Saved reviews could not be updated.'))
  }, [feed, reviews])
  const sessionItems = batchIds && feed ? remainingReviewBatch(batchIds, feed.available) : []
  const moreAvailable = Boolean(feed && batchIds && feed.available.some((item) => !batchIds.includes(item.identity)))
  async function save(item: InsightItem, judgment: ReviewJudgment, confidence: ReviewConfidence, existing?: RelationshipReview) {
    const point = item.kind === 'change-point' ? item.point : undefined
    const previous = existing ?? (item.kind === 'relationship' ? matchingFamilyReview(item.family, reviews) : matchingReview(item.identity, item.kind, reviews, point))
    const target = item.kind === 'relationship' ? item.candidate.target : item.point.target
    const candidate = item.kind === 'relationship' ? item.candidate : undefined
    const draft = { relationshipIdentity: item.identity, kind: item.kind, targetDescriptorId: target.descriptorId, targetTrackableId: target.trackableId,
      ...(candidate ? { predictorFeatureKey: candidate.predictor.key, technicalCandidateIdAtReview: candidate.id, predictorTransformation: candidate.predictor.transformation, ...(candidate.predictor.source ? { predictorTrackableId: candidate.predictor.source.trackableId, predictorDescriptorId: candidate.predictor.source.descriptorId } : {}) } : {}),
      ...(point ? { changeDate: point.date, changeDirection: point.effect >= 0 ? 'higher' as const : 'lower' as const } : {}), judgment, confidence,
      evidenceSignature: evidenceSignature(candidate ?? point!), titleAtReview: presentInsight(item).title }
    const next = upsertReview(previous, draft, new Date().toISOString())
    try { await reviewStore.save(next); setReviews((items) => [...items.filter((review) => review.id !== next.id), next]); setError('') } catch { setError('Review could not be saved.') }
  }
  async function remove(review: RelationshipReview) { try { await reviewStore.remove(review.id); setReviews((items) => items.filter((item) => item.id !== review.id)); setError('') } catch { setError('Review could not be reset.') } }
  async function editArchived(review: RelationshipReview, judgment: ReviewJudgment, confidence: ReviewConfidence) { const next = { ...review, judgment, confidence, updatedAt: new Date().toISOString() }; try { await reviewStore.save(next); setReviews((items) => items.map((item) => item.id === next.id ? next : item)); setError('') } catch { setError('Review could not be saved.') } }
  return <section className="insights-panel" aria-label="Insights"><header className="insights-panel__heading"><p>From your records</p><h2>Patterns worth a closer look</h2><p>These are observations, not explanations. Your judgment helps Trace remember what rings true for you.</p></header>
    {error ? <p role="alert" className="notice notice--error">{error}</p> : null}
    {reviewsUnavailable ? <p className="insights-empty">Reviewing is unavailable until saved reviews can be loaded.</p> : discoveryUnavailable ? null : !data || !catalogs || !reviewsLoaded || batchIds === null ? <p role="status" className="insights-loading">Looking for patterns…</p> : <><section aria-labelledby="worth-reviewing"><div className="insights-section-heading"><h2 id="worth-reviewing">Worth reviewing</h2><span>{sessionItems.length}</span></div>{sessionItems.length ? <div className="insights-list">{sessionItems.map((item) => <InsightCard key={item.identity} item={item} onSave={save} onRemove={remove} onExplore={onExplore} />)}</div> : <><p className="insights-empty">{batchIds.length ? 'You’re caught up for now.' : feed?.emptyReason === 'not-enough-data' ? 'Trace needs more history before it can look for reliable patterns.' : feed?.emptyReason === 'all-reviewed' ? 'You’re caught up for now.' : 'Nothing stands out strongly enough yet. Keep tracking and Trace will keep looking.'}</p>{moreAvailable ? <button className="insights-more" type="button" onClick={() => setBatchIds(selectReviewBatch(feed!.available, 3, batchIds).map((item) => item.identity))}>Review more patterns</button> : null}</>}</section>
      {feed && feed.reviewed.length ? <section className="insights-reviewed"><button type="button" aria-expanded={showReviewed} onClick={() => setShowReviewed((value) => !value)}>Reviewed <span>{feed.reviewed.length}</span></button>{showReviewed ? <div className="insights-list">{feed.reviewed.map(({ item, review }) => item ? <InsightCard key={review.id} item={item} review={review} onSave={save} onRemove={remove} onExplore={onExplore} /> : <ArchivedReviewCard key={review.id} review={review} onEdit={editArchived} onRemove={remove} onExplore={onExplore} />)}</div> : null}</section> : null}</>}
  </section>
}
