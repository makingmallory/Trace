import type { ThemeDefinition } from './types.ts'

export const fantasyTheme: ThemeDefinition = {
  id: 'fantasy-dawn',
  name: 'Fantasy Dawn',
  colors: {
    background: '#fbf7fc',
    backgroundAccent: '#f5eafa',
    surface: '#ffffff',
    surfaceElevated: '#fffaff',
    primary: '#8c4fb5',
    primaryStrong: '#643281',
    onPrimary: '#ffffff',
    secondary: '#d879a4',
    accent: '#efb75c',
    text: '#30283a',
    mutedText: '#746a7e',
    border: '#e7d9eb',
    focus: '#5c2d76',
    success: '#337a62',
    warning: '#9b651b',
    danger: '#a83e58',
    chartSeries: ['#8c4fb5', '#d879a4', '#3f8c83', '#efb75c', '#6a78bd'],
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
    sm: '0.625rem',
    md: '1rem',
    lg: '1.5rem',
    pill: '999px',
  },
  shadows: {
    card: '0 1rem 2.5rem rgb(74 45 87 / 10%)',
    navigation: '0 -0.5rem 2rem rgb(74 45 87 / 10%)',
  },
  motion: {
    fast: '140ms',
    standard: '220ms',
  },
}
