import { Outlet } from 'react-router-dom'
import { BottomNavigation } from '../components/BottomNavigation.tsx'
import { SyncCoordinator } from '../features/settings/SyncCoordinator.tsx'
import { NativeAppCoordinator } from '../platform/NativeAppCoordinator.tsx'

export function AppShell() {
  return (
    <div className="app-shell">
      <SyncCoordinator />
      <NativeAppCoordinator />
      <header className="app-header">
        <a className="brand" href="#/" aria-label="Trace home">
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}icons/trace-icon-192.png`} alt="" />
          <span>Trace</span>
        </a>
        <span className="milestone-badge">Local-first</span>
      </header>

      <main className="app-content" id="main-content">
        <Outlet />
      </main>

      <BottomNavigation />
    </div>
  )
}
