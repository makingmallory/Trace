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
})
