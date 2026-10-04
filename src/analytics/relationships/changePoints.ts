import type { EventPredicate } from '../features/featureTypes.ts'
import type { ChangePointEventContext, RelationshipPolicy, RelationshipTarget, TargetChangePoint, TargetRegime } from './relationshipTypes.ts'

export interface TargetSeriesPoint { date: string; value: number; mapped: boolean }
export interface ContextEvent { recordId: string; date: string; ownerTrackableId: string; label: string; predicate?: EventPredicate }
const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length
const median = (values: readonly number[]): number => { const ordered = [...values].sort((a, b) => a - b); return (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) / 2 }
const day = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 86_400_000
const targetKey = (target: RelationshipTarget): string => `${encodeURIComponent(target.descriptorId)}/${encodeURIComponent(target.optionId ?? '')}`

/** Deterministic binary segmentation with minimum side support and a standardized shift gate. */
export function detectTargetChangePoints(target: RelationshipTarget, input: readonly TargetSeriesPoint[], events: readonly ContextEvent[], policy: RelationshipPolicy): { changePoints: readonly TargetChangePoint[]; regimes: readonly TargetRegime[] } {
  const points = [...input].sort((a, b) => a.date.localeCompare(b.date))
  const found: TargetChangePoint[] = []
  const search = (start: number, end: number): void => {
    if (found.length >= 3 || end - start < policy.minimumChangeSide * 2) return
    let best: { index: number; score: number; before: number; after: number; effect: number } | null = null
    for (let split = start + policy.minimumChangeSide; split <= end - policy.minimumChangeSide; split++) {
      const pre = points.slice(start, split).map((point) => point.value)
      const post = points.slice(split, end).map((point) => point.value)
      const before = target.kind === 'ordinal' ? median(pre) : mean(pre)
      const after = target.kind === 'ordinal' ? median(post) : mean(post)
      const pooled = points.slice(start, end).map((point) => point.value)
      const spread = Math.sqrt(mean(pooled.map((value) => (value - mean(pooled)) ** 2)))
      const effect = spread > 0 ? (after - before) / spread : 0
      const difference = Math.abs(after - before)
      if (target.kind === 'binary' ? difference < policy.minimumBinaryRateShift : Math.abs(effect) < policy.minimumChangeEffect || difference < 1e-6 || Math.abs(median(post) - median(pre)) / (spread || 1) < policy.minimumChangeEffect / 2) continue
      const score = Math.abs(effect) * Math.sqrt(pre.length * post.length / (pre.length + post.length))
      if (score >= 3 && (!best || score > best.score)) best = { index: split, score, before, after, effect }
    }
    if (!best) return
    const date = points[best.index].date
    found.push({ id: `change/${targetKey(target)}/${date}`, target, date, preCount: best.index - start, postCount: end - best.index,
      preCenter: best.before, postCenter: best.after, effect: best.effect, strength: best.score,
      supportStart: points[start].date, supportEnd: points[end - 1].date, nearbyEvents: [] })
    search(start, best.index)
    search(best.index, end)
  }
  search(0, points.length)
  found.sort((a, b) => a.date.localeCompare(b.date))
  const contextual = linkNearbyEvents(found, events, policy)
  const boundaries = points.length ? [points[0].date, ...found.map((item) => item.date)] : []
  const regimes = boundaries.map((startDate, index): TargetRegime => ({ targetId: targetKey(target), startDate, endDate: index + 1 < boundaries.length ? points.filter((point) => point.date < boundaries[index + 1]).at(-1)!.date : points.at(-1)!.date,
    observationCount: points.filter((point) => point.date >= startDate && (index + 1 === boundaries.length || point.date < boundaries[index + 1])).length,
    current: index === boundaries.length - 1 }))
  return { changePoints: contextual, regimes }
}

export function linkNearbyEvents(found: readonly TargetChangePoint[], events: readonly ContextEvent[], policy: RelationshipPolicy): TargetChangePoint[] {
  return found.map((change): TargetChangePoint => ({ ...change, nearbyEvents: events.filter((event) => Math.abs(day(event.date) - day(change.date)) <= policy.nearbyEventDays)
    .map((event): ChangePointEventContext => ({ eventRecordId: event.recordId, ownerTrackableId: event.ownerTrackableId, label: event.label, ...(event.predicate ? { predicate: event.predicate } : {}),
      daysFromChange: day(event.date) - day(change.date), repeatedSupport: found.filter((other) => other.target.descriptorId === change.target.descriptorId && other.target.optionId === change.target.optionId && events.some((otherEvent) => otherEvent.ownerTrackableId === event.ownerTrackableId && Math.abs(day(otherEvent.date) - day(other.date)) <= policy.nearbyEventDays)).length,
      relation: 'nearby-in-time' })).sort((a, b) => Math.abs(a.daysFromChange) - Math.abs(b.daysFromChange) || a.eventRecordId.localeCompare(b.eventRecordId)) }))
}
