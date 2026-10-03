import type { CSSProperties } from 'react'
import { themePresets } from '../../themes/palettes.ts'
import type { AppearanceMode, ResolvedAppearance } from '../../themes/types.ts'

interface AppearanceThemeSelectorProps {
  activeThemeId: string
  appearanceMode: AppearanceMode
  resolvedAppearance: ResolvedAppearance
  onSelectTheme(themeId: string): void
  onSelectAppearance(mode: AppearanceMode): void
}

const appearanceOptions: ReadonlyArray<{ id: AppearanceMode; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
]

export function AppearanceThemeSelector({ activeThemeId, appearanceMode, resolvedAppearance, onSelectTheme, onSelectAppearance }: AppearanceThemeSelectorProps) {
  return (
    <section className="appearance-card" aria-labelledby="appearance-heading">
      <div>
        <p className="developer-card__label">Appearance</p>
        <h2 id="appearance-heading">Appearance</h2>
        <p>Choose how Trace looks on this device.</p>
      </div>
      <fieldset className="appearance-mode-field">
        <legend>Mode</legend>
        <div className="appearance-mode-control" role="radiogroup" aria-label="Appearance mode">
          {appearanceOptions.map((option) => <button type="button" role="radio" aria-checked={appearanceMode === option.id} data-selected={appearanceMode === option.id || undefined} onClick={() => onSelectAppearance(option.id)} key={option.id}>{option.label}</button>)}
        </div>
        <p>{appearanceMode === 'system' ? `Following your system (${resolvedAppearance}).` : `${appearanceMode === 'dark' ? 'Dark' : 'Light'} appearance is always active.`}</p>
      </fieldset>
      <div className="appearance-palette-heading"><h3>Color palette</h3><p>Palette and appearance mode are independent.</p></div>
      <div className="theme-preview-grid" role="radiogroup" aria-label="Color palette">
        {themePresets.map((theme) => {
          const selected = theme.id === activeThemeId
          const colors = theme.variants[resolvedAppearance].colors
          const swatches = [colors.backgroundAccent, colors.primary, colors.secondary, colors.accent, colors.text]
          return <button className="theme-preview-card" type="button" role="radio" aria-checked={selected} data-selected={selected || undefined} onClick={() => onSelectTheme(theme.id)} key={theme.id}>
            <span className="theme-preview-card__swatches" aria-hidden="true">
              {swatches.map((color, index) => <i style={{ '--swatch-color': color } as CSSProperties} key={`${theme.id}-${index}`} />)}
            </span>
            <span className="theme-preview-card__name">{theme.name}</span>
            <span className="theme-preview-card__state" aria-hidden="true">{selected ? '✓' : ''}</span>
            {selected ? <span className="sr-only">Selected</span> : null}
          </button>
        })}
      </div>
    </section>
  )
}
