import type { FeatureDefinition } from '../features/featureTypes.ts'
import type { ForecastFeatureAvailability, ForecastTarget } from './forecastTypes.ts'

/** Classifies whether a feature can exist at a future horizon without peeking beyond the root cutoff. */
export function forecastFeatureAvailability(feature: FeatureDefinition, target: ForecastTarget, horizon: number): ForecastFeatureAvailability {
  if (feature.transformation.kind === 'calendar') return 'calendar-known'
  if (feature.transformation.kind !== 'lag') return 'unavailable-future'
  if (feature.source?.trackableId !== target.trackableId) return feature.transformation.days >= horizon ? 'historically-known' : 'unavailable-future'
  return feature.transformation.days >= horizon ? 'historically-known' : 'recursive-target'
}
