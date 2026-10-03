import type { TrendsData } from './AnalyticsProvider.ts'
import { analysisMappingCompatibility } from './analysisMappings.ts'
import { measurementTypeForVersion, type AnalysisMeasurementType } from './analysisModel.ts'
import type { Trackable, TrackableVersion } from '../domain/models/index.ts'
import type { TrackableDetails, TrackableDraft } from '../domain/trackables/TrackableEngine.ts'

export type TrackableEditContinuityAssessment =
  | { kind: 'none' }
  | { kind: 'mappable'; sourceVersion: number; targetVersion: number; sourceType: AnalysisMeasurementType; targetType: AnalysisMeasurementType }
  | { kind: 'unsupported'; sourceVersion: number; targetVersion: number; sourceType: AnalysisMeasurementType | null; targetType: AnalysisMeasurementType | null }

function analysisConfiguration(configuration: Readonly<Record<string, unknown>> | undefined) {
  return {
    analysisMeasurementType: configuration?.analysisMeasurementType,
    orderedOptionIds: configuration?.orderedOptionIds,
    ordinalLabels: configuration?.ordinalLabels,
  }
}

function definitionFingerprint(details: TrackableDetails, draft?: TrackableDraft): string {
  const version = details.version
  const recordSemantics = draft?.recordSemantics ?? details.trackable.recordSemantics ?? 'daily_value'
  const inputType = draft?.inputType ?? version.inputType
  const options = (draft?.options ?? details.options)
    .map((option) => ({ optionId: option.optionId, label: option.label.trim() }))
    .sort((left, right) => (left.optionId ?? '').localeCompare(right.optionId ?? ''))
  return JSON.stringify({
    recordSemantics,
    inputType,
    unit: inputType === 'duration' ? 'minutes' : (draft?.unit ?? version.unit)?.trim() || undefined,
    scaleMin: inputType === 'scale' ? draft?.scaleMin ?? version.scaleMin : undefined,
    scaleMax: inputType === 'scale' ? draft?.scaleMax ?? version.scaleMax : undefined,
    scaleStep: inputType === 'scale' ? draft?.scaleStep ?? version.scaleStep : undefined,
    options: inputType === 'single_choice' || inputType === 'multi_select' ? options : [],
    configuration: analysisConfiguration(draft?.configuration ?? version.configuration),
  })
}

function proposedVersion(details: TrackableDetails, draft: TrackableDraft): TrackableVersion {
  return {
    ...details.version,
    version: details.trackable.currentVersion + 1,
    inputType: draft.inputType,
    scaleMin: draft.inputType === 'scale' ? draft.scaleMin : undefined,
    scaleMax: draft.inputType === 'scale' ? draft.scaleMax : undefined,
    scaleStep: draft.inputType === 'scale' ? draft.scaleStep : undefined,
    unit: draft.inputType === 'duration' ? 'minutes' : draft.unit?.trim() || undefined,
    configuration: { ...details.version.configuration, ...draft.configuration },
  }
}

function proposedTrackable(details: TrackableDetails, draft: TrackableDraft): Trackable {
  return { ...details.trackable, recordSemantics: draft.recordSemantics ?? 'daily_value', currentVersion: details.trackable.currentVersion + 1 }
}

function hasHistoricalAnswers(data: TrendsData, trackableId: string, version: number): boolean {
  const activeRecordIds = new Set(data.logRecords.filter((record) => !record.deletedAt).map((record) => record.id))
  return data.observations.some((observation) => !observation.deletedAt
    && observation.trackableId === trackableId
    && observation.trackableVersion === version
    && observation.answer.state === 'answered'
    && activeRecordIds.has(observation.logRecordId))
}

/** Determines whether an edit needs an explicit historical-continuity decision. */
export function assessTrackableEditContinuity(details: TrackableDetails, draft: TrackableDraft, data: TrendsData): TrackableEditContinuityAssessment {
  if (definitionFingerprint(details) === definitionFingerprint(details, draft)) return { kind: 'none' }
  const sourceVersion = details.trackable.currentVersion
  const targetVersion = sourceVersion + 1
  if (!hasHistoricalAnswers(data, details.trackable.id, sourceVersion)) return { kind: 'none' }
  if (data.analysisMappings.some((mapping) => !mapping.deletedAt && mapping.trackableId === details.trackable.id && mapping.sourceTrackableVersion === sourceVersion && mapping.targetTrackableVersion === targetVersion)) return { kind: 'none' }

  const sourceType = measurementTypeForVersion(details.version, details.trackable)
  const targetType = measurementTypeForVersion(proposedVersion(details, draft), proposedTrackable(details, draft))
  return analysisMappingCompatibility(sourceType, targetType) === 'supported'
    ? { kind: 'mappable', sourceVersion, targetVersion, sourceType: sourceType!, targetType: targetType! }
    : { kind: 'unsupported', sourceVersion, targetVersion, sourceType, targetType }
}
