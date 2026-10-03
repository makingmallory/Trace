import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppearanceThemeSelector } from './AppearanceThemeSelector.tsx'

describe('AppearanceThemeSelector', () => {
  it('reflects independent appearance and palette selections', () => {
    const markup = renderToStaticMarkup(createElement(AppearanceThemeSelector, {
      activeThemeId: 'midnight', appearanceMode: 'system', resolvedAppearance: 'dark',
      onSelectTheme: () => undefined, onSelectAppearance: () => undefined,
    }))
    expect(markup).toContain('aria-label="Appearance mode"')
    expect(markup).toMatch(/aria-checked="true"[^>]*>System/)
    expect(markup).toContain('Following your system (dark).')
    expect(markup).toMatch(/aria-checked="true"[^>]*>[\s\S]*?Midnight[\s\S]*?Selected/)
    for (const name of ['Sunset', 'Forest', 'Ocean', 'Midnight', 'Slate', 'Lavender']) expect(markup).toContain(name)
  })
})
