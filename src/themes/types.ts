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
  chartSeries: readonly [string, string, string, string, string]
}

export interface ThemeDefinition {
  id: string
  name: string
  colors: ColorTokens
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
  shadows: {
    card: string
    navigation: string
  }
  motion: {
    fast: string
    standard: string
  }
}

export type ThemeStyle = CSSProperties & Record<`--${string}`, string>
