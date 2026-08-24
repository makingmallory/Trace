import type { ReactNode } from 'react'
import { MainPageHeader } from './MainPageHeader.tsx'

interface ScreenPlaceholderProps {
  eyebrow: string
  title: string
  description: string
  children?: ReactNode
  mainPage?: boolean
}

export function ScreenPlaceholder({
  eyebrow,
  title,
  description,
  children,
  mainPage = false,
}: ScreenPlaceholderProps) {
  return (
    <section className={`screen${mainPage ? ' main-page-screen' : ''}`} aria-labelledby="screen-title">
      {mainPage ? <MainPageHeader eyebrow={eyebrow} title={title} subtitle={description} titleId="screen-title" /> : <div className="screen__heading">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="screen-title">{title}</h1>
        <p className="screen__description">{description}</p>
      </div>}
      {children ?? (
        <div className="placeholder-card">
          <span className="placeholder-card__sparkle" aria-hidden="true">✦</span>
          <p>This space is ready for a future milestone.</p>
        </div>
      )}
    </section>
  )
}
