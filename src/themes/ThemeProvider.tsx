import { useEffect, useState, type ReactNode } from 'react'
import { ThemeContext } from './ThemeContext.ts'
import { resolvePalette, resolveTheme } from './palettes.ts'
import { applyThemeToDocument, browserSystemAppearance, browserThemeStorage, loadAppearanceMode, loadThemePreference, resolveAppearanceMode, saveAppearanceMode, saveThemePreference, systemPrefersDark, themeStyle, watchSystemAppearance } from './themePreference.ts'
import type { AppearanceMode, ResolvedTheme } from './types.ts'
import { browserMotionPreference, watchMotionPreference } from './motionPreference.ts'

interface ThemeProviderProps {
  children: ReactNode
  initialTheme?: ResolvedTheme
  initialAppearanceMode?: AppearanceMode
}

export function ThemeProvider({ children, initialTheme, initialAppearanceMode }: ThemeProviderProps) {
  const storage = browserThemeStorage()
  const storedPalette = initialTheme ? resolvePalette(initialTheme.id) : loadThemePreference(storage)
  const [paletteId, setPaletteId] = useState(storedPalette.id)
  const [appearanceMode, setStoredAppearanceMode] = useState<AppearanceMode>(() => initialAppearanceMode ?? loadAppearanceMode(storage, storedPalette.id))
  const [systemDark, setSystemDark] = useState(() => initialAppearanceMode === 'system' && initialTheme ? initialTheme.appearance === 'dark' : systemPrefersDark())
  const resolvedAppearance = resolveAppearanceMode(appearanceMode, systemDark)
  const theme = resolveTheme(paletteId, resolvedAppearance)

  useEffect(() => watchSystemAppearance(browserSystemAppearance(), setSystemDark), [])
  useEffect(() => typeof document === 'undefined' ? undefined : watchMotionPreference(browserMotionPreference(), document), [])

  useEffect(() => {
    if (typeof document !== 'undefined') applyThemeToDocument(theme, document, appearanceMode)
  }, [theme, appearanceMode])

  function setTheme(themeId: string) {
    const palette = resolvePalette(themeId)
    saveThemePreference(palette, storage)
    setPaletteId(palette.id)
  }

  function setAppearanceMode(mode: AppearanceMode) {
    saveAppearanceMode(mode, storage)
    setStoredAppearanceMode(mode)
  }

  return (
    <ThemeContext value={{ theme, appearanceMode, resolvedAppearance, setTheme, setAppearanceMode }}>
      <div className="theme-root" data-theme={theme.id} data-appearance={resolvedAppearance} style={themeStyle(theme)}>
        {children}
      </div>
    </ThemeContext>
  )
}
