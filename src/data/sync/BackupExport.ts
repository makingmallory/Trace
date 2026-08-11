import type { DataRepository } from '../repository/DataRepository.ts'
import { serializeEntity, syncedCollections, TRACE_SCHEMA_VERSION } from './SyncProtocol.ts'

export interface TraceBackup {
  format: 'trace-backup'
  backupVersion: 1
  schemaVersion: typeof TRACE_SCHEMA_VERSION
  createdAt: string
  records: ReturnType<typeof serializeEntity>[]
}

export async function createTraceBackup(repository: DataRepository, now = new Date()): Promise<TraceBackup> {
  const records: ReturnType<typeof serializeEntity>[] = []
  for (const collection of syncedCollections) {
    for (const entity of await repository.getAll(collection)) records.push(serializeEntity(collection, entity))
  }
  return { format: 'trace-backup', backupVersion: 1, schemaVersion: TRACE_SCHEMA_VERSION, createdAt: now.toISOString(), records }
}

export function downloadTraceBackup(backup: TraceBackup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `trace-backup-${backup.createdAt.slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
