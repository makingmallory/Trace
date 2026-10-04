import type { TrendsData } from '../AnalyticsProvider.ts'
import { analysisSeriesOptions, buildAnalysisTrack, measurementTypeForVersion, type AnalysisSeriesDescriptor, type AnalysisTrack, type AnalysisValue } from '../analysisModel.ts'
import { isOccurrenceTrackable } from '../../domain/trackables/trackableSemantics.ts'
import type { Observation } from '../../domain/models/index.ts'
import type { FeatureMissingness, FeatureProvenance, FeatureSource } from './featureTypes.ts'

export interface IndexedCanonicalValue {
  value: AnalysisValue
  provenance: FeatureProvenance
  availableAt: string
  recordedAt: string
}

export interface IndexedSource {
  descriptor: AnalysisSeriesDescriptor
  track: AnalysisTrack
  source: FeatureSource
  byDate: ReadonlyMap<string, readonly IndexedCanonicalValue[]>
  missingByDate: ReadonlyMap<string, { state: FeatureMissingness; availableAt: string }>
}

export interface LongitudinalIndex {
  data: TrendsData
  sources: readonly IndexedSource[]
  recordsById: ReadonlyMap<string, TrendsData['logRecords'][number]>
  observationsById: ReadonlyMap<string, Observation>
  routineStatusByDate: ReadonlyMap<string, { status: 'draft' | 'completed'; availableAt: string }>
}

function knownAt(createdAt: string, cutoff?: string): boolean {
  return !cutoff || createdAt <= cutoff
}

function entityKnownAt(entity: { createdAt: string; updatedAt: string }, cutoff?: string): boolean {
  return knownAt(entity.createdAt, cutoff) && knownAt(entity.updatedAt, cutoff)
}

/** A strict timestamp request excludes facts and mappings that were created later. */
export function snapshotForFeatureCutoff(data: TrendsData, asOfDate: string, asOfTimestamp?: string): TrendsData {
  const versions = data.trackableVersions.filter((item) => !item.deletedAt && entityKnownAt(item, asOfTimestamp))
  const latest = new Map<string, number>()
  for (const version of versions) latest.set(version.trackableId, Math.max(latest.get(version.trackableId) ?? 0, version.version))
  const trackables = data.trackables.filter((item) => !item.deletedAt && knownAt(item.createdAt, asOfTimestamp) && latest.has(item.id)).map((item) => ({ ...item, currentVersion: Math.min(item.currentVersion, latest.get(item.id)!) }))
  const records = data.logRecords.filter((item) => !item.deletedAt && item.localDate <= asOfDate && entityKnownAt(item, asOfTimestamp) && (!asOfTimestamp || !item.startTime || item.startTime <= asOfTimestamp))
  const recordIds = new Set(records.map((item) => item.id))
  const observations = data.observations.filter((item) => !item.deletedAt && recordIds.has(item.logRecordId) && entityKnownAt(item, asOfTimestamp))
  const observationIds = new Set(observations.map((item) => item.id))
  return {
    ...data,
    analysisMappings: data.analysisMappings.filter((item) => !item.deletedAt && entityKnownAt(item, asOfTimestamp)),
    categories: data.categories.filter((item) => !item.deletedAt && entityKnownAt(item, asOfTimestamp)),
    logRecords: records,
    observations,
    observationSelections: data.observationSelections.filter((item) => !item.deletedAt && observationIds.has(item.observationId) && entityKnownAt(item, asOfTimestamp)),
    trackables,
    trackableOptions: data.trackableOptions.filter((item) => !item.deletedAt && entityKnownAt(item, asOfTimestamp)),
    trackableVersions: versions,
    trackableFields: data.trackableFields.filter((item) => !item.deletedAt && entityKnownAt(item, asOfTimestamp)),
    trackableDailyAssertions: data.trackableDailyAssertions.filter((item) => !item.deletedAt && item.date <= asOfDate && entityKnownAt(item, asOfTimestamp)),
  }
}

function sourceFor(descriptor: AnalysisSeriesDescriptor): FeatureSource {
  return {
    descriptorId: descriptor.id,
    trackableId: descriptor.trackableId,
    ...(descriptor.ownerTrackableId ? { ownerTrackableId: descriptor.ownerTrackableId, fieldTrackableId: descriptor.trackableId } : {}),
    measurementType: descriptor.measurementType,
  }
}

function missingState(observation: Observation): FeatureMissingness {
  if (observation.answer.state === 'answered') return 'unmapped'
  return observation.answer.state === 'not_presented' ? 'not-presented' : observation.answer.state
}

