import { describe, expect, it } from 'vitest'
import { InMemoryDataRepository } from '../local/InMemoryDataRepository.ts'
import { createTraceBackup } from './BackupExport.ts'

describe('Trace JSON backup export', () => {
  it('exports a versioned, portable snapshot without local sync configuration', async () => {
    const repository = new InMemoryDataRepository()
    await repository.save('categories', { id: 'cat', name: 'Private data', sortOrder: 0, active: true, createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z', deletedAt: null, revision: 1 })
    const backup = await createTraceBackup(repository, new Date('2026-08-11T00:00:00.000Z'))
    expect(backup).toMatchObject({ format: 'trace-backup', backupVersion: 1, schemaVersion: 1, createdAt: '2026-08-11T00:00:00.000Z' })
    expect(backup.records).toHaveLength(1)
    expect(JSON.stringify(backup)).not.toContain('endpointUrl')
  })
})
