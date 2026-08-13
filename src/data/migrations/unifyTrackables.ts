import type { DataRepository, RepositoryWrite } from '../repository/DataRepository.ts'
import type { EventDefinition, Trackable, TrackableVersion } from '../../domain/models/index.ts'

export const UNIFIED_TRACKABLE_SCHEMA_VERSION = 2

function normalizedName(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase()
}

function currentVersion(trackable: Trackable, versions: readonly TrackableVersion[]): TrackableVersion | undefined {
  return versions.find((item) => item.trackableId === trackable.id && item.version === trackable.currentVersion && !item.deletedAt)
}

function compatibleMatch(definition: EventDefinition, trackables: readonly Trackable[], versions: readonly TrackableVersion[]): Trackable | undefined {
  const sameId = trackables.find((item) => item.id === definition.id)
  if (sameId) return sameId
  const matches = trackables.filter((item) => {
    const version = currentVersion(item, versions)
    return item.categoryId === definition.categoryId
      && version?.inputType === 'boolean'
      && normalizedName(version.name) === normalizedName(definition.name)
  })
  return matches.length === 1 ? matches[0] : undefined
}

function correctSemantics(trackable: Trackable): Trackable {
  const recordSemantics = trackable.recordSemantics ?? (trackable.behavior === 'quick_log' ? 'occurrence' : 'daily_value')
  const quickLogEnabled = recordSemantics === 'occurrence'
    && (trackable.quickLogEnabled ?? trackable.behavior === 'quick_log')
  const { behavior: _legacyBehavior, ...current } = trackable
  return {
    ...current,
    recordSemantics,
    quickLogEnabled,
    quickLogTimingMode: quickLogEnabled ? trackable.quickLogTimingMode ?? 'either' : undefined,
  }
}

function needsSemanticsCorrection(trackable: Trackable): boolean {
  const corrected = correctSemantics(trackable)
  return 'behavior' in trackable
    || trackable.recordSemantics !== corrected.recordSemantics
    || trackable.quickLogEnabled !== corrected.quickLogEnabled
    || trackable.quickLogTimingMode !== corrected.quickLogTimingMode
}

/**
 * Converts the pre-unification Event stores without deleting them. The coherent write is
 * atomic in both repository implementations; deterministic identities make reruns safe.
 */
export async function migrateLegacyEvents(repository: DataRepository): Promise<void> {
  const [definitions, legacyFields, trackables, versions, records, assertions, routineItems, settings] = await Promise.all([
    repository.getAll('eventDefinitions'), repository.getAll('eventFields'), repository.getAll('trackables'),
    repository.getAll('trackableVersions'), repository.getAll('logRecords'), repository.getAll('eventDailyAssertions'),
    repository.getAll('routineItems'), repository.getAll('settings'),
  ])
  const mapping = new Map<string, string>()
  const mappedVersions = new Map<string, number>()
  const migratedTrackables: Trackable[] = trackables.filter(needsSemanticsCorrection).map(correctSemantics)
  const migratedVersions: TrackableVersion[] = []
  const knownTrackables = trackables.map(correctSemantics)

  for (const definition of definitions) {
    const match = compatibleMatch(definition, knownTrackables, versions)
    const id = match?.id ?? definition.id
    mapping.set(definition.id, id)
    mappedVersions.set(definition.id, match?.currentVersion ?? 1)
    if (match) {
      if (match.recordSemantics !== 'occurrence' || !match.quickLogEnabled || match.quickLogTimingMode !== definition.timingMode) {
        migratedTrackables.push({ ...match, recordSemantics: 'occurrence', quickLogEnabled: true, quickLogTimingMode: definition.timingMode })
      }
      continue
    }
    const trackable: Trackable = {
      id, categoryId: definition.categoryId, active: definition.active, archivedAt: definition.active ? null : definition.updatedAt,
      currentVersion: 1, tags: [], dataRole: definition.dataRole, recordSemantics: 'occurrence', quickLogEnabled: true, quickLogTimingMode: definition.timingMode,
      icon: definition.icon, colorRef: definition.colorRef, createdAt: definition.createdAt, updatedAt: definition.updatedAt,
      deletedAt: definition.deletedAt, revision: definition.revision, originDeviceId: definition.originDeviceId,
    }
    const version: TrackableVersion = {
      id: `${id}:legacy-event:v1`, trackableId: id, version: 1, name: definition.name, description: definition.description,
      inputType: 'boolean', valueDirection: 'neutral', configuration: { migratedFromEventDefinitionId: definition.id }, retiredAt: null,
      createdAt: definition.createdAt, updatedAt: definition.updatedAt, deletedAt: definition.deletedAt,
      revision: definition.revision, originDeviceId: definition.originDeviceId,
    }
    migratedTrackables.push(trackable)
    migratedVersions.push(version)
    knownTrackables.push(trackable)
  }

  const trackableFields = legacyFields.flatMap((field) => {
    const ownerTrackableId = mapping.get(field.eventDefinitionId)
    return ownerTrackableId ? [{
      ...field, ownerTrackableId, fieldTrackableId: field.trackableId, fieldTrackableVersion: field.trackableVersion,
    }] : []
  })
  const migratedRecords = records.flatMap((record) => {
    if (record.recordKind !== 'event' || !record.eventDefinitionId) return []
    const trackableId = mapping.get(record.eventDefinitionId)
    return trackableId ? [{ ...record, recordKind: 'quick_log' as const, trackableId, trackableVersion: mappedVersions.get(record.eventDefinitionId) ?? 1 }] : []
  })
  const migratedAssertions = assertions.flatMap((assertion) => {
    const trackableId = mapping.get(assertion.eventDefinitionId)
    return trackableId ? [{ ...assertion, trackableId }] : []
  })
  const migratedRoutineItems = routineItems.flatMap((item) => {
    if (item.target.kind !== 'event') return []
    const trackableId = mapping.get(item.target.eventDefinitionId)
    return trackableId ? [{ ...item, target: { kind: 'trackable' as const, trackableId } }] : []
  })
  const migratedSettings = settings.filter((item) => item.schemaVersion < UNIFIED_TRACKABLE_SCHEMA_VERSION)
    .map((item) => ({ ...item, schemaVersion: UNIFIED_TRACKABLE_SCHEMA_VERSION }))

  const writes: RepositoryWrite[] = [
    { collection: 'trackables', entities: migratedTrackables },
    { collection: 'trackableVersions', entities: migratedVersions },
    { collection: 'trackableFields', entities: trackableFields },
    { collection: 'trackableDailyAssertions', entities: migratedAssertions },
    { collection: 'logRecords', entities: migratedRecords },
    { collection: 'routineItems', entities: migratedRoutineItems },
    { collection: 'settings', entities: migratedSettings },
  ]
  await repository.saveTransaction(writes)
}
