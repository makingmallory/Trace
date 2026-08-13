import type { RepositoryCollection, RepositoryCollectionMap } from '../repository/DataRepository.ts'

export const TRACE_SYNC_FORMAT = 'trace-sync' as const
export const TRACE_SYNC_VERSION = 1 as const
export const TRACE_SCHEMA_VERSION = 2 as const

export const syncedCollections = [
  'categories', 'trackables', 'trackableVersions', 'trackableOptions', 'routines',
  'trackableFields', 'trackableDailyAssertions',
  'routineItems', 'eventDefinitions', 'eventFields', 'logRecords', 'observations',
  'observationSelections', 'eventDailyAssertions', 'relationships',
  'relationshipAssessments', 'settings',
] as const satisfies readonly RepositoryCollection[]

export type SyncedCollection = (typeof syncedCollections)[number]
export type SyncedEntity = RepositoryCollectionMap[SyncedCollection]

export interface SyncRecord {
  format: typeof TRACE_SYNC_FORMAT
  syncVersion: typeof TRACE_SYNC_VERSION
  schemaVersion: 1 | typeof TRACE_SCHEMA_VERSION
  entityType: SyncedCollection
  id: string
  revision: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  originDeviceId?: string
  baseRemoteRevision: number
  remoteRevision?: number
  payload: Record<string, unknown>
}

const requiredPayloadFields: Readonly<Record<SyncedCollection, readonly string[]>> = {
  categories: ['name', 'sortOrder', 'active'],
  trackables: ['categoryId', 'active', 'archivedAt', 'currentVersion', 'tags', 'dataRole', 'recordSemantics', 'quickLogEnabled'],
  trackableFields: ['ownerTrackableId', 'fieldTrackableId', 'fieldTrackableVersion', 'sortOrder', 'enabled', 'completionBehavior'],
  trackableDailyAssertions: ['date', 'trackableId', 'status', 'recordedAt'],
  trackableVersions: ['trackableId', 'version', 'name', 'inputType', 'valueDirection', 'configuration', 'retiredAt'],
  trackableOptions: ['optionId', 'trackableId', 'trackableVersion', 'storedValue', 'label', 'sortOrder', 'active'],
  routines: ['name', 'active', 'scheduleType'],
  routineItems: ['routineId', 'target', 'sortOrder', 'enabled', 'frequency', 'completionBehavior', 'trendTrackingMode', 'eventReminderBehavior'],
  eventDefinitions: ['name', 'categoryId', 'timingMode', 'dataRole', 'active', 'nightlyReminderDefault', 'treatmentFollowUpEnabled'],
  eventFields: ['eventDefinitionId', 'trackableId', 'trackableVersion', 'sortOrder', 'enabled', 'completionBehavior'],
  logRecords: ['recordKind', 'localDate', 'startTimePrecision', 'startTime', 'startTimeOfDay', 'endLocalDate', 'endTimePrecision', 'endTime', 'endTimeOfDay', 'ongoing', 'timezone', 'status', 'source'],
  observations: ['logRecordId', 'trackableId', 'trackableVersion', 'answer'],
  observationSelections: ['observationId', 'optionId'],
  eventDailyAssertions: ['date', 'eventDefinitionId', 'status', 'recordedAt'],
  relationships: ['sourceRecordId', 'targetRecordId', 'relationshipType', 'provenance', 'confirmedByUser', 'metadata'],
  relationshipAssessments: ['relationshipId', 'assessmentType', 'value', 'recordedAt'],
  settings: ['schemaVersion', 'themeId', 'reducedMotion', 'locale', 'dateFormat', 'timeFormat', 'firstDayOfWeek', 'units'],
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function recordKey(entityType: SyncedCollection, id: string): string {
  return `${entityType}:${id}`
}

export function serializeEntity<K extends SyncedCollection>(
  entityType: K,
  entity: RepositoryCollectionMap[K],
  baseRemoteRevision = 0,
): SyncRecord {
  const { id, revision, createdAt, updatedAt, deletedAt, originDeviceId, ...payload } = entity
  return {
    format: TRACE_SYNC_FORMAT,
    syncVersion: TRACE_SYNC_VERSION,
    schemaVersion: TRACE_SCHEMA_VERSION,
    entityType,
    id,
    revision,
    createdAt,
    updatedAt,
    deletedAt,
    ...(originDeviceId ? { originDeviceId } : {}),
    baseRemoteRevision,
    payload: structuredClone(payload) as Record<string, unknown>,
  }
}

export function parseSyncRecord(value: unknown): SyncRecord {
  if (!isObject(value)) throw new Error('A remote sync record is not an object.')
  if (value.format !== TRACE_SYNC_FORMAT || value.syncVersion !== TRACE_SYNC_VERSION) {
    throw new Error('This backup uses an incompatible Trace sync format.')
  }
  if (value.schemaVersion !== 1 && value.schemaVersion !== TRACE_SCHEMA_VERSION) throw new Error('This backup uses an incompatible Trace data schema.')
  if (typeof value.entityType !== 'string' || !syncedCollections.includes(value.entityType as SyncedCollection)) throw new Error('A remote record has an unknown entity type.')
  if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 200) throw new Error('A remote record has an invalid stable ID.')
  if (!Number.isInteger(value.revision) || (value.revision as number) < 1) throw new Error('A remote record has an invalid revision.')
  if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) throw new Error('A remote record has invalid timestamps.')
  if (value.deletedAt !== null && !isTimestamp(value.deletedAt)) throw new Error('A remote record has an invalid tombstone timestamp.')
  if (!isObject(value.payload)) throw new Error('A remote record has an invalid payload.')
  const entityType = value.entityType as SyncedCollection
  const legacyTrackable = entityType === 'trackables'
    && (value.schemaVersion === 1 || ('behavior' in value.payload && !('recordSemantics' in value.payload)))
  const fields = legacyTrackable
    ? requiredPayloadFields.trackables.filter((field) => field !== 'recordSemantics' && field !== 'quickLogEnabled')
    : requiredPayloadFields[entityType]
  for (const field of fields) {
    if (!(field in value.payload)) throw new Error(`A remote ${entityType} record is missing ${field}.`)
  }
  if (value.remoteRevision !== undefined && (!Number.isInteger(value.remoteRevision) || (value.remoteRevision as number) < 1)) throw new Error('A remote record has an invalid checkpoint revision.')
  if (value.baseRemoteRevision !== undefined && (!Number.isInteger(value.baseRemoteRevision) || (value.baseRemoteRevision as number) < 0)) throw new Error('A remote record has an invalid base revision.')
  return value as unknown as SyncRecord
}

export function deserializeEntity(record: SyncRecord): SyncedEntity {
  const parsed = parseSyncRecord(record)
  return {
    ...structuredClone(parsed.payload),
    id: parsed.id,
    revision: parsed.revision,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    deletedAt: parsed.deletedAt,
    ...(parsed.originDeviceId ? { originDeviceId: parsed.originDeviceId } : {}),
  } as SyncedEntity
}

export function fingerprint(record: SyncRecord): string {
  const { baseRemoteRevision: _base, remoteRevision: _remote, ...content } = record
  return stableStringify(content)
}
