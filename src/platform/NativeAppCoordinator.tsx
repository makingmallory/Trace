import { useEffect, useRef } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { LocalNotifications } from '@capacitor/local-notifications'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { useLocation, useNavigate } from 'react-router-dom'
import { isNativeAndroid, parseTraceDeepLink } from './nativeRuntime.ts'
import { publishWidgetSnapshot } from './widgetSnapshot.ts'
import { createDailyReminderCoordinator } from '../features/reminders/reminderRuntime.ts'

export function NativeAppCoordinator() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = useRef(location.pathname)

  useEffect(() => { pathname.current = location.pathname }, [location.pathname])

  useEffect(() => {
    if (!isNativeAndroid()) return
    let active = true
    let widgetTimer: number | undefined
    let reminderTimer: number | undefined
    const handles: Array<{ remove(): Promise<void> }> = []
    const openUrl = (url: string) => {
      const route = parseTraceDeepLink(url)
      if (route) navigate(route)
    }
    const refreshWidget = () => {
      window.clearTimeout(widgetTimer)
      widgetTimer = window.setTimeout(() => { void publishWidgetSnapshot().catch(() => undefined) }, 250)
    }
    const refreshReminder = () => {
      window.clearTimeout(reminderTimer)
      reminderTimer = window.setTimeout(() => {
        void createDailyReminderCoordinator().reconcile().then((result) => {
          window.dispatchEvent(new CustomEvent('trace:reminder-state-changed', { detail: result }))
        }).catch(() => undefined)
      }, 250)
    }
    const refreshNativeState = () => { refreshWidget(); refreshReminder() }
    const onExternalClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a')
      if (!anchor) return
      const url = new URL(anchor.href, window.location.href)
      if (!['http:', 'https:'].includes(url.protocol) || (url.origin === window.location.origin && anchor.target !== '_blank')) return
      event.preventDefault()
      void Browser.open({ url: url.href })
    }

    void Promise.all([
      CapacitorApp.addListener('appUrlOpen', ({ url }) => openUrl(url)),
      CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')
        if (dialog) { dialog.close(); return }
        if (pathname.current !== '/' && canGoBack) navigate(-1)
        else if (pathname.current !== '/') navigate('/')
        else void CapacitorApp.exitApp()
      }),
      CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) refreshNativeState() }),
      LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
        const path = notification.extra?.path
        if (typeof path === 'string' && path.startsWith('/')) navigate(path)
      }),
    ]).then((listeners) => { if (active) handles.push(...listeners); else listeners.forEach((handle) => void handle.remove()) })
    void CapacitorApp.getLaunchUrl().then((result) => { if (result?.url) openUrl(result.url) })
    void StatusBar.setOverlaysWebView({ overlay: false })
    void StatusBar.setStyle({ style: Style.Light })
    void StatusBar.setBackgroundColor({ color: '#fffcfe' })
    void SplashScreen.hide()
    window.addEventListener('trace:data-changed', refreshNativeState)
    document.addEventListener('click', onExternalClick, true)
    refreshNativeState()
    return () => {
      active = false
      window.clearTimeout(widgetTimer)
      window.clearTimeout(reminderTimer)
      handles.forEach((handle) => void handle.remove())
      window.removeEventListener('trace:data-changed', refreshNativeState)
      document.removeEventListener('click', onExternalClick, true)
    }
  }, [navigate])

  return null
}
