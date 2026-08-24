import { Link } from 'react-router-dom'

export function InlineBackHeader({ to, label, ariaLabel = `Back to ${label}`, replace = false }: { to: string; label: string; ariaLabel?: string; replace?: boolean }) {
  return <Link className="inline-back-header" to={to} replace={replace} aria-label={ariaLabel}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg>
    <span>{label}</span>
  </Link>
}
