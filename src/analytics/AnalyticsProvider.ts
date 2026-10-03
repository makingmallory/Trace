import type { AnalysisValueMapping, AnalysisMappingMeasurementType, AnalysisValueMappingEntry, Category, LogRecord, Observation, ObservationOptionSelection, Trackable, TrackableDailyAssertion, TrackableField, TrackableOption, TrackableVersion } from '../domain/models/index.ts'

export interface TrendsData {
  analysisMappings: readonly AnalysisValueMapping[]
  categories: readonly Category[]
  logRecords: readonly LogRecord[]
  observations: readonly Observation[]
  observationSelections: readonly ObservationOptionSelection[]
  trackables: readonly Trackable[]
  trackableOptions: readonly TrackableOption[]
  trackableVersions: readonly TrackableVersion[]
  trackableFields: readonly TrackableField[]
  trackableDailyAssertions: readonly TrackableDailyAssertion[]
}

export interface AnalysisMappingDraft {
  trackableId: string
  sourceTrackableVersion: number
  targetTrackableVersion: number
  targetMeasurementType: AnalysisMappingMeasurementType
  valueMappings: readonly AnalysisValueMappingEntry[]
  ordinalOrder?: readonly string[]
}

export interface AnalyticsProvider {
  readonly providerId: string
  loadTrendsData(): Promise<TrendsData>
  saveAnalysisMapping(draft: AnalysisMappingDraft): Promise<AnalysisValueMapping>
  removeAnalysisMapping(id: string): Promise<void>
}
