import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function EditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>
}

export function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7" /><path d="M10 11v5m4-5v5" /></svg>
}

export function RecordAction({ label, title, danger = false, children, to, onClick }: { label: string; title: string; danger?: boolean; children: ReactNode; to?: string; onClick?: () => void }) {
  const className = `record-icon-action${danger ? ' record-icon-action--danger' : ''}`
  return to ? <Link className={className} to={to} aria-label={label} title={title}>{children}</Link> : <button type="button" className={className} onClick={onClick} aria-label={label} title={title}>{children}</button>
}
