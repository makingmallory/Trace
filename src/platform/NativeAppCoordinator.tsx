import { useEffect, useRef } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { useLocation, useNavigate } from 'react-router-dom'
import { isNativeAndroid, parseTraceDeepLink } from './nativeRuntime.ts'
import { publishWidgetSnapshot } from './widgetSnapshot.ts'

export function NativeAppCoordinator() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = useRef(location.pathname)

  useEffect(() => { pathname.current = location.pathname }, [location.pathname])

  useEffect(() => {
    if (!isNativeAndroid()) return
    let active = true
    let widgetTimer: number | undefined
    const handles: Array<{ remove(): Promise<void> }> = []
    const openUrl = (url: string) => {
      const route = parseTraceDeepLink(url)
      if (route) navigate(route)
    }
    const refreshWidget = () => {
      window.clearTimeout(widgetTimer)
      widgetTimer = window.setTimeout(() => { void publishWidgetSnapshot().catch(() => undefined) }, 250)
    }
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
      CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) refreshWidget() }),
    ]).then((listeners) => { if (active) handles.push(...listeners); else listeners.forEach((handle) => void handle.remove()) })
    void CapacitorApp.getLaunchUrl().then((result) => { if (result?.url) openUrl(result.url) })
    void StatusBar.setOverlaysWebView({ overlay: false })
    void StatusBar.setStyle({ style: Style.Light })
    void StatusBar.setBackgroundColor({ color: '#fffcfe' })
    void SplashScreen.hide()
    window.addEventListener('trace:data-changed', refreshWidget)
    document.addEventListener('click', onExternalClick, true)
    refreshWidget()
    return () => {
      active = false
      window.clearTimeout(widgetTimer)
      handles.forEach((handle) => void handle.remove())
      window.removeEventListener('trace:data-changed', refreshWidget)
      document.removeEventListener('click', onExternalClick, true)
    }
  }, [navigate])

  return null
}
