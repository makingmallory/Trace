import type { ReactNode } from 'react'

type SharedPageHeroProps = {
  children: ReactNode
}

export function SharedPageHero({ children }: SharedPageHeroProps) {
  return <div className="shared-page-hero">
    <div className="shared-page-hero__art" aria-hidden="true" />
    <div className="shared-page-hero__content">{children}</div>
  </div>
}
