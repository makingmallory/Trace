import type { TrendsData } from '../analytics/AnalyticsProvider.ts'
import type { ForecastRangeRequest, ForecastRequest, ForecastResult, ForecastWeekResult, PlanningForecastRequest, PlanningForecastResult } from '../analytics/forecasting/forecastTypes.ts'

/** Replaceable derived-prediction boundary. Implementations must never persist forecasts as source observations. */
export interface PredictionProvider {
  readonly providerId: string
  forecastTomorrow(data: TrendsData, request: Omit<ForecastRequest, 'forecastDate'>): Promise<readonly ForecastResult[]>
  forecastRange(data: TrendsData, request: ForecastRangeRequest): Promise<readonly ForecastWeekResult[]>
  forecastPlanning(data: TrendsData, request: PlanningForecastRequest): Promise<readonly PlanningForecastResult[]>
}
