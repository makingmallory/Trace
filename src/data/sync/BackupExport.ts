import type { DataRepository } from '../repository/DataRepository.ts'
import { serializeEntity, syncedCollections, TRACE_SCHEMA_VERSION } from './SyncProtocol.ts'
import { deserializeEntity, parseSyncRecord } from './SyncProtocol.ts'
import { migrateLegacyEvents } from '../migrations/unifyTrackables.ts'
import type { RepositoryWrite } from '../repository/DataRepository.ts'

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

export async function restoreTraceBackup(repository: DataRepository, value: unknown): Promise<number> {
  if (typeof value !== 'object' || value === null) throw new Error('Backup is not an object.')
  const candidate = value as { format?: unknown; backupVersion?: unknown; schemaVersion?: unknown; records?: unknown }
  if (candidate.format !== 'trace-backup' || candidate.backupVersion !== 1) throw new Error('This is not a supported Trace backup.')
  if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== TRACE_SCHEMA_VERSION) throw new Error('This backup uses an unsupported Trace schema.')
  if (!Array.isArray(candidate.records)) throw new Error('Backup records are missing.')
  const records = candidate.records.map(parseSyncRecord)
  const grouped = new Map<string, ReturnType<typeof deserializeEntity>[]>()
  for (const record of records) grouped.set(record.entityType, [...(grouped.get(record.entityType) ?? []), deserializeEntity(record)])
  const writes = [...grouped].map(([collection, entities]) => ({ collection, entities }) as RepositoryWrite)
  await repository.saveTransaction(writes)
  await migrateLegacyEvents(repository)
  return records.length
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
