import { useEffect } from 'react'
import { runConnectedSync, syncConnectionStorage } from '../../data/sync/syncRuntime.ts'

let activeSync: Promise<void> | null = null
function requestSync(): void {
  if (activeSync) return
  activeSync = runConnectedSync().catch(() => undefined).finally(() => { activeSync = null })
}

export function SyncCoordinator() {
  useEffect(() => {
    if (!syncConnectionStorage.load()) return
    let timer: number | undefined
    const debounce = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(requestSync, 5000)
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') requestSync() }
    window.addEventListener('trace:data-changed', debounce)
    window.addEventListener('online', requestSync)
    document.addEventListener('visibilitychange', onVisibility)
    requestSync()
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('trace:data-changed', debounce)
      window.removeEventListener('online', requestSync)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  return null
}
