import { describe, expect, it } from 'vitest'
import type { RepositoryCollectionMap } from '../repository/DataRepository.ts'
import { deserializeEntity, parseSyncRecord, serializeEntity, syncedCollections, type SyncedCollection } from './SyncProtocol.ts'

const timestamps = { id: 'entity-1', createdAt: '2026-08-10T01:02:03.000Z', updatedAt: '2026-08-11T04:05:06.000Z', deletedAt: null, revision: 3, originDeviceId: 'device-1' }
const payloads: Record<SyncedCollection, Record<string, unknown>> = {
  categories: { name: 'Category', sortOrder: 0, active: true },
  trackables: { categoryId: 'cat', active: true, archivedAt: null, currentVersion: 2, tags: ['tag'], dataRole: 'measurement', recordSemantics: 'daily_value', quickLogEnabled: false },
  trackableFields: { ownerTrackableId: 'quick', fieldTrackableId: 'track', fieldTrackableVersion: 2, sortOrder: 0, enabled: true, completionBehavior: 'optional' },
  trackableDailyAssertions: { date: '2026-08-10', trackableId: 'quick', status: 'did_not_occur', recordedAt: '2026-08-11T03:00:00.000Z' },
  trackableVersions: { trackableId: 'track', version: 2, name: 'Metric', inputType: 'multiSelect', valueDirection: 'neutral', configuration: { emptyAllowed: true }, retiredAt: null },
  trackableOptions: { optionId: 'option-stable', trackableId: 'track', trackableVersion: 2, storedValue: 'zero', label: 'Zero', sortOrder: 0, active: true },
  routines: { name: 'Nightly', active: true, scheduleType: 'daily' },
  routineItems: { routineId: 'routine', target: { kind: 'trackable', trackableId: 'track' }, sortOrder: 1, enabled: true, frequency: 'daily', completionBehavior: 'expected', trendTrackingMode: 'none', eventReminderBehavior: 'never', conditionalRule: { sourceTrackableId: 'other', operator: 'equals', value: false } },
  eventDefinitions: { name: 'Event', categoryId: 'cat', timingMode: 'either', dataRole: 'other', active: true, nightlyReminderDefault: 'never', treatmentFollowUpEnabled: false },
  eventFields: { eventDefinitionId: 'event', trackableId: 'track', trackableVersion: 2, sortOrder: 0, enabled: true, completionBehavior: 'optional' },
  logRecords: { recordKind: 'event', eventDefinitionId: 'event', eventTimingKind: 'duration', localDate: '2026-08-10', startTimePrecision: 'exact', startTime: '2026-08-10T23:55:00.000Z', startTimeOfDay: null, endLocalDate: '2026-08-12', endTimePrecision: 'exact', endTime: '2026-08-12T01:05:00.000Z', endTimeOfDay: null, ongoing: false, timezone: 'America/Chicago', status: 'completed', source: 'app' },
  observations: { logRecordId: 'record', trackableId: 'track', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'boolean', value: false } }, trendValue: 'same' },
  observationSelections: { observationId: 'observation', optionId: 'option-stable' },
  eventDailyAssertions: { date: '2026-08-10', eventDefinitionId: 'event', status: 'did_not_occur', recordedAt: '2026-08-11T03:00:00.000Z' },
  relationships: { sourceRecordId: 'source', targetRecordId: 'target', relationshipType: 'associated_with', provenance: 'manual', confirmedByUser: true, metadata: { note: 'kept' } },
  relationshipAssessments: { relationshipId: 'relationship', assessmentType: 'effectiveness', value: 0, recordedAt: '2026-08-11T03:00:00.000Z' },
  settings: { schemaVersion: 1, themeId: 'fantasy', reducedMotion: false, locale: 'en-US', dateFormat: 'local', timeFormat: '12-hour', firstDayOfWeek: 0, units: {} },
}

describe('production sync protocol', () => {
  it('round-trips every production entity family without changing stable IDs or values', () => {
    for (const collection of syncedCollections) {
      const entity = { ...timestamps, ...payloads[collection] } as unknown as RepositoryCollectionMap[typeof collection]
      const record = serializeEntity(collection, entity, 7)
      expect(record.id).toBe('entity-1')
      expect(record.revision).toBe(3)
      expect(deserializeEntity(record)).toEqual(entity)
    }
  })

  it('preserves date-only, time-of-day, exact, multi-day, and ongoing timing without invented timestamps', () => {
    const cases = [
      { startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false },
      { startTimePrecision: 'timeOfDay', startTime: null, startTimeOfDay: 'evening', endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false },
      { startTimePrecision: 'exact', startTime: '2026-08-10T12:34:56.000Z', startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false },
      { startTimePrecision: 'exact', startTime: '2026-08-10T12:34:56.000Z', startTimeOfDay: null, endLocalDate: '2026-08-13', endTimePrecision: 'exact', endTime: '2026-08-13T08:00:00.000Z', endTimeOfDay: null, ongoing: false },
      { startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: true },
    ]
    for (const timing of cases) {
      const entity = { ...timestamps, ...payloads.logRecords, ...timing }
      expect(deserializeEntity(serializeEntity('logRecords', entity as RepositoryCollectionMap['logRecords']))).toEqual(entity)
    }
  })

  it('preserves missing, numeric zero, explicit No, and empty multi-select as distinct answers', () => {
    const answers = [{ state: 'unanswered' }, { state: 'answered', value: { kind: 'number', value: 0 } }, { state: 'answered', value: { kind: 'boolean', value: false } }, { state: 'answered', value: { kind: 'choice', value: null } }]
    for (const answer of answers) {
      const entity = { ...timestamps, ...payloads.observations, answer }
      const restored = deserializeEntity(serializeEntity('observations', entity as RepositoryCollectionMap['observations'])) as RepositoryCollectionMap['observations']
      expect(restored.answer).toEqual(answer)
    }
  })

  it('rejects future formats and malformed payloads before restore', () => {
    const valid = serializeEntity('categories', { ...timestamps, ...payloads.categories } as RepositoryCollectionMap['categories'])
    expect(() => parseSyncRecord({ ...valid, syncVersion: 2 })).toThrow(/incompatible/i)
    expect(() => parseSyncRecord({ ...valid, payload: {} })).toThrow(/missing name/i)
  })

  it('accepts the original schema-v2 Trackable payload so the correction migration can translate it', () => {
    const current = serializeEntity('trackables', { ...timestamps, ...payloads.trackables } as RepositoryCollectionMap['trackables'])
    const payload: Record<string, unknown> = { ...current.payload, behavior: 'quick_log' }
    delete payload.recordSemantics
    delete payload.quickLogEnabled
    const legacy = { ...current, payload }
    expect(parseSyncRecord(legacy).payload).toMatchObject({ behavior: 'quick_log' })
  })
})
