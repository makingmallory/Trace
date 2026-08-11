import type { LogRecord, Observation, ObservationOptionSelection, Trackable, TrackableOption, TrackableVersion } from '../domain/models/index.ts'

export interface TrendsData {
  logRecords: readonly LogRecord[]
  observations: readonly Observation[]
  observationSelections: readonly ObservationOptionSelection[]
  trackables: readonly Trackable[]
  trackableOptions: readonly TrackableOption[]
  trackableVersions: readonly TrackableVersion[]
}

export interface AnalyticsProvider {
  readonly providerId: string
  loadTrendsData(): Promise<TrendsData>
}
