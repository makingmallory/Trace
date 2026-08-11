import { IndexedDbDataRepository } from '../local/IndexedDbDataRepository.ts'
import { GoogleSheetsAppsScriptSyncProvider } from './google/GoogleSheetsAppsScriptSyncProvider.ts'
import { BrowserSyncConnectionStorage, type SyncConnection } from './SyncConnectionStore.ts'
import { SyncService } from './SyncService.ts'

export const syncConnectionStorage = new BrowserSyncConnectionStorage()

export function serviceForConnection(connection: SyncConnection): SyncService {
  return new SyncService(
    new IndexedDbDataRepository(),
    new GoogleSheetsAppsScriptSyncProvider({ endpointUrl: connection.endpointUrl }),
  )
}

export async function runConnectedSync(): Promise<void> {
  const connection = syncConnectionStorage.load()
  if (!connection || (typeof navigator !== 'undefined' && !navigator.onLine)) return
  await serviceForConnection(connection).sync()
}
