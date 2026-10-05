import { useEffect, useState } from 'react'
import type { TrendsData } from '../../analytics/AnalyticsProvider.ts'
import { localForecastDates } from '../../analytics/forecasting/forecastPresentation.ts'
import type { ForecastResult, ForecastWeekResult } from '../../analytics/forecasting/forecastTypes.ts'
import type { RelationshipReview } from '../../analytics/insights/insightReview.ts'
import { IndexedDbRelationshipReviewRepository } from '../../data/local/IndexedDbRelationshipReviewRepository.ts'

const reviewStore = new IndexedDbRelationshipReviewRepository()

/** Shared worker-backed forecast request for Trends and Home. */
export function useForecastResults(data: TrendsData | null, targetDescriptorIds?: readonly string[]) {
  const [reviews, setReviews] = useState<readonly RelationshipReview[] | null>(null)
  const [results, setResults] = useState<readonly ForecastResult[] | null>(null)
  const [error, setError] = useState('')
  const { asOfDate, forecastDate } = localForecastDates(new Date())
  const enabled = targetDescriptorIds === undefined || targetDescriptorIds.length > 0
  useEffect(() => { let active = true; void reviewStore.all().then((items) => { if (active) setReviews(items) }).catch(() => { if (active) setReviews([]) }); return () => { active = false } }, [])
  useEffect(() => {
    if (!enabled || !data || !reviews) return
    let active = true; setResults(null); setError('')
    const worker = new Worker(new URL('./forecastWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ results?: ForecastResult[]; error?: string }>) => { if (!active) return; if (event.data.error) setError('Tomorrow’s forecast could not be prepared right now.'); else setResults(event.data.results ?? []) }
    worker.onerror = () => { if (active) setError('Tomorrow’s forecast could not be prepared right now.') }
    worker.postMessage({ data, asOfDate, asOfTimestamp: new Date().toISOString(), reviews, targetDescriptorIds })
    return () => { active = false; worker.terminate() }
  }, [data, reviews, asOfDate, enabled, targetDescriptorIds])
  return { results, error, forecastDate, loading: enabled && (!data || !reviews || !results) }
}

export function useForecastWeekResults(data: TrendsData | null, targetDescriptorIds: readonly string[], enabled = true) {
  const [reviews, setReviews] = useState<readonly RelationshipReview[] | null>(null)
  const [results, setResults] = useState<readonly ForecastWeekResult[] | null>(null)
  const [error, setError] = useState('')
  const { asOfDate } = localForecastDates(new Date())
  useEffect(() => { let active = true; void reviewStore.all().then((items) => { if (active) setReviews(items) }).catch(() => { if (active) setReviews([]) }); return () => { active = false } }, [])
  useEffect(() => {
    if (!enabled || !data || !reviews || !targetDescriptorIds.length) { setResults(targetDescriptorIds.length && enabled ? null : []); return }
    let active = true; setResults(null); setError('')
    const worker = new Worker(new URL('./forecastWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ results?: ForecastWeekResult[]; error?: string }>) => { if (!active) return; if (event.data.error) setError('The 7-day outlook could not be prepared right now.'); else setResults(event.data.results ?? []) }
    worker.onerror = () => { if (active) setError('The 7-day outlook could not be prepared right now.') }
    worker.postMessage({ data, asOfDate, asOfTimestamp: new Date().toISOString(), reviews, targetDescriptorIds, horizonDays: 7 })
    return () => { active = false; worker.terminate() }
  }, [data, reviews, asOfDate, targetDescriptorIds, enabled])
  return { results, error, loading: enabled && Boolean(targetDescriptorIds.length) && (!data || !reviews || !results) }
}
