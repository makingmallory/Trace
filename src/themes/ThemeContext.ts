import { createContext, useContext } from 'react'
import { defaultTheme, resolveTheme } from './palettes.ts'
import type { AppearanceMode, ResolvedAppearance, ResolvedTheme } from './types.ts'

export interface ThemeContextValue {
  theme: ResolvedTheme
  appearanceMode: AppearanceMode
  resolvedAppearance: ResolvedAppearance
  setTheme(themeId: string): void
  setAppearanceMode(mode: AppearanceMode): void
}

export const ThemeContext = createContext<ThemeContextValue>({ theme: resolveTheme(defaultTheme.id, 'light'), appearanceMode: 'light', resolvedAppearance: 'light', setTheme: () => undefined, setAppearanceMode: () => undefined })

export function useTheme() {
  return useContext(ThemeContext)
}
