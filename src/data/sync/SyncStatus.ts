export type SyncBadgeStatus = 'synced' | 'syncing' | 'offline' | 'needs-sync' | 'error' | 'sync'

export interface SyncBadgeSnapshot {
  readonly configured: boolean
  readonly syncing: boolean
  readonly online: boolean
  readonly pendingChangeCount: number
  readonly lastSuccessfulSyncAt: string | null
  readonly lastError: string | null
}

export interface SyncBadgePresentation {
  readonly status: SyncBadgeStatus
  readonly label: string
  readonly visualTreatment: 'standard'
}

export const SYNC_STATUS_CHANGED_EVENT = 'trace:sync-status-changed'
export const SYNC_SETTINGS_PATH = '/settings'

function presentation(status: SyncBadgeStatus, label: string): SyncBadgePresentation {
  return { status, label, visualTreatment: 'standard' }
}

function hasUnresolvedRecordConflicts(lastError: string | null): boolean {
  return Boolean(lastError && /\brecord conflicts?\b.*\bneed attention\b/i.test(lastError))
}

export function deriveSyncBadgePresentation(snapshot: SyncBadgeSnapshot): SyncBadgePresentation {
  if (!snapshot.configured) return presentation('sync', 'Sync')
  if (snapshot.syncing) return presentation('syncing', 'Syncing')
  if (snapshot.lastError && !hasUnresolvedRecordConflicts(snapshot.lastError)) return presentation('error', 'Sync Error')
  if (hasUnresolvedRecordConflicts(snapshot.lastError)) return presentation('needs-sync', 'Needs Sync')
  if (!snapshot.online) return presentation('offline', 'Offline')
  if (snapshot.pendingChangeCount > 0) return presentation('needs-sync', 'Needs Sync')
  if (snapshot.lastSuccessfulSyncAt) return presentation('synced', 'Synced')
  return presentation('sync', 'Sync')
}

export function publishSyncStatusChange(detail: { readonly syncing?: boolean } = {}): void {
  globalThis.dispatchEvent(new CustomEvent(SYNC_STATUS_CHANGED_EVENT, { detail }))
}
