import type { CSSProperties } from 'react'

export interface ColorTokens {
  background: string
  backgroundAccent: string
  surface: string
  surfaceElevated: string
  primary: string
  primaryStrong: string
  onPrimary: string
  secondary: string
  accent: string
  text: string
  mutedText: string
  border: string
  focus: string
  success: string
  warning: string
  danger: string
  chartSeries: readonly [string, string, string, string, string, string, string, string]
  artworkWarm: string
  artworkWarmStrong: string
  artworkCool: string
  artworkCoolStrong: string
}

export type AppearanceMode = 'light' | 'dark' | 'system'
export type ResolvedAppearance = Exclude<AppearanceMode, 'system'>

export interface ThemeVariant {
  colors: ColorTokens
  artworkFilter: string
  shadows: {
    card: string
    navigation: string
    soft: string
  }
}

export interface PaletteDefinition {
  id: string
  name: string
  variants: Record<ResolvedAppearance, ThemeVariant>
  spacing: {
    xs: string
    sm: string
    md: string
    lg: string
    xl: string
    xxl: string
  }
  radii: {
    sm: string
    md: string
    lg: string
    pill: string
  }
  motion: {
    fast: string
    standard: string
  }
}

export interface ResolvedTheme extends Omit<PaletteDefinition, 'variants'>, ThemeVariant {
  appearance: ResolvedAppearance
  colorScheme: ResolvedAppearance
}

export type ThemeStyle = CSSProperties & Record<`--${string}`, string>
