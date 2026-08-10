import type { ReactNode } from 'react'
import { fantasyTheme } from './fantasyTheme.ts'
import { ThemeContext } from './ThemeContext.ts'
import type { ThemeDefinition, ThemeStyle } from './types.ts'

function toThemeStyle(theme: ThemeDefinition): ThemeStyle {
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
    '--motion-fast': theme.motion.fast,
    '--motion-standard': theme.motion.standard,
  }
}

interface ThemeProviderProps {
  children: ReactNode
  theme?: ThemeDefinition
}

export function ThemeProvider({ children, theme = fantasyTheme }: ThemeProviderProps) {
  return (
    <ThemeContext value={theme}>
      <div className="theme-root" data-theme={theme.id} style={toThemeStyle(theme)}>
        {children}
      </div>
    </ThemeContext>
  )
}
