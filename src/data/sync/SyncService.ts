import type { SyncMetadata } from '../../domain/models/index.ts'
import type { DataRepository, RepositoryWrite } from '../repository/DataRepository.ts'
import type { PushConflict, SyncProvider } from './SyncProvider.ts'
import {
  deserializeEntity,
  fingerprint,
  recordKey,
  serializeEntity,
  syncedCollections,
  type SyncRecord,
  type SyncedCollection,
} from './SyncProtocol.ts'
import { migrateLegacyEvents } from '../migrations/unifyTrackables.ts'

export const SYNC_METADATA_ID = 'sync.primary'
export const DEFAULT_SYNC_BATCH_SIZE = 200

export type SyncStateName = 'not-connected' | 'synced' | 'changes-waiting' | 'syncing' | 'offline' | 'error'

export interface SyncRunResult {
  pulled: number
  pushed: number
  pending: number
  conflicts: readonly PushConflict[]
  checkpoint: number
}

function defaultMetadata(): SyncMetadata {
  return {
    id: SYNC_METADATA_ID,
    schemaVersion: 1,
    deviceId: crypto.randomUUID(),
    lastSuccessfulSyncAt: null,
    pendingChangeCount: 0,
    lastError: null,
    remoteCheckpoint: 0,
    recordStates: {},
  }
}

export class SyncService {
  private readonly repository: DataRepository
  private readonly provider: SyncProvider
  private readonly now: () => Date
  private readonly batchSize: number

  constructor(
    repository: DataRepository,
    provider: SyncProvider,
    now: () => Date = () => new Date(),
    batchSize = DEFAULT_SYNC_BATCH_SIZE,
  ) {
    this.repository = repository
    this.provider = provider
    this.now = now
    this.batchSize = batchSize
  }

  async metadata(): Promise<SyncMetadata> {
    return await this.repository.getById('syncMetadata', SYNC_METADATA_ID) ?? defaultMetadata()
  }

  async countLocalRecords(): Promise<number> {
    const groups = await Promise.all(syncedCollections.map((collection) => this.repository.getAll(collection)))
    return groups.reduce((sum, group) => sum + group.length, 0)
  }

  async countPending(): Promise<number> {
    const metadata = await this.metadata()
    let count = 0
    for (const collection of syncedCollections) {
      for (const entity of await this.repository.getAll(collection)) {
        const key = recordKey(collection, entity.id)
        const record = serializeEntity(collection, entity, metadata.recordStates[key]?.remoteRevision ?? 0)
        if (fingerprint(record) !== metadata.recordStates[key]?.fingerprint) count += 1
      }
    }
    return count
  }

  async sync(): Promise<SyncRunResult> {
    let metadata = await this.metadata()
    try {
      const health = await this.provider.healthCheck()
      if (!health.available) throw new Error(health.message ?? 'Google Sheets backup is unavailable.')

      const pull = await this.provider.pullChanges(metadata.remoteCheckpoint)
      const states = { ...metadata.recordStates }
      const remoteWrites = new Map<SyncedCollection, unknown[]>()
      const conflicts: PushConflict[] = []
      const blockedKeys = new Set<string>()

      for (const remote of pull.records) {
        const key = recordKey(remote.entityType, remote.id)
        const local = await this.repository.getById(remote.entityType, remote.id) as never
        const prior = states[key]
        const remoteFingerprint = fingerprint(remote)
        const localRecord = local ? serializeEntity(remote.entityType, local, prior?.remoteRevision ?? 0) : null
        const localFingerprint = localRecord ? fingerprint(localRecord) : null
        const localChanged = localRecord !== null && localFingerprint !== prior?.fingerprint
        const remoteChanged = !prior || (remote.remoteRevision ?? 0) > prior.remoteRevision

        if (localRecord && localFingerprint === remoteFingerprint) {
          states[key] = { remoteRevision: remote.remoteRevision!, entityRevision: remote.revision, fingerprint: remoteFingerprint }
        } else if (!localRecord || !localChanged) {
          const list = remoteWrites.get(remote.entityType) ?? []
          list.push(deserializeEntity(remote))
          remoteWrites.set(remote.entityType, list)
          states[key] = { remoteRevision: remote.remoteRevision!, entityRevision: remote.revision, fingerprint: remoteFingerprint }
        } else if (remoteChanged) {
          conflicts.push({ local: localRecord, remote })
          blockedKeys.add(key)
        }
      }

      metadata = { ...metadata, remoteCheckpoint: pull.checkpoint, recordStates: states }
      const writes: RepositoryWrite[] = []
      for (const [collection, entities] of remoteWrites) writes.push({ collection, entities } as RepositoryWrite)
      writes.push({ collection: 'syncMetadata', entities: [metadata] })
      await this.repository.saveTransaction(writes)
      await migrateLegacyEvents(this.repository)

      const pendingRecords: SyncRecord[] = []
      for (const collection of syncedCollections) {
        for (const entity of await this.repository.getAll(collection)) {
          const key = recordKey(collection, entity.id)
          if (blockedKeys.has(key)) continue
          const state = states[key]
          const record = serializeEntity(collection, entity, state?.remoteRevision ?? 0)
          if (fingerprint(record) !== state?.fingerprint) pendingRecords.push(record)
        }
      }

      let pushed = 0
      let checkpoint = pull.checkpoint
      for (let offset = 0; offset < pendingRecords.length; offset += this.batchSize) {
        const result = await this.provider.pushBatch(pendingRecords.slice(offset, offset + this.batchSize))
        checkpoint = Math.max(checkpoint, result.checkpoint)
        pushed += result.accepted.length
        for (const accepted of result.accepted) {
          states[recordKey(accepted.entityType, accepted.id)] = {
            remoteRevision: accepted.remoteRevision!, entityRevision: accepted.revision, fingerprint: fingerprint(accepted),
          }
        }
        conflicts.push(...result.conflicts)
        for (const conflict of result.conflicts) blockedKeys.add(recordKey(conflict.local.entityType, conflict.local.id))
      }

      const pending = pendingRecords.length - pushed
      metadata = {
        ...metadata,
        lastSuccessfulSyncAt: this.now().toISOString(),
        pendingChangeCount: pending,
        lastError: conflicts.length ? `${conflicts.length} record conflict${conflicts.length === 1 ? '' : 's'} need attention.` : null,
        remoteCheckpoint: checkpoint,
        recordStates: states,
      }
      await this.repository.save('syncMetadata', metadata)
      return { pulled: [...remoteWrites.values()].reduce((sum, values) => sum + values.length, 0), pushed, pending, conflicts, checkpoint }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed.'
      await this.repository.save('syncMetadata', { ...metadata, pendingChangeCount: await this.countPending(), lastError: message })
      throw error
    }
  }
}
