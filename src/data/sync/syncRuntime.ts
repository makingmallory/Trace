import { IndexedDbDataRepository } from '../local/IndexedDbDataRepository.ts'
import { GoogleSheetsAppsScriptSyncProvider } from './google/GoogleSheetsAppsScriptSyncProvider.ts'
import { BrowserSyncConnectionStorage, type SyncConnection } from './SyncConnectionStore.ts'
import { SyncService, type SyncRunResult } from './SyncService.ts'
import { SyncRunCoordinator } from './SyncRunCoordinator.ts'
import { publishSyncStatusChange } from './SyncStatus.ts'

export const syncConnectionStorage = new BrowserSyncConnectionStorage()
let connectedCoordinator: SyncRunCoordinator | null = null

export function serviceForConnection(connection: SyncConnection): SyncService {
  return new SyncService(
    new IndexedDbDataRepository(),
    new GoogleSheetsAppsScriptSyncProvider({ endpointUrl: connection.endpointUrl }),
  )
}

function coordinatorForConnection(): SyncRunCoordinator {
  if (!connectedCoordinator) {
    connectedCoordinator = new SyncRunCoordinator({
      sync: () => {
        const connection = syncConnectionStorage.load()
        if (!connection) throw new Error('Google Sheets backup is not connected.')
        return serviceForConnection(connection).sync()
      },
      countPending: async () => {
        const connection = syncConnectionStorage.load()
        return connection ? serviceForConnection(connection).countPending() : 0
      },
      setSyncing: (syncing) => publishSyncStatusChange({ syncing }),
    })
  }
  return connectedCoordinator
}

export async function requestConnectedSync(): Promise<SyncRunResult | null> {
  const connection = syncConnectionStorage.load()
  if (!connection || (typeof navigator !== 'undefined' && !navigator.onLine)) return null
  return coordinatorForConnection().request()
}
