import { GoogleSheetsAppsScriptSyncProvider } from './google/GoogleSheetsAppsScriptSyncProvider.ts'
import { SyncSpikeService } from './SyncSpikeService.ts'

export function createSyncSpikeService(endpointUrl: string) {
  return new SyncSpikeService(
    new GoogleSheetsAppsScriptSyncProvider({ endpointUrl }),
  )
}
