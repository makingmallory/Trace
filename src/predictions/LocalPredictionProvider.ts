import { forecastTomorrow } from '../analytics/forecasting/forecastEngine.ts'
import { forecastCacheKey, forecastRange } from '../analytics/forecasting/multiHorizonForecast.ts'
import { forecastPlanning, planningForecastCacheKey } from '../analytics/forecasting/planningForecast.ts'
import type { TrendsData } from '../analytics/AnalyticsProvider.ts'
import type { ForecastRangeRequest, ForecastRequest, ForecastResult, ForecastWeekResult, PlanningForecastRequest, PlanningForecastResult } from '../analytics/forecasting/forecastTypes.ts'
import type { PredictionProvider } from './PredictionProvider.ts'

/** Local deterministic implementation; a future provider can replace it without changing Forecast UI state. */
export class LocalPredictionProvider implements PredictionProvider {
  readonly providerId = 'local-forecast-v2'
  private readonly rangeCache = new Map<string, readonly ForecastWeekResult[]>()
  private readonly planningCache = new Map<string, readonly PlanningForecastResult[]>()
  async forecastTomorrow(data: TrendsData, request: Omit<ForecastRequest, 'forecastDate'>): Promise<readonly ForecastResult[]> {
    return forecastTomorrow(data, request)
  }
  async forecastRange(data: TrendsData, request: ForecastRangeRequest): Promise<readonly ForecastWeekResult[]> {
    const key = forecastCacheKey(data, request); const cached = this.rangeCache.get(key)
    if (cached) return cached
    const result = forecastRange(data, request); this.rangeCache.clear(); this.rangeCache.set(key, result)
    return result
  }
  async forecastPlanning(data: TrendsData, request: PlanningForecastRequest): Promise<readonly PlanningForecastResult[]> {
    const key = planningForecastCacheKey(data, request); const cached = this.planningCache.get(key)
    if (cached) return cached
    const result = forecastPlanning(data, request); this.planningCache.clear(); this.planningCache.set(key, result)
    return result
  }
}
