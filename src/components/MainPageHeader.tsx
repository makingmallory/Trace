import type { ReactNode } from 'react'

interface MainPageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  artwork?: boolean
  titleId?: string
}

export function MainPageHeader({ eyebrow, title, subtitle, actions, footer, artwork = false, titleId }: MainPageHeaderProps) {
  return <header className={`main-page-header${artwork ? ' main-page-header--artwork' : ''}`}>
    {artwork ? <div className="main-page-header__art" aria-hidden="true" /> : null}
    <div className="main-page-header__copy">
      <div className="main-page-header__eyebrow-slot">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : <span aria-hidden="true" />}
      </div>
      <div className="main-page-header__title-row">
        <div className="main-page-header__text">
          <h1 id={titleId}>{title}</h1>
          <p className="screen__description">{subtitle}</p>
        </div>
        {actions ? <div className="main-page-header__actions">{actions}</div> : null}
      </div>
      {footer ? <div className="main-page-header__footer">{footer}</div> : null}
    </div>
  </header>
}
