import { Capacitor } from '@capacitor/core'

const stableIdPattern = /^[A-Za-z0-9._:-]+$/

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function safeId(value: string | undefined): string | null {
  if (!value) return null
  const decoded = decodeURIComponent(value)
  return stableIdPattern.test(decoded) ? decoded : null
}

export function parseTraceDeepLink(value: string): string | null {
  let url: URL
  try { url = new URL(value) } catch { return null }
  if (url.protocol !== 'trace:') return null

  const parts = [url.hostname, ...url.pathname.split('/')].filter(Boolean)
  if (parts.length === 0 || parts[0] === 'home') return '/'
  if (parts[0] === 'check-in' && parts.length === 1) return '/check-in'
  if (parts[0] === 'events' && parts.length === 1) return '/events'
  if (parts[0] === 'settings' && parts[1] === 'nightly-check-in' && parts.length === 2) {
    return '/settings/nightly-check-in'
  }
  if (parts[0] === 'events' && parts[1] === 'log' && parts.length === 3) {
    const id = safeId(parts[2])
    return id ? `/events/log/${encodeURIComponent(id)}` : null
  }
  if (parts[0] === 'trackables' && parts.length === 2) {
    const id = safeId(parts[1])
    return id ? `/trackables/edit/${encodeURIComponent(id)}` : null
  }
  return null
}
