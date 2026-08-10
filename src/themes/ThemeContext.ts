import { createContext, useContext } from 'react'
import { fantasyTheme } from './fantasyTheme.ts'
import type { ThemeDefinition } from './types.ts'

export const ThemeContext = createContext<ThemeDefinition>(fantasyTheme)

export function useTheme() {
  return useContext(ThemeContext)
}
