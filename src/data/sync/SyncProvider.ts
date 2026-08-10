export interface SyncProviderHealth {
  available: boolean
  message?: string
}

export interface SyncProvider {
  readonly providerId: string
  healthCheck(): Promise<SyncProviderHealth>
}
