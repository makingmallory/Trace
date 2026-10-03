import type { PaletteDefinition, ResolvedAppearance, ResolvedTheme } from './types.ts'

const sharedStructure = {
  spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem', xxl: '3rem' },
  radii: { sm: '0.75rem', md: '1.125rem', lg: '1.75rem', pill: '999px' },
  motion: { fast: '140ms', standard: '220ms' },
} as const

export const sunsetPalette = {
  ...sharedStructure,
  id: 'sunset', name: 'Sunset',
  variants: {
    light: {
      artworkFilter: 'none',
      colors: {
        background: '#fffcfe', backgroundAccent: '#fdf0f8', surface: '#ffffff', surfaceElevated: '#fff7fc',
        primary: '#c026d3', primaryStrong: '#7e22ce', onPrimary: '#ffffff', secondary: '#db2777', accent: '#f59e0b',
        text: '#25172b', mutedText: '#6f6274', border: '#ecd9e9', focus: '#86198f',
        success: '#16805d', warning: '#a55b08', danger: '#be244f',
        chartSeries: ['#c026d3', '#db2777', '#7c3aed', '#f59e0b', '#0891b2'],
        artworkWarm: '#f362a4', artworkWarmStrong: '#c82a91', artworkCool: '#9c75ff', artworkCoolStrong: '#7040e8',
      },
      shadows: { card: '0 0.75rem 2rem rgb(126 34 206 / 12%)', navigation: '0 -0.5rem 2rem rgb(126 34 206 / 14%)', soft: 'rgb(76 31 77 / 8%)' },
    },
    dark: {
      artworkFilter: 'saturate(0.72) brightness(0.58)',
      colors: {
        background: '#1e141c', backgroundAccent: '#321d2b', surface: '#291b26', surfaceElevated: '#35232f',
        primary: '#96369f', primaryStrong: '#f0b7ed', onPrimary: '#ffffff', secondary: '#9d3d68', accent: '#d59b45',
        text: '#fff5fb', mutedText: '#d0b8c7', border: '#594052', focus: '#f1a0e6',
        success: '#69cfa6', warning: '#efbd6d', danger: '#ff91aa',
        chartSeries: ['#de82df', '#e776a5', '#a99af2', '#e7b65c', '#67c2cd'],
        artworkWarm: '#b75a82', artworkWarmStrong: '#7c315a', artworkCool: '#8170c2', artworkCoolStrong: '#594597',
      },
      shadows: { card: '0 0.75rem 2rem rgb(8 3 7 / 34%)', navigation: '0 -0.5rem 2rem rgb(8 3 7 / 40%)', soft: 'rgb(8 3 7 / 25%)' },
    },
  },
} satisfies PaletteDefinition

const forestPalette = {
  ...sharedStructure,
  id: 'forest', name: 'Forest',
  variants: {
    light: {
      artworkFilter: 'hue-rotate(62deg) saturate(0.58) brightness(0.92)',
      colors: {
        background: '#faf9f4', backgroundAccent: '#eef2e8', surface: '#fffefa', surfaceElevated: '#f5f6ef',
        primary: '#607c50', primaryStrong: '#354f2d', onPrimary: '#ffffff', secondary: '#82654b', accent: '#a46d1d',
        text: '#20291f', mutedText: '#596456', border: '#d7ded0', focus: '#2d6445',
        success: '#1b7250', warning: '#895500', danger: '#a63e49',
        chartSeries: ['#607c50', '#82654b', '#78906b', '#a46d1d', '#497c78'],
        artworkWarm: '#be8b54', artworkWarmStrong: '#80623f', artworkCool: '#8ca879', artworkCoolStrong: '#587449',
      },
      shadows: { card: '0 0.75rem 2rem rgb(53 79 45 / 11%)', navigation: '0 -0.5rem 2rem rgb(53 79 45 / 13%)', soft: 'rgb(42 65 39 / 8%)' },
    },
    dark: {
      artworkFilter: 'hue-rotate(62deg) saturate(0.48) brightness(0.5)',
      colors: {
        background: '#151b15', backgroundAccent: '#222d20', surface: '#1d251c', surfaceElevated: '#283126',
        primary: '#4f7246', primaryStrong: '#bcd7ae', onPrimary: '#ffffff', secondary: '#705941', accent: '#c39448',
        text: '#f4f7f0', mutedText: '#bec9b8', border: '#3c4939', focus: '#c7e1b8',
        success: '#70c79e', warning: '#e7b766', danger: '#f18b96',
        chartSeries: ['#91bc7b', '#b39473', '#76a48d', '#deb15b', '#6eb5af'],
        artworkWarm: '#8e6745', artworkWarmStrong: '#5e4933', artworkCool: '#6f8d61', artworkCoolStrong: '#46633f',
      },
      shadows: { card: '0 0.75rem 2rem rgb(4 8 4 / 34%)', navigation: '0 -0.5rem 2rem rgb(4 8 4 / 40%)', soft: 'rgb(4 8 4 / 25%)' },
    },
  },
} satisfies PaletteDefinition

