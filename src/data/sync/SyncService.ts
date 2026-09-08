import type { SyncMetadata, SyncRecordSnapshot } from '../../domain/models/index.ts'
import type { DataRepository, RepositoryWrite } from '../repository/DataRepository.ts'
import { deduplicateObservationSelections } from '../migrations/deduplicateObservationSelections.ts'
import type { PushConflict, SyncProvider } from './SyncProvider.ts'
import type { SyncConflictResolution } from './SyncConflicts.ts'
import { createSyncConflict, normalizeSyncConflicts, stateForRemote, trySafeConflictResolution } from './SyncConflicts.ts'
import {
  deserializeEntity,
  fingerprint,
  parseSyncRecord,
  recordKey,
  serializeEntity,
  syncedCollections,
  type SyncRecord,
  type SyncedCollection,
} from './SyncProtocol.ts'
import { migrateLegacyEvents } from '../migrations/unifyTrackables.ts'
import { publishSyncStatusChange } from './SyncStatus.ts'

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

function parseConflictRecord(record: SyncRecordSnapshot): SyncRecord {
  return parseSyncRecord(record)
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
    unresolvedConflicts: {},
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
    return this.countPendingWithStates(metadata.recordStates)
  }

  private async countPendingWithStates(
    states: SyncMetadata['recordStates'],
    replacement?: { readonly collection: SyncedCollection; readonly entity: { readonly id: string } },
  ): Promise<number> {
    let count = 0
    for (const collection of syncedCollections) {
      let entities = await this.repository.getAll(collection) as readonly { readonly id: string }[]
      if (replacement?.collection === collection) {
        const found = entities.some((entity) => entity.id === replacement.entity.id)
        entities = found
          ? entities.map((entity) => entity.id === replacement.entity.id ? replacement.entity : entity)
          : [...entities, replacement.entity]
      }
      for (const entity of entities) {
        const key = recordKey(collection, entity.id)
        const record = serializeEntity(collection, entity as never, states[key]?.remoteRevision ?? 0)
        if (fingerprint(record) !== states[key]?.fingerprint) count += 1
      }
    }
    return count
  }

  async conflicts(): Promise<readonly PushConflict[]> {
    return Object.values(normalizeSyncConflicts(await this.metadata())).map(({ local, remote }) => ({
      local: parseConflictRecord(local),
      remote: parseConflictRecord(remote),
    }))
  }

  async conflictSnapshots() {
    await this.resolveStoredSafeConflicts()
    return Object.values(normalizeSyncConflicts(await this.metadata()))
  }

  private async resolveStoredSafeConflicts(): Promise<void> {
    let changed = false
    while (true) {
      const metadata = await this.metadata()
      const conflicts = normalizeSyncConflicts(metadata)
      let resolved = false
      for (const [conflictId, conflict] of Object.entries(conflicts)) {
        const local = parseConflictRecord(conflict.local)
        const remote = parseConflictRecord(conflict.remote)
        const currentLocal = await this.repository.getById(local.entityType, local.id)
        if (!currentLocal) continue
        const currentRecord = serializeEntity(local.entityType, currentLocal as never, local.baseRemoteRevision)
        const safe = trySafeConflictResolution(currentRecord, remote, conflict.base ? parseConflictRecord(conflict.base) : undefined, this.now().toISOString())
        if (!safe) continue

        delete conflicts[conflictId]
        const states = { ...metadata.recordStates, [conflictId]: safe.remoteState }
        const pendingChangeCount = await this.countPendingWithStates(states, { collection: local.entityType, entity: safe.entity })
        const remaining = Object.keys(conflicts).length
        const nextMetadata: SyncMetadata = {
          ...metadata,
          recordStates: states,
          unresolvedConflicts: conflicts,
          pendingChangeCount,
          lastError: remaining ? `${remaining} record conflict${remaining === 1 ? '' : 's'} need attention.` : null,
        }
        await this.repository.saveTransaction([
          { collection: local.entityType, entities: [safe.entity] } as RepositoryWrite,
          { collection: 'syncMetadata', entities: [nextMetadata] },
        ])
        changed = true
        resolved = true
        break
      }
      if (!resolved) break
    }
    if (changed) publishSyncStatusChange()
  }

  async resolveConflict(conflictId: string, resolution: SyncConflictResolution): Promise<void> {
    const metadata = await this.metadata()
    const conflicts = normalizeSyncConflicts(metadata)
    const conflict = conflicts[conflictId]
    if (!conflict) throw new Error('This sync conflict is no longer available.')

    const local = parseConflictRecord(conflict.local)
    const remote = parseConflictRecord(conflict.remote)
    const collection = local.entityType
    const currentLocal = await this.repository.getById(collection, local.id)
    if (!currentLocal && resolution === 'keep-local') throw new Error('The local record is no longer available.')

    delete conflicts[conflictId]
    const states = { ...metadata.recordStates, [conflictId]: stateForRemote(remote) }
    const remaining = Object.keys(conflicts).length
    const resolvedEntity = resolution === 'keep-synced' ? deserializeEntity(remote) : currentLocal!
    const pendingChangeCount = await this.countPendingWithStates(states, { collection, entity: resolvedEntity })
    const nextMetadata: SyncMetadata = {
      ...metadata,
      recordStates: states,
      unresolvedConflicts: conflicts,
      pendingChangeCount,
      lastError: remaining ? `${remaining} record conflict${remaining === 1 ? '' : 's'} need attention.` : null,
    }
    const writes: RepositoryWrite[] = [{ collection: 'syncMetadata', entities: [nextMetadata] }]
    writes.unshift({ collection, entities: [resolvedEntity] } as RepositoryWrite)
    await this.repository.saveTransaction(writes)
    publishSyncStatusChange()
  }

  async sync(): Promise<SyncRunResult> {
    let metadata = await this.metadata()
    try {
      const health = await this.provider.healthCheck()
      if (!health.available) throw new Error(health.message ?? 'Google Sheets backup is unavailable.')

      const pull = await this.provider.pullChanges(metadata.remoteCheckpoint)
      const states = { ...metadata.recordStates }
      const remoteWrites = new Map<SyncedCollection, unknown[]>()
      const unresolved = normalizeSyncConflicts(metadata)
      const blockedKeys = new Set(Object.keys(unresolved))
      const detectedAt = this.now().toISOString()

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
          states[key] = stateForRemote(remote)
          delete unresolved[key]
          blockedKeys.delete(key)
        } else if (!localRecord || !localChanged) {
          const list = remoteWrites.get(remote.entityType) ?? []
          list.push(deserializeEntity(remote))
          remoteWrites.set(remote.entityType, list)
          states[key] = stateForRemote(remote)
          delete unresolved[key]
          blockedKeys.delete(key)
        } else if (remoteChanged) {
          const safe = trySafeConflictResolution(localRecord, remote, prior?.baseRecord ? parseConflictRecord(prior.baseRecord) : undefined, detectedAt)
          if (safe) {
            const list = remoteWrites.get(remote.entityType) ?? []
            list.push(safe.entity)
            remoteWrites.set(remote.entityType, list)
            states[key] = safe.remoteState
            delete unresolved[key]
            blockedKeys.delete(key)
          } else {
            unresolved[key] = createSyncConflict(localRecord, remote, detectedAt, prior?.baseRecord ? parseConflictRecord(prior.baseRecord) : undefined)
            blockedKeys.add(key)
          }
        }
      }

      metadata = { ...metadata, remoteCheckpoint: pull.checkpoint, recordStates: states, unresolvedConflicts: unresolved }
      const writes: RepositoryWrite[] = []
      for (const [collection, entities] of remoteWrites) writes.push({ collection, entities } as RepositoryWrite)
      writes.push({ collection: 'syncMetadata', entities: [metadata] })
      await this.repository.saveTransaction(writes)
      await deduplicateObservationSelections(this.repository)
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
      const postPushWrites = new Map<SyncedCollection, unknown[]>()
      for (let offset = 0; offset < pendingRecords.length; offset += this.batchSize) {
        const result = await this.provider.pushBatch(pendingRecords.slice(offset, offset + this.batchSize))
        checkpoint = Math.max(checkpoint, result.checkpoint)
        pushed += result.accepted.length
        for (const accepted of result.accepted) {
          const key = recordKey(accepted.entityType, accepted.id)
          states[key] = stateForRemote(accepted)
          delete unresolved[key]
          blockedKeys.delete(key)
        }
        for (const conflict of result.conflicts) {
          const key = recordKey(conflict.local.entityType, conflict.local.id)
          const prior = states[key]
          const safe = trySafeConflictResolution(conflict.local, conflict.remote, prior?.baseRecord ? parseConflictRecord(prior.baseRecord) : undefined, detectedAt)
          if (safe) {
            const list = postPushWrites.get(conflict.local.entityType) ?? []
            list.push(safe.entity)
            postPushWrites.set(conflict.local.entityType, list)
            states[key] = safe.remoteState
            delete unresolved[key]
            blockedKeys.delete(key)
          } else {
            unresolved[key] = createSyncConflict(conflict.local, conflict.remote, detectedAt, prior?.baseRecord ? parseConflictRecord(prior.baseRecord) : undefined)
            blockedKeys.add(key)
          }
        }
      }

      const conflictCount = Object.keys(unresolved).length
      const pending = pendingRecords.length - pushed + [...postPushWrites.values()].reduce((sum, values) => sum + values.length, 0)
      metadata = {
        ...metadata,
        lastSuccessfulSyncAt: this.now().toISOString(),
        pendingChangeCount: pending,
        lastError: conflictCount ? `${conflictCount} record conflict${conflictCount === 1 ? '' : 's'} need attention.` : null,
        remoteCheckpoint: checkpoint,
        recordStates: states,
        unresolvedConflicts: unresolved,
      }
      const finalWrites: RepositoryWrite[] = [...postPushWrites].map(([collection, entities]) => ({ collection, entities }) as RepositoryWrite)
      finalWrites.push({ collection: 'syncMetadata', entities: [metadata] })
      await this.repository.saveTransaction(finalWrites)
      return {
        pulled: [...remoteWrites.values()].reduce((sum, values) => sum + values.length, 0),
        pushed,
        pending,
        conflicts: Object.values(unresolved).map(({ local, remote }) => ({ local: parseConflictRecord(local), remote: parseConflictRecord(remote) })),
        checkpoint,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed.'
      await this.repository.save('syncMetadata', { ...metadata, pendingChangeCount: await this.countPending(), lastError: message })
      throw error
    }
  }
}
