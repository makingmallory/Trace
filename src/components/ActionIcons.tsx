import type { ReactNode } from 'react'

type IconName = 'add' | 'archive' | 'edit' | 'hide' | 'moveDown' | 'moveUp' | 'settings' | 'show'

export function ActionIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    add: <path d="M12 5v14M5 12h14" />,
    archive: <><path d="M4 7h16v13H4Z" /><path d="M3 4h18v3H3Zm6 7h6" /></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
    hide: <><path d="M3 3l18 18" /><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9 7 9 7a16 16 0 0 1-2.1 2.9M6.6 6.6C4.3 8 3 12 3 12s3.5 7 9 7a9 9 0 0 0 3.4-.7" /></>,
    moveDown: <><path d="M12 4v16" /><path d="m6 14 6 6 6-6" /></>,
    moveUp: <><path d="M12 20V4" /><path d="m6 10 6-6 6 6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    show: <><path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" /><circle cx="12" cy="12" r="2.5" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}
