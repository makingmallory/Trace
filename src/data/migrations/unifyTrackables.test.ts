import { describe, expect, it } from 'vitest'
import { InMemoryDataRepository } from '../local/InMemoryDataRepository.ts'
import { migrateLegacyEvents } from './unifyTrackables.ts'

const base = { createdAt: '2026-08-10T01:00:00.000Z', updatedAt: '2026-08-10T02:00:00.000Z', deletedAt: null, revision: 3 }

describe('unified Trackable migration', () => {
  it('reconciles a compatible duplicate and preserves fields, timing, tombstones, routines, assertions, and relationships idempotently', async () => {
    const repository = new InMemoryDataRepository()
    await repository.save('trackables', { ...base, id: 'daily-pilates', categoryId: 'activity', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'behavior' })
    await repository.save('trackableVersions', { ...base, id: 'pilates-v1', trackableId: 'daily-pilates', version: 1, name: 'Pilates', inputType: 'boolean', valueDirection: 'neutral', configuration: {}, retiredAt: null })
    await repository.save('eventDefinitions', { ...base, id: 'event-pilates', name: 'Pilates', categoryId: 'activity', timingMode: 'either', dataRole: 'behavior', active: true, nightlyReminderDefault: 'never', treatmentFollowUpEnabled: false })
    await repository.save('eventFields', { ...base, id: 'field', eventDefinitionId: 'event-pilates', trackableId: 'severity', trackableVersion: 2, sortOrder: 0, enabled: true, completionBehavior: 'optional' })
    await repository.save('logRecords', { ...base, id: 'entry', recordKind: 'event', eventDefinitionId: 'event-pilates', eventTimingKind: 'duration', localDate: '2026-08-10', startTimePrecision: 'timeOfDay', startTime: null, startTimeOfDay: 'morning', endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: true, timezone: null, status: 'completed', source: 'app' })
    await repository.save('eventDailyAssertions', { ...base, id: 'assertion', date: '2026-08-09', eventDefinitionId: 'event-pilates', status: 'did_not_occur', recordedAt: base.updatedAt })
    await repository.save('routineItems', { ...base, id: 'routine-item', routineId: 'routine', target: { kind: 'event', eventDefinitionId: 'event-pilates' }, sortOrder: 2, enabled: true, frequency: 'every_day', completionBehavior: 'expected', trendTrackingMode: 'none', eventReminderBehavior: 'if_not_logged' })
    await repository.save('relationships', { ...base, id: 'relationship', sourceRecordId: 'entry', targetRecordId: 'treatment', relationshipType: 'treated_by', provenance: 'manual', confirmedByUser: true, metadata: {} })

    await migrateLegacyEvents(repository)
    await migrateLegacyEvents(repository)

    expect((await repository.getAll('trackables')).filter((item) => item.recordSemantics === 'occurrence' && item.quickLogEnabled)).toEqual([expect.objectContaining({ id: 'daily-pilates', quickLogTimingMode: 'either' })])
    expect(await repository.getById('trackableFields', 'field')).toMatchObject({ ownerTrackableId: 'daily-pilates', fieldTrackableId: 'severity', fieldTrackableVersion: 2 })
    expect(await repository.getById('logRecords', 'entry')).toMatchObject({ recordKind: 'quick_log', trackableId: 'daily-pilates', startTimeOfDay: 'morning', ongoing: true, revision: 3 })
    expect(await repository.getById('trackableDailyAssertions', 'assertion')).toMatchObject({ trackableId: 'daily-pilates', status: 'did_not_occur' })
    expect(await repository.getById('routineItems', 'routine-item')).toMatchObject({ target: { kind: 'trackable', trackableId: 'daily-pilates' }, sortOrder: 2 })
    expect(await repository.getById('relationships', 'relationship')).toMatchObject({ sourceRecordId: 'entry', targetRecordId: 'treatment' })
    expect(await repository.getAll('logRecords')).toHaveLength(1)
  })

  it('preserves separate identities when same-name configuration is not compatible', async () => {
    const repository = new InMemoryDataRepository()
    await repository.save('trackables', { ...base, id: 'scale', categoryId: 'symptoms', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'symptom', behavior: 'daily' })
    await repository.save('trackableVersions', { ...base, id: 'scale-v1', trackableId: 'scale', version: 1, name: 'Migraine', inputType: 'scale', scaleMin: 0, scaleMax: 5, scaleStep: 1, valueDirection: 'worse', configuration: {}, retiredAt: null })
    await repository.save('eventDefinitions', { ...base, id: 'migraine-event', name: 'Migraine', categoryId: 'symptoms', timingMode: 'duration', dataRole: 'symptom', active: false, nightlyReminderDefault: 'never', treatmentFollowUpEnabled: false })
    await migrateLegacyEvents(repository)
    expect(await repository.getById('trackables', 'scale')).toMatchObject({ recordSemantics: 'daily_value', quickLogEnabled: false })
    expect(await repository.getById('trackables', 'migraine-event')).toMatchObject({ recordSemantics: 'occurrence', quickLogEnabled: true, active: false, archivedAt: base.updatedAt })
    expect(await repository.getById('trackables', 'scale')).not.toHaveProperty('behavior')
  })
})
