import { forecastTomorrow } from '../analytics/forecasting/forecastEngine.ts'
import type { TrendsData } from '../analytics/AnalyticsProvider.ts'
import type { ForecastRequest, ForecastResult } from '../analytics/forecasting/forecastTypes.ts'
import type { PredictionProvider } from './PredictionProvider.ts'

/** Local deterministic implementation; a future provider can replace it without changing Forecast UI state. */
export class LocalPredictionProvider implements PredictionProvider {
  readonly providerId = 'local-next-day-v1'
  async forecastTomorrow(data: TrendsData, request: Omit<ForecastRequest, 'forecastDate'>): Promise<readonly ForecastResult[]> {
    return forecastTomorrow(data, request)
  }
}
