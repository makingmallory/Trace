import type { ThemeDefinition } from './types.ts'

export const fantasyTheme: ThemeDefinition = {
  id: 'fantasy-dawn',
  name: 'Fantasy Dawn',
  colors: {
    background: '#fffcfe',
    backgroundAccent: '#fdf0f8',
    surface: '#ffffff',
    surfaceElevated: '#fff7fc',
    primary: '#c026d3',
    primaryStrong: '#7e22ce',
    onPrimary: '#ffffff',
    secondary: '#db2777',
    accent: '#f59e0b',
    text: '#25172b',
    mutedText: '#6f6274',
    border: '#ecd9e9',
    focus: '#86198f',
    success: '#16805d',
    warning: '#a55b08',
    danger: '#be244f',
    chartSeries: ['#c026d3', '#db2777', '#7c3aed', '#f59e0b', '#0891b2'],
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem',
  },
  radii: {
    sm: '0.75rem',
    md: '1.125rem',
    lg: '1.75rem',
    pill: '999px',
  },
  shadows: {
    card: '0 0.75rem 2rem rgb(126 34 206 / 12%)',
    navigation: '0 -0.5rem 2rem rgb(126 34 206 / 14%)',
  },
  motion: {
    fast: '140ms',
    standard: '220ms',
  },
}
