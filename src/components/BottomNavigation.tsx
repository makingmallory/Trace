import { NavLink } from 'react-router-dom'

const navigationItems = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/trends', label: 'Trends', icon: 'trends', end: false },
  { to: '/history', label: 'History', icon: 'history', end: false },
  { to: '/trackables', label: 'Trackables', icon: 'trackables', end: false },
  { to: '/settings', label: 'Settings', icon: 'settings', end: false },
] as const

function NavigationIcon({ name }: { name: typeof navigationItems[number]['icon'] }) {
  const paths = {
    home: <><path d="m4 10 8-7 8 7v10H4Z" /><path d="M9 20v-6h6v6" /></>,
    trends: <><path d="M4 18 10 12l4 3 6-8" /><path d="M15 7h5v5" /></>,
    history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6h5" /></>,
    trackables: <path d="M12 2c.5 5.8 4.2 9.5 10 10-5.8.5-9.5 4.2-10 10-.5-5.8-4.2-9.5-10-10 5.8-.5 9.5-4.2 10-10Z" />,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

export function BottomNavigation() {
  return (
    <nav className="bottom-navigation" aria-label="Primary navigation">
      <div className="bottom-navigation__items">
        {navigationItems.map((item) => (
          <NavLink
            key={item.to}
            className={({ isActive }) =>
              `bottom-navigation__link${isActive ? ' is-active' : ''}`
            }
            to={item.to}
            end={item.end}
          >
            <span className="bottom-navigation__icon" aria-hidden="true">
              <NavigationIcon name={item.icon} />
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