const oceanPalette = {
  ...sharedStructure,
  id: 'ocean', name: 'Ocean',
  variants: {
    light: {
      artworkFilter: 'hue-rotate(143deg) saturate(0.68) brightness(0.96)',
      colors: {
        background: '#f6fbfc', backgroundAccent: '#e8f4f4', surface: '#ffffff', surfaceElevated: '#f0f8f9',
        primary: '#147b83', primaryStrong: '#07535e', onPrimary: '#ffffff', secondary: '#3f6fa5', accent: '#a86222',
        text: '#172b33', mutedText: '#536a72', border: '#cee1e3', focus: '#075d69',
        success: '#167052', warning: '#875100', danger: '#ad3d51',
        chartSeries: ['#147b83', '#3f6fa5', '#3d9084', '#a86222', '#6d5f9d'],
        artworkWarm: '#d28a58', artworkWarmStrong: '#9e5a31', artworkCool: '#56a9b4', artworkCoolStrong: '#326f98',
      },
      shadows: { card: '0 0.75rem 2rem rgb(7 83 94 / 11%)', navigation: '0 -0.5rem 2rem rgb(7 83 94 / 13%)', soft: 'rgb(20 74 84 / 8%)' },
    },
    dark: {
      artworkFilter: 'hue-rotate(143deg) saturate(0.56) brightness(0.5)',
      colors: {
        background: '#0f1b20', backgroundAccent: '#182c32', surface: '#17252a', surfaceElevated: '#203138',
        primary: '#176d76', primaryStrong: '#9bd9dc', onPrimary: '#ffffff', secondary: '#345f88', accent: '#c9864a',
        text: '#f0f8fa', mutedText: '#b5c9ce', border: '#334b52', focus: '#a7e4e7',
        success: '#67caa0', warning: '#edb963', danger: '#f28b9e',
        chartSeries: ['#6fc4ca', '#78a4d2', '#68b5a8', '#e0a061', '#aa91d0'],
        artworkWarm: '#9a6444', artworkWarmStrong: '#6f452e', artworkCool: '#427f8b', artworkCoolStrong: '#285c75',
      },
      shadows: { card: '0 0.75rem 2rem rgb(2 8 11 / 35%)', navigation: '0 -0.5rem 2rem rgb(2 8 11 / 42%)', soft: 'rgb(2 8 11 / 26%)' },
    },
  },
} satisfies PaletteDefinition

const midnightPalette = {
  ...sharedStructure,
  id: 'midnight', name: 'Midnight',
  variants: {
    light: {
      artworkFilter: 'hue-rotate(196deg) saturate(0.58) brightness(0.96)',
      colors: {
        background: '#f7f8ff', backgroundAccent: '#ecefff', surface: '#ffffff', surfaceElevated: '#f2f4ff',
        primary: '#5567bd', primaryStrong: '#34458f', onPrimary: '#ffffff', secondary: '#72559a', accent: '#946720',
        text: '#1d2440', mutedText: '#5c647f', border: '#d7dbed', focus: '#4357b1',
        success: '#247255', warning: '#80540d', danger: '#a63f55',
        chartSeries: ['#5567bd', '#72559a', '#477f9b', '#946720', '#a54e77'],
        artworkWarm: '#a97491', artworkWarmStrong: '#79506e', artworkCool: '#7c89d0', artworkCoolStrong: '#5664ad',
      },
      shadows: { card: '0 0.75rem 2rem rgb(52 69 143 / 11%)', navigation: '0 -0.5rem 2rem rgb(52 69 143 / 13%)', soft: 'rgb(35 45 91 / 8%)' },
    },
    dark: {
      artworkFilter: 'hue-rotate(196deg) saturate(0.62) brightness(0.58)',
      colors: {
        background: '#101725', backgroundAccent: '#1b2740', surface: '#182238', surfaceElevated: '#202c45',
        primary: '#5365bd', primaryStrong: '#c1c9ff', onPrimary: '#ffffff', secondary: '#74549f', accent: '#d0a75d',
        text: '#f3f5fb', mutedText: '#b9c2d5', border: '#394660', focus: '#d3d7ff',
        success: '#64cda0', warning: '#efbd6c', danger: '#ff8ba0',
        chartSeries: ['#8e9cf0', '#b187d7', '#63c0c4', '#e1b465', '#df819d'],
        artworkWarm: '#b66e91', artworkWarmStrong: '#744b7f', artworkCool: '#7789dc', artworkCoolStrong: '#4f5fae',
      },
      shadows: { card: '0 0.75rem 2rem rgb(2 7 18 / 32%)', navigation: '0 -0.5rem 2rem rgb(2 7 18 / 38%)', soft: 'rgb(2 7 18 / 24%)' },
    },
  },
} satisfies PaletteDefinition

