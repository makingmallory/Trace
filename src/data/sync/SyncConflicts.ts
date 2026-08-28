import type { JsonValue, SyncConflictKind, SyncConflictSnapshot, SyncMetadata } from '../../domain/models/index.ts'
import type { RepositoryCollectionMap } from '../repository/DataRepository.ts'
import { deserializeEntity, fingerprint, parseSyncRecord, recordKey, stableStringify, type SyncRecord, type SyncedCollection } from './SyncProtocol.ts'

export type SyncConflictResolution = 'keep-local' | 'keep-synced'

export interface SafeConflictResolution {
  entity: RepositoryCollectionMap[SyncedCollection]
  remoteState: SyncMetadata['recordStates'][string]
  reason: 'identical' | 'metadata-only' | 'non-overlapping-merge'
}

function sameJson(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return stableStringify(left) === stableStringify(right)
}

function changedPayloadFields(base: SyncRecord, candidate: SyncRecord): Set<string> {
  const fields = new Set([...Object.keys(base.payload), ...Object.keys(candidate.payload)])
  return new Set([...fields].filter((field) => !sameJson(base.payload[field], candidate.payload[field])))
}

function remoteState(remote: SyncRecord): SyncMetadata['recordStates'][string] {
  return {
    remoteRevision: remote.remoteRevision ?? remote.baseRemoteRevision,
    entityRevision: remote.revision,
    fingerprint: fingerprint(remote),
    baseRecord: structuredClone(remote),
  }
}

export function classifySyncConflict(local: SyncRecord, remote: SyncRecord): SyncConflictKind {
  if (local.entityType !== remote.entityType || local.id !== remote.id || local.createdAt !== remote.createdAt) return 'identity-collision'
  if (Boolean(local.deletedAt) !== Boolean(remote.deletedAt)) return 'delete-vs-edit'
  return 'differing-values'
}

export function createSyncConflict(local: SyncRecord, remote: SyncRecord, detectedAt: string, base?: SyncRecord): SyncConflictSnapshot {
  return {
    id: recordKey(local.entityType, local.id),
    kind: classifySyncConflict(local, remote),
    detectedAt,
    local: structuredClone(local),
    remote: structuredClone(remote),
    ...(base ? { base: structuredClone(base) } : {}),
  }
}

/** Reads old metadata safely; malformed entries remain ignored rather than damaging user data. */
export function normalizeSyncConflicts(metadata: SyncMetadata): Record<string, SyncConflictSnapshot> {
  const normalized: Record<string, SyncConflictSnapshot> = {}
  for (const [key, value] of Object.entries(metadata.unresolvedConflicts ?? {})) {
    try {
      const local = parseSyncRecord(value.local)
      const remote = parseSyncRecord(value.remote)
      if (recordKey(local.entityType, local.id) !== key || remote.entityType !== local.entityType || remote.id !== local.id) continue
      const base = value.base ? parseSyncRecord(value.base) : undefined
      normalized[key] = createSyncConflict(local, remote, value.detectedAt, base)
    } catch {
      // An unreadable snapshot must never be applied or auto-resolved.
    }
  }
  return normalized
}

export function trySafeConflictResolution(local: SyncRecord, remote: SyncRecord, base: SyncRecord | undefined, now: string): SafeConflictResolution | null {
  const state = remoteState(remote)
  if (fingerprint(local) === fingerprint(remote)) return { entity: deserializeEntity(remote), remoteState: state, reason: 'identical' }
  if (local.entityType !== remote.entityType || local.id !== remote.id || local.createdAt !== remote.createdAt) return null
  if (Boolean(local.deletedAt) !== Boolean(remote.deletedAt)) return null

  const samePayload = sameJson(local.payload, remote.payload)
  if (samePayload) return { entity: deserializeEntity(remote), remoteState: state, reason: 'metadata-only' }
  if (local.deletedAt !== remote.deletedAt) return null
  if (!base || base.entityType !== local.entityType || base.id !== local.id || base.deletedAt !== local.deletedAt) return null

  const localChanges = changedPayloadFields(base, local)
  const remoteChanges = changedPayloadFields(base, remote)
  if ([...localChanges].some((field) => remoteChanges.has(field))) return null

  const mergedPayload = structuredClone(base.payload) as Record<string, JsonValue>
  for (const field of remoteChanges) {
    if (field in remote.payload) mergedPayload[field] = structuredClone(remote.payload[field]!)
    else delete mergedPayload[field]
  }
  for (const field of localChanges) {
    if (field in local.payload) mergedPayload[field] = structuredClone(local.payload[field]!)
    else delete mergedPayload[field]
  }
  const merged: SyncRecord = {
    ...structuredClone(local),
    revision: Math.max(local.revision, remote.revision) + 1,
    updatedAt: now,
    baseRemoteRevision: state.remoteRevision,
    payload: mergedPayload,
  }
  return { entity: deserializeEntity(merged), remoteState: state, reason: 'non-overlapping-merge' }
}

export function stateForRemote(remote: SyncRecord): SyncMetadata['recordStates'][string] {
  return remoteState(remote)
}
