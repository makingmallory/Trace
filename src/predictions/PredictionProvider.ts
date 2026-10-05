import type { TrendsData } from '../analytics/AnalyticsProvider.ts'
import type { ForecastRequest, ForecastResult } from '../analytics/forecasting/forecastTypes.ts'

/** Replaceable derived-prediction boundary. Implementations must never persist forecasts as source observations. */
export interface PredictionProvider {
  readonly providerId: string
  forecastTomorrow(data: TrendsData, request: Omit<ForecastRequest, 'forecastDate'>): Promise<readonly ForecastResult[]>
}
