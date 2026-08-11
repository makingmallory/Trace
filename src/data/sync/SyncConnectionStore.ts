export interface SyncConnection {
  providerId: 'google-sheets-apps-script'
  endpointUrl: string
  sheetName: string
  sheetId?: string
  connectedAt: string
}

export interface SyncConnectionStorage {
  load(): SyncConnection | null
  save(connection: SyncConnection): void
  clear(): void
}

export const TRACE_SYNC_CONNECTION_KEY = 'trace.sync.connection.v1'

export class BrowserSyncConnectionStorage implements SyncConnectionStorage {
  private readonly storage: Storage

  constructor(storage: Storage = localStorage) { this.storage = storage }

  load(): SyncConnection | null {
    const raw = this.storage.getItem(TRACE_SYNC_CONNECTION_KEY)
    if (!raw) return null
    try {
      const value = JSON.parse(raw) as Partial<SyncConnection>
      if (value.providerId !== 'google-sheets-apps-script' || typeof value.endpointUrl !== 'string' || typeof value.sheetName !== 'string' || typeof value.connectedAt !== 'string') return null
      return value as SyncConnection
    } catch {
      return null
    }
  }

  save(connection: SyncConnection): void {
    this.storage.setItem(TRACE_SYNC_CONNECTION_KEY, JSON.stringify(connection))
  }

  clear(): void {
    this.storage.removeItem(TRACE_SYNC_CONNECTION_KEY)
  }
}