const slatePalette = {
  ...sharedStructure,
  id: 'slate', name: 'Slate',
  variants: {
    light: {
      artworkFilter: 'grayscale(0.55) hue-rotate(154deg) saturate(0.52) brightness(0.88)',
      colors: {
        background: '#f7f8f9', backgroundAccent: '#edf1f3', surface: '#ffffff', surfaceElevated: '#f3f5f6',
        primary: '#526f85', primaryStrong: '#334e61', onPrimary: '#ffffff', secondary: '#68727d', accent: '#8d633d',
        text: '#202a31', mutedText: '#5b6871', border: '#d8dfe3', focus: '#315f7a',
        success: '#277054', warning: '#80520b', danger: '#a5414d',
        chartSeries: ['#526f85', '#68727d', '#638a8a', '#8d633d', '#6f668c'],
        artworkWarm: '#a3826a', artworkWarmStrong: '#75604e', artworkCool: '#7f99aa', artworkCoolStrong: '#526f85',
      },
      shadows: { card: '0 0.75rem 2rem rgb(51 78 97 / 11%)', navigation: '0 -0.5rem 2rem rgb(51 78 97 / 13%)', soft: 'rgb(38 55 68 / 8%)' },
    },
    dark: {
      artworkFilter: 'grayscale(0.65) hue-rotate(154deg) saturate(0.42) brightness(0.48)',
      colors: {
        background: '#171b1e', backgroundAccent: '#252c31', surface: '#20262a', surfaceElevated: '#2a3136',
        primary: '#526f85', primaryStrong: '#b9cedb', onPrimary: '#ffffff', secondary: '#5c6872', accent: '#b6865a',
        text: '#f3f5f6', mutedText: '#bbc4ca', border: '#3c474e', focus: '#bed7e4',
        success: '#69c59a', warning: '#e6b66b', danger: '#ef8b98',
        chartSeries: ['#84a7be', '#9aa5ad', '#78aaa7', '#d2a16f', '#a59abb'],
        artworkWarm: '#806654', artworkWarmStrong: '#5c4a3d', artworkCool: '#617986', artworkCoolStrong: '#435966',
      },
      shadows: { card: '0 0.75rem 2rem rgb(4 6 7 / 35%)', navigation: '0 -0.5rem 2rem rgb(4 6 7 / 42%)', soft: 'rgb(4 6 7 / 26%)' },
    },
  },
} satisfies PaletteDefinition

const lavenderPalette = {
  ...sharedStructure,
  id: 'lavender', name: 'Lavender',
  variants: {
    light: {
      artworkFilter: 'hue-rotate(298deg) saturate(0.65) brightness(0.98)',
      colors: {
        background: '#fdfafe', backgroundAccent: '#f3ecf8', surface: '#ffffff', surfaceElevated: '#faf4fc',
        primary: '#8b5ba7', primaryStrong: '#5d3674', onPrimary: '#ffffff', secondary: '#a45c7d', accent: '#a9682d',
        text: '#2d2132', mutedText: '#6b5d70', border: '#e4d7e8', focus: '#6b3c80',
        success: '#247055', warning: '#865008', danger: '#ae3d59',
        chartSeries: ['#8b5ba7', '#a45c7d', '#6f72b0', '#a9682d', '#548a83'],
        artworkWarm: '#c87f9f', artworkWarmStrong: '#99516f', artworkCool: '#a98ac8', artworkCoolStrong: '#785795',
      },
      shadows: { card: '0 0.75rem 2rem rgb(93 54 116 / 11%)', navigation: '0 -0.5rem 2rem rgb(93 54 116 / 13%)', soft: 'rgb(73 44 85 / 8%)' },
    },
    dark: {
      artworkFilter: 'hue-rotate(298deg) saturate(0.52) brightness(0.52)',
      colors: {
        background: '#1d1721', backgroundAccent: '#302438', surface: '#281f2c', surfaceElevated: '#35283a',
        primary: '#805398', primaryStrong: '#dfbbed', onPrimary: '#ffffff', secondary: '#874d69', accent: '#c4864e',
        text: '#faf4fc', mutedText: '#ccb9d0', border: '#4f3c56', focus: '#e5c4ef',
        success: '#6bc99f', warning: '#eabb69', danger: '#f28da6',
        chartSeries: ['#b48bca', '#c77f9f', '#8c92d1', '#dda15f', '#77ada4'],
        artworkWarm: '#965c78', artworkWarmStrong: '#693d58', artworkCool: '#80649a', artworkCoolStrong: '#58426e',
      },
      shadows: { card: '0 0.75rem 2rem rgb(7 4 9 / 35%)', navigation: '0 -0.5rem 2rem rgb(7 4 9 / 42%)', soft: 'rgb(7 4 9 / 26%)' },
    },
  },
} satisfies PaletteDefinition

export const themePresets = [sunsetPalette, forestPalette, oceanPalette, midnightPalette, slatePalette, lavenderPalette] as const
export type ThemePresetId = typeof themePresets[number]['id']
export const defaultTheme = sunsetPalette

export function resolvePalette(id: unknown): PaletteDefinition {
  return themePresets.find((theme) => theme.id === id) ?? defaultTheme
}

export function resolveTheme(id: unknown, appearance: ResolvedAppearance): ResolvedTheme {
  const palette = resolvePalette(id)
  return { id: palette.id, name: palette.name, appearance, colorScheme: appearance, ...palette.variants[appearance], spacing: palette.spacing, radii: palette.radii, motion: palette.motion }
}
