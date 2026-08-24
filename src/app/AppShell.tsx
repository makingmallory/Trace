import { Outlet, useLocation } from 'react-router-dom'
import { BottomNavigation } from '../components/BottomNavigation.tsx'
import { SyncCoordinator } from '../features/settings/SyncCoordinator.tsx'
import { SyncStatusBadge } from '../features/settings/SyncStatusBadge.tsx'
import { NativeAppCoordinator } from '../platform/NativeAppCoordinator.tsx'

export function AppShell() {
  const { pathname } = useLocation()
  const isTrackablesCollection = pathname === '/trackables' || pathname === '/trackables/add'
  const isCheckIn = pathname === '/check-in' || /^\/history\/check-in\/\d{4}-\d{2}-\d{2}$/.test(pathname)
  const isHistory = pathname === '/history'
  const isMainPage = ['/', '/history', '/trends', '/trackables', '/settings'].includes(pathname)
  const hasDecorativeHeader = pathname === '/' || isHistory
  return (
    <div className={`app-shell${isTrackablesCollection ? ' app-shell--trackables-collection' : ''}${isCheckIn ? ' app-shell--checkin' : ''}${isHistory ? ' app-shell--history' : ''}${isMainPage ? ' app-shell--main-page' : ''}${hasDecorativeHeader ? ' app-shell--decorative-header' : ''}`}>
      <SyncCoordinator />
      <NativeAppCoordinator />
      <header className="app-header">
        <a className="brand" href="#/" aria-label="Trace home">
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}icons/trace-logo.png`} alt="Trace" />
        </a>
        <SyncStatusBadge />
      </header>

      <main className="app-content" id="main-content">
        <Outlet />
      </main>

      <BottomNavigation />
    </div>
  )
}
