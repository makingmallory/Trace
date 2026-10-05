/// <reference lib="webworker" />
import type { TrendsData } from '../../analytics/AnalyticsProvider.ts'
import type { RelationshipReview } from '../../analytics/insights/insightReview.ts'
import { LocalPredictionProvider } from '../../predictions/LocalPredictionProvider.ts'

const predictionProvider = new LocalPredictionProvider()

self.onmessage = (event: MessageEvent<{ data: TrendsData; asOfDate: string; asOfTimestamp: string; reviews: readonly RelationshipReview[]; targetDescriptorIds?: readonly string[]; horizonDays?: number }>) => {
  try {
    const request = { asOfDate: event.data.asOfDate, asOfTimestamp: event.data.asOfTimestamp, reviews: event.data.reviews, targetDescriptorIds: event.data.targetDescriptorIds }
    const operation = event.data.horizonDays && event.data.horizonDays > 1 ? predictionProvider.forecastRange(event.data.data, { ...request, horizonDays: event.data.horizonDays }) : predictionProvider.forecastTomorrow(event.data.data, request)
    void operation.then((results) => self.postMessage({ results })).catch((error: unknown) => self.postMessage({ error: error instanceof Error ? error.message : 'Forecasting failed' }))
  }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Forecasting failed' }) }
}
