export interface SyncProviderHealth {
  available: boolean
  message?: string
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
}

/** Temporary capability surface used only by Milestone 0.5. */
export interface SyncSpikeProvider extends SyncProvider {
  pushTestRecord(record: SyncSpikeRecord): Promise<void>
  readTestRecord(id: string): Promise<SyncSpikeRecord | null>
}
