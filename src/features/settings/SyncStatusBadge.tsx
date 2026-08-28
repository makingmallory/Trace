import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SYNC_SETTINGS_PATH, SYNC_STATUS_CHANGED_EVENT, deriveSyncBadgePresentation, type SyncBadgeSnapshot } from '../../data/sync/SyncStatus.ts'
import { serviceForConnection, syncConnectionStorage } from '../../data/sync/syncRuntime.ts'
import { normalizeSyncConflicts } from '../../data/sync/SyncConflicts.ts'

const initialSnapshot = (): SyncBadgeSnapshot => ({
  configured: Boolean(syncConnectionStorage.load()),
  syncing: false,
  online: typeof navigator === 'undefined' || navigator.onLine,
  pendingChangeCount: 0,
  unresolvedConflictCount: 0,
  lastSuccessfulSyncAt: null,
  lastError: null,
})

export function SyncStatusBadge() {
  const [snapshot, setSnapshot] = useState<SyncBadgeSnapshot>(initialSnapshot)
  const refresh = useCallback(async () => {
    const connection = syncConnectionStorage.load()
    if (!connection) {
      setSnapshot((current) => ({ ...current, configured: false, online: typeof navigator === 'undefined' || navigator.onLine, pendingChangeCount: 0, unresolvedConflictCount: 0, lastSuccessfulSyncAt: null, lastError: null }))
      return
    }
    const service = serviceForConnection(connection)
    const [metadata, pendingChangeCount] = await Promise.all([service.metadata(), service.countPending()])
    setSnapshot((current) => ({ ...current, configured: true, online: typeof navigator === 'undefined' || navigator.onLine, pendingChangeCount, unresolvedConflictCount: Object.keys(normalizeSyncConflicts(metadata)).length, lastSuccessfulSyncAt: metadata.lastSuccessfulSyncAt, lastError: metadata.lastError }))
  }, [])

  useEffect(() => {
    let mounted = true
    const safelyRefresh = () => { void refresh().catch(() => { if (mounted) setSnapshot((current) => ({ ...current, configured: Boolean(syncConnectionStorage.load()) })) }) }
    const onSyncStatus = (event: Event) => {
      const syncing = (event as CustomEvent<{ syncing?: boolean }>).detail?.syncing
      if (typeof syncing === 'boolean') setSnapshot((current) => ({ ...current, syncing }))
      safelyRefresh()
    }
    const onOnlineChange = () => safelyRefresh()
    safelyRefresh()
    window.addEventListener(SYNC_STATUS_CHANGED_EVENT, onSyncStatus)
    window.addEventListener('trace:data-changed', safelyRefresh)
    window.addEventListener('online', onOnlineChange)
    window.addEventListener('offline', onOnlineChange)
    return () => {
      mounted = false
      window.removeEventListener(SYNC_STATUS_CHANGED_EVENT, onSyncStatus)
      window.removeEventListener('trace:data-changed', safelyRefresh)
      window.removeEventListener('online', onOnlineChange)
      window.removeEventListener('offline', onOnlineChange)
    }
  }, [refresh])

  const presentation = deriveSyncBadgePresentation(snapshot)
  return <Link className="sync-status-badge" data-status={presentation.status} to={SYNC_SETTINGS_PATH} aria-label={`Sync status: ${presentation.label}. Open sync settings.`} title="Open sync settings">{presentation.label}</Link>
}
