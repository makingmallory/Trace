import { Outlet } from 'react-router-dom'
import { BottomNavigation } from '../components/BottomNavigation.tsx'

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#/" aria-label="Trace home">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <span>Trace</span>
        </a>
        <span className="milestone-badge">Nightly Check-In</span>
      </header>

      <main className="app-content" id="main-content">
        <Outlet />
      </main>

      <BottomNavigation />
    </div>
  )
}
