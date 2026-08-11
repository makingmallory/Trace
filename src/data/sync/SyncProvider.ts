import type { SyncRecord } from './SyncProtocol.ts'

export interface SyncProviderHealth {
  available: boolean
  message?: string
  sheetName?: string
  sheetId?: string
  schemaVersion?: number
  checkpoint?: number
}

export interface PullResult {
  checkpoint: number
  records: readonly SyncRecord[]
}

export interface PushConflict {
  local: SyncRecord
  remote: SyncRecord
}

export interface PushResult {
  checkpoint: number
  accepted: readonly SyncRecord[]
  conflicts: readonly PushConflict[]
}

/** A deliberately tiny, non-domain payload used only by the sync spike. */
export interface SyncSpikeRecord {
  id: string
  value: string
  createdAt: string
}

export interface SyncProvider {
  readonly providerId: string
  healthCheck(): Promise<SyncProviderHealth>
  pullChanges(checkpoint: number): Promise<PullResult>
  pushBatch(records: readonly SyncRecord[]): Promise<PushResult>
}

/** Temporary capability surface used only by Milestone 0.5. */
export interface SyncSpikeProvider {
  readonly providerId: string
  healthCheck(): Promise<SyncProviderHealth>
  pushTestRecord(record: SyncSpikeRecord): Promise<void>
  readTestRecord(id: string): Promise<SyncSpikeRecord | null>
}
