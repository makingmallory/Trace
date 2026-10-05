import { forecastTomorrow } from '../analytics/forecasting/forecastEngine.ts'
import { forecastCacheKey, forecastRange } from '../analytics/forecasting/multiHorizonForecast.ts'
import type { TrendsData } from '../analytics/AnalyticsProvider.ts'
import type { ForecastRangeRequest, ForecastRequest, ForecastResult, ForecastWeekResult } from '../analytics/forecasting/forecastTypes.ts'
import type { PredictionProvider } from './PredictionProvider.ts'

/** Local deterministic implementation; a future provider can replace it without changing Forecast UI state. */
export class LocalPredictionProvider implements PredictionProvider {
  readonly providerId = 'local-forecast-v2'
  private readonly rangeCache = new Map<string, readonly ForecastWeekResult[]>()
  async forecastTomorrow(data: TrendsData, request: Omit<ForecastRequest, 'forecastDate'>): Promise<readonly ForecastResult[]> {
    return forecastTomorrow(data, request)
  }
  async forecastRange(data: TrendsData, request: ForecastRangeRequest): Promise<readonly ForecastWeekResult[]> {
    const key = forecastCacheKey(data, request); const cached = this.rangeCache.get(key)
    if (cached) return cached
    const result = forecastRange(data, request); this.rangeCache.clear(); this.rangeCache.set(key, result)
    return result
  }
}