function extraOccurrenceDescriptors(data: TrendsData, existing: readonly AnalysisSeriesDescriptor[]): AnalysisSeriesDescriptor[] {
  const found = new Set(existing.map((item) => item.id))
  return data.trackables.flatMap((trackable) => {
    if (!trackable.active || !isOccurrenceTrackable(trackable) || found.has(trackable.id)) return []
    const version = data.trackableVersions.find((item) => item.trackableId === trackable.id && item.version === trackable.currentVersion)
    const measurementType = version && measurementTypeForVersion(version, trackable)
    if (!version || !measurementType) return []
    return [{ id: trackable.id, trackableId: trackable.id, name: version.name, categoryId: trackable.categoryId, categoryName: data.categories.find((item) => item.id === trackable.categoryId)?.name ?? 'Uncategorized', sourceInputType: 'event' as const, measurementType, recordedCount: 0 }]
  })
}

/** Builds each canonical track once, then indexes values and answer states by date. */
export function buildLongitudinalIndex(input: TrendsData, asOfDate: string, asOfTimestamp?: string, trackableIds?: readonly string[]): LongitudinalIndex {
  const data = snapshotForFeatureCutoff(input, asOfDate, asOfTimestamp)
  const recordsById = new Map(data.logRecords.map((record) => [record.id, record]))
  const observationsById = new Map(data.observations.map((observation) => [observation.id, observation]))
  const routineStatusByDate = new Map<string, { status: 'draft' | 'completed'; availableAt: string }>()
  for (const record of data.logRecords) if (record.recordKind === 'routine') {
    if (record.status === 'completed' || !routineStatusByDate.has(record.localDate)) routineStatusByDate.set(record.localDate, { status: record.status, availableAt: [record.createdAt, record.updatedAt].sort().at(-1)! })
  }
  const descriptors = analysisSeriesOptions(data)
  const selected = new Set(trackableIds ?? [])
  const sources = [...descriptors, ...extraOccurrenceDescriptors(data, descriptors)]
    .filter((descriptor) => !trackableIds || selected.has(descriptor.trackableId) || Boolean(descriptor.ownerTrackableId && selected.has(descriptor.ownerTrackableId)))
    .map((descriptor): IndexedSource => {
      const track = buildAnalysisTrack(data, descriptor, 'all', asOfDate)
      const byDate = new Map<string, IndexedCanonicalValue[]>()
      const mappingAvailableAt = new Map(data.analysisMappings.map((mapping) => [mapping.id, [mapping.createdAt, mapping.updatedAt].sort().at(-1)!]))
      for (const value of track.values) {
        const observation = observationsById.get(value.id)
        const record = observation ? recordsById.get(observation.logRecordId) : recordsById.get(value.id)
        if (!record) continue
        const provenance: FeatureProvenance = {
          recordId: record.id,
          ...(observation ? { observationId: observation.id } : {}),
          localDate: value.localDate,
          trackableId: descriptor.trackableId,
          trackableVersion: value.version,
          ...(value.analysisMappingId ? { mappingId: value.analysisMappingId } : {}),
          ...(value.rawDisplay ? { rawValue: value.rawDisplay } : {}),
          canonicalValue: value.display,
        }
        const entries = byDate.get(value.localDate) ?? []
        const availableAt = [record.createdAt, record.updatedAt, observation?.createdAt, observation?.updatedAt, value.analysisMappingId ? mappingAvailableAt.get(value.analysisMappingId) : undefined].filter((item): item is string => Boolean(item)).sort().at(-1)!
        entries.push({ value, provenance, availableAt, recordedAt: record.startTime ?? observation?.createdAt ?? record.createdAt })
        byDate.set(value.localDate, entries)
      }
      for (const entries of byDate.values()) entries.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.provenance.recordId.localeCompare(right.provenance.recordId) || (left.provenance.observationId ?? '').localeCompare(right.provenance.observationId ?? ''))
      const missingByDate = new Map<string, { state: FeatureMissingness; availableAt: string }>()
      if (descriptor.measurementType !== 'event') for (const observation of data.observations) {
        if (observation.trackableId !== descriptor.trackableId) continue
        const record = recordsById.get(observation.logRecordId)
        if (!record || (descriptor.ownerTrackableId && record.trackableId !== descriptor.ownerTrackableId)) continue
        if (!byDate.has(record.localDate)) missingByDate.set(record.localDate, { state: missingState(observation), availableAt: [record.createdAt, record.updatedAt, observation.createdAt, observation.updatedAt].sort().at(-1)! })
      }
      return { descriptor, track, source: sourceFor(descriptor), byDate, missingByDate }
    })
  return { data, sources, recordsById, observationsById, routineStatusByDate }
}

export function missingForDate(index: LongitudinalIndex, source: IndexedSource, date: string, availabilityCutoff?: string): FeatureMissingness {
  const explicit = source.missingByDate.get(date)
  if (explicit && (!availabilityCutoff || explicit.availableAt <= availabilityCutoff)) return explicit.state
  if (source.descriptor.ownerTrackableId) return 'no-observation'
  const routine = index.routineStatusByDate.get(date)
  if (!routine || (availabilityCutoff && routine.availableAt > availabilityCutoff)) return 'no-check-in'
  return routine.status === 'completed' ? 'not-presented' : 'unanswered'
}
