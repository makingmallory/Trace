import { useEffect } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { AutoSyncController } from '../../data/sync/AutoSyncController.ts'
import { AUTO_SYNC_PREFERENCE_CHANGED_EVENT, autoSyncPreferenceStorage } from '../../data/sync/AutoSyncPreference.ts'
import { requestConnectedSync, serviceForConnection, syncConnectionStorage } from '../../data/sync/syncRuntime.ts'
import { isNativeAndroid } from '../../platform/nativeRuntime.ts'

export function SyncCoordinator() {
  useEffect(() => {
    const controller = new AutoSyncController({
      enabled: () => autoSyncPreferenceStorage.load(),
      connected: () => Boolean(syncConnectionStorage.load()),
      requestSync: requestConnectedSync,
      status: async () => {
        const connection = syncConnectionStorage.load()
        if (!connection) return { pendingChangeCount: 0, lastSuccessfulSyncAt: null }
        const service = serviceForConnection(connection)
        const [pendingChangeCount, metadata] = await Promise.all([service.countPending(), service.metadata()])
        return { pendingChangeCount, lastSuccessfulSyncAt: metadata.lastSuccessfulSyncAt }
      },
      now: () => Date.now(),
      setTimeout: (callback, delay) => window.setTimeout(callback, delay),
      clearTimeout: (timer) => window.clearTimeout(timer),
    })
    controller.start()
    const onWrite = () => controller.onLocalWrite()
    const onOnline = () => controller.onOnline()
    const onForeground = () => controller.onForeground()
    const onVisibility = () => { if (document.visibilityState === 'visible') onForeground() }
    const onPreferenceChange = () => controller.start()
    window.addEventListener('trace:data-changed', onWrite)
    window.addEventListener('online', onOnline)
    window.addEventListener(AUTO_SYNC_PREFERENCE_CHANGED_EVENT, onPreferenceChange)
    document.addEventListener('visibilitychange', onVisibility)

    let disposed = false
    let nativeListener: { remove(): Promise<void> } | undefined
    if (isNativeAndroid()) void CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) onForeground() }).then((listener) => {
      if (disposed) void listener.remove()
      else nativeListener = listener
    })

    return () => {
      disposed = true
      controller.dispose()
      window.removeEventListener('trace:data-changed', onWrite)
      window.removeEventListener('online', onOnline)
      window.removeEventListener(AUTO_SYNC_PREFERENCE_CHANGED_EVENT, onPreferenceChange)
      document.removeEventListener('visibilitychange', onVisibility)
      void nativeListener?.remove()
    }
  }, [])
  return null
}
