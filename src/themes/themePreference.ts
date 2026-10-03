import { defaultTheme, resolvePalette, resolveTheme } from './palettes.ts'
import type { AppearanceMode, PaletteDefinition, ResolvedAppearance, ResolvedTheme, ThemeStyle } from './types.ts'

export const THEME_PREFERENCE_STORAGE_KEY = 'trace:appearance:theme'
export const APPEARANCE_MODE_STORAGE_KEY = 'trace:appearance:mode'

export interface ThemeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function browserThemeStorage(): ThemeStorage | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage } catch { return null }
}

export function themeStyle(theme: ResolvedTheme): ThemeStyle {
  return {
    '--color-background': theme.colors.background,
    '--color-background-accent': theme.colors.backgroundAccent,
    '--color-surface': theme.colors.surface,
    '--color-surface-elevated': theme.colors.surfaceElevated,
    '--color-primary': theme.colors.primary,
    '--color-primary-strong': theme.colors.primaryStrong,
    '--color-on-primary': theme.colors.onPrimary,
    '--color-secondary': theme.colors.secondary,
    '--color-accent': theme.colors.accent,
    '--color-text': theme.colors.text,
    '--color-muted-text': theme.colors.mutedText,
    '--color-border': theme.colors.border,
    '--color-focus': theme.colors.focus,
    '--color-success': theme.colors.success,
    '--color-warning': theme.colors.warning,
    '--color-danger': theme.colors.danger,
    '--color-chart-1': theme.colors.chartSeries[0],
    '--color-chart-2': theme.colors.chartSeries[1],
    '--color-chart-3': theme.colors.chartSeries[2],
    '--color-chart-4': theme.colors.chartSeries[3],
    '--color-chart-5': theme.colors.chartSeries[4],
    '--color-chart-6': theme.colors.chartSeries[5],
    '--color-chart-7': theme.colors.chartSeries[6],
    '--color-chart-8': theme.colors.chartSeries[7],
    '--color-artwork-warm': theme.colors.artworkWarm,
    '--color-artwork-warm-strong': theme.colors.artworkWarmStrong,
    '--color-artwork-cool': theme.colors.artworkCool,
    '--color-artwork-cool-strong': theme.colors.artworkCoolStrong,
    '--artwork-filter': theme.artworkFilter,
    '--space-xs': theme.spacing.xs,
    '--space-sm': theme.spacing.sm,
    '--space-md': theme.spacing.md,
    '--space-lg': theme.spacing.lg,
    '--space-xl': theme.spacing.xl,
    '--space-xxl': theme.spacing.xxl,
    '--radius-sm': theme.radii.sm,
    '--radius-md': theme.radii.md,
    '--radius-lg': theme.radii.lg,
    '--radius-pill': theme.radii.pill,
    '--shadow-card': theme.shadows.card,
    '--shadow-navigation': theme.shadows.navigation,
    '--shadow-soft-color': theme.shadows.soft,
    '--motion-fast': theme.motion.fast,
    '--motion-standard': theme.motion.standard,
  }
}

export function loadThemePreference(storage?: ThemeStorage | null): PaletteDefinition {
  if (!storage) return defaultTheme
  try { return resolvePalette(storage.getItem(THEME_PREFERENCE_STORAGE_KEY)) }
  catch { return defaultTheme }
}

export function saveThemePreference(theme: PaletteDefinition, storage?: ThemeStorage | null): void {
  if (!storage) return
  try { storage.setItem(THEME_PREFERENCE_STORAGE_KEY, theme.id) } catch { /* Keep theme switching usable if storage is unavailable. */ }
}

function compatibilityAppearance(paletteId: string): ResolvedAppearance {
  return paletteId === 'midnight' ? 'dark' : 'light'
}

export function loadAppearanceMode(storage: ThemeStorage | null | undefined, paletteId: string): AppearanceMode {
  if (!storage) return compatibilityAppearance(paletteId)
  try {
    const value = storage.getItem(APPEARANCE_MODE_STORAGE_KEY)
    return value === 'light' || value === 'dark' || value === 'system' ? value : compatibilityAppearance(paletteId)
  } catch { return compatibilityAppearance(paletteId) }
}

export function saveAppearanceMode(mode: AppearanceMode, storage?: ThemeStorage | null): void {
  if (!storage) return
  try { storage.setItem(APPEARANCE_MODE_STORAGE_KEY, mode) } catch { /* Appearance remains usable when storage is unavailable. */ }
}

export function resolveAppearanceMode(mode: AppearanceMode, systemDark: boolean): ResolvedAppearance {
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
}

export interface SystemAppearanceSource {
  matches: boolean
  addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void
  removeEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void
}

export function browserSystemAppearance(): SystemAppearanceSource | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia('(prefers-color-scheme: dark)')
}

export function systemPrefersDark(source = browserSystemAppearance()): boolean {
  return source?.matches ?? false
}

export function watchSystemAppearance(source: SystemAppearanceSource | null, onChange: (dark: boolean) => void): () => void {
  if (!source) return () => undefined
  const listener = (event: { matches: boolean }) => onChange(event.matches)
  source.addEventListener('change', listener)
  return () => source.removeEventListener('change', listener)
}

export function applyThemeToDocument(theme: ResolvedTheme, target: Document, mode: AppearanceMode = theme.appearance): void {
  target.documentElement.dataset.theme = theme.id
  target.documentElement.dataset.appearance = theme.appearance
  target.documentElement.dataset.appearanceMode = mode
  target.documentElement.style.colorScheme = theme.colorScheme
  for (const [property, value] of Object.entries(themeStyle(theme))) target.documentElement.style.setProperty(property, value)
  target.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', theme.colors.background)
}

export function activateTheme(id: unknown, appearance: ResolvedAppearance, storage?: ThemeStorage | null, target?: Document, mode: AppearanceMode = appearance): ResolvedTheme {
  const palette = resolvePalette(id)
  const theme = resolveTheme(palette.id, appearance)
  saveThemePreference(palette, storage)
  if (target) applyThemeToDocument(theme, target, mode)
  return theme
}

export function statusBarIntent(theme: ResolvedTheme): { backgroundColor: string; iconStyle: 'light' | 'dark' } {
  return { backgroundColor: theme.colors.background, iconStyle: theme.appearance === 'dark' ? 'light' : 'dark' }
}
