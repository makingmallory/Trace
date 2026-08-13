import { describe, expect, it } from 'vitest'
import { InMemoryDataRepository } from '../local/InMemoryDataRepository.ts'
import { createTraceBackup, restoreTraceBackup } from './BackupExport.ts'

describe('Trace JSON backup export', () => {
  it('exports a versioned, portable snapshot without local sync configuration', async () => {
    const repository = new InMemoryDataRepository()
    await repository.save('categories', { id: 'cat', name: 'Private data', sortOrder: 0, active: true, createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z', deletedAt: null, revision: 1 })
    const backup = await createTraceBackup(repository, new Date('2026-08-11T00:00:00.000Z'))
    expect(backup).toMatchObject({ format: 'trace-backup', backupVersion: 1, schemaVersion: 2, createdAt: '2026-08-11T00:00:00.000Z' })
    expect(backup.records).toHaveLength(1)
    expect(JSON.stringify(backup)).not.toContain('endpointUrl')
  })

  it('restores a schema-v1 backup and migrates legacy event records without duplicates', async () => {
    const repository = new InMemoryDataRepository()
    const record = (entityType: string, id: string, payload: Record<string, unknown>) => ({ format: 'trace-sync', syncVersion: 1, schemaVersion: 1, entityType, id, revision: 1,
      createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z', deletedAt: null, baseRemoteRevision: 0, payload })
    const backup = { format: 'trace-backup', backupVersion: 1, schemaVersion: 1, records: [
      record('eventDefinitions', 'pilates', { name: 'Pilates', categoryId: 'activity', timingMode: 'point', dataRole: 'behavior', active: true, nightlyReminderDefault: 'never', treatmentFollowUpEnabled: false }),
      record('logRecords', 'entry', { recordKind: 'event', eventDefinitionId: 'pilates', eventTimingKind: 'point', localDate: '2026-08-10', startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'google_restore' }),
    ] }
    expect(await restoreTraceBackup(repository, backup)).toBe(2)
    await restoreTraceBackup(repository, backup)
    expect(await repository.getById('trackables', 'pilates')).toMatchObject({ recordSemantics: 'occurrence', quickLogEnabled: true })
    expect(await repository.getById('logRecords', 'entry')).toMatchObject({ recordKind: 'quick_log', trackableId: 'pilates', startTime: null })
    expect(await repository.getAll('logRecords')).toHaveLength(1)
  })

  it('round-trips custom choice values, defaults, and version-pinned structured fields', async () => {
    const source = new InMemoryDataRepository()
    const base = { createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z', deletedAt: null, revision: 1 }
    await source.save('trackableVersions', { ...base, id: 'owner-v1', trackableId: 'owner', version: 1, name: 'Owner', inputType: 'single_choice', valueDirection: 'neutral', configuration: { allowOther: true, defaultAnswer: { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['option'] } }, retiredAt: null })
    await source.save('trackableFields', { ...base, id: 'field', ownerTrackableId: 'owner', ownerTrackableVersion: 1, fieldTrackableId: 'dose', fieldTrackableVersion: 2, sortOrder: 0, enabled: true, completionBehavior: 'expected', required: true })
    await source.save('observations', { ...base, id: 'observation', logRecordId: 'record', trackableId: 'owner', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'choice', value: null } }, customChoiceValue: 'Custom value' })
    const target = new InMemoryDataRepository()
    await restoreTraceBackup(target, await createTraceBackup(source))
    expect(await target.getById('trackableVersions', 'owner-v1')).toMatchObject({ configuration: { allowOther: true } })
    expect(await target.getById('trackableFields', 'field')).toMatchObject({ ownerTrackableVersion: 1, fieldTrackableId: 'dose', required: true })
    expect(await target.getById('observations', 'observation')).toMatchObject({ customChoiceValue: 'Custom value' })
  })

  it('round-trips Daily Check-In and Trackable reminder configuration without delivery state', async () => {
    const source = new InMemoryDataRepository()
    const base = { createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z', deletedAt: null, revision: 1 }
    await source.save('settings', { ...base, id: 'settings', schemaVersion: 2, themeId: 'fantasy', reducedMotion: false, locale: 'en-US', dateFormat: 'local', timeFormat: '12-hour', firstDayOfWeek: 0, units: {}, dailyCheckInReminder: { enabled: true, time: '21:00' } })
    await source.save('trackables', { ...base, id: 'pilates', categoryId: 'activity', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'behavior', recordSemantics: 'occurrence', quickLogEnabled: true, reminder: { enabled: true, time: '19:00', weekdays: [1, 3, 5], skipIfAlreadyLoggedToday: true } })
    const target = new InMemoryDataRepository()
    await restoreTraceBackup(target, await createTraceBackup(source))
    expect(await target.getById('settings', 'settings')).toMatchObject({ dailyCheckInReminder: { time: '21:00' } })
    expect(await target.getById('trackables', 'pilates')).toMatchObject({ reminder: { weekdays: [1, 3, 5], skipIfAlreadyLoggedToday: true } })
  })
})
