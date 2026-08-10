import { NavLink } from 'react-router-dom'

const navigationItems = [
  { to: '/', label: 'Home', icon: '⌂', end: true },
  { to: '/trends', label: 'Trends', icon: '↗', end: false },
  { to: '/history', label: 'History', icon: '◷', end: false },
  { to: '/trackables', label: 'Trackables', icon: '✦', end: false },
  { to: '/settings', label: 'Settings', icon: '⚙', end: false },
] as const

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
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
