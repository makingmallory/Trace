import { describe, expect, it } from 'vitest'
import { defaultTheme, resolveTheme, themePresets } from './palettes.ts'
import { activateTheme, APPEARANCE_MODE_STORAGE_KEY, applyThemeToDocument, loadAppearanceMode, loadThemePreference, resolveAppearanceMode, saveAppearanceMode, statusBarIntent, THEME_PREFERENCE_STORAGE_KEY, watchSystemAppearance, type SystemAppearanceSource, type ThemeStorage } from './themePreference.ts'

class MemoryStorage implements ThemeStorage {
  readonly values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

class FakeSystemAppearance implements SystemAppearanceSource {
  private listener: ((event: { matches: boolean }) => void) | null = null
  matches: boolean
  constructor(matches: boolean) { this.matches = matches }
  addEventListener(_type: 'change', listener: (event: { matches: boolean }) => void) { this.listener = listener }
  removeEventListener(_type: 'change', listener: (event: { matches: boolean }) => void) { if (this.listener === listener) this.listener = null }
  change(matches: boolean) { this.matches = matches; this.listener?.({ matches }) }
}

function fakeDocument() {
  const properties = new Map<string, string>()
  const dataset: Record<string, string> = {}
  const style = { colorScheme: '', setProperty: (name: string, value: string) => properties.set(name, value) }
  const meta = { content: '', setAttribute: (_name: string, value: string) => { meta.content = value } }
  return { target: { documentElement: { dataset, style }, querySelector: () => meta } as unknown as Document, dataset, properties, meta }
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('appearance preferences', () => {
  it('uses compatibility-safe defaults when no appearance preference exists', () => {
    const storage = new MemoryStorage()
    expect(loadThemePreference(storage)).toBe(defaultTheme)
    expect(loadAppearanceMode(storage, 'sunset')).toBe('light')
    expect(loadAppearanceMode(storage, 'midnight')).toBe('dark')
  })

  it.each(['light', 'dark', 'system'] as const)('persists %s independently from the palette', (mode) => {
    const storage = new MemoryStorage()
    saveAppearanceMode(mode, storage)
    activateTheme('forest', 'dark', storage)
    expect(storage.getItem(APPEARANCE_MODE_STORAGE_KEY)).toBe(mode)
    expect(storage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('forest')
    expect(loadAppearanceMode(storage, 'forest')).toBe(mode)
    expect(loadThemePreference(storage).id).toBe('forest')
  })

  it('falls back safely from invalid stored palette and appearance values', () => {
    const storage = new MemoryStorage()
    storage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'made-up-theme')
    storage.setItem(APPEARANCE_MODE_STORAGE_KEY, 'twilight')
    expect(loadThemePreference(storage)).toBe(defaultTheme)
    expect(loadAppearanceMode(storage, 'sunset')).toBe('light')
  })

  it('resolves System from the current OS preference', () => {
    expect(resolveAppearanceMode('system', false)).toBe('light')
    expect(resolveAppearanceMode('system', true)).toBe('dark')
    expect(resolveAppearanceMode('light', true)).toBe('light')
    expect(resolveAppearanceMode('dark', false)).toBe('dark')
  })

  it('reacts to system preference changes without a reload and cleans up', () => {
    const source = new FakeSystemAppearance(false)
    const changes: boolean[] = []
    const stop = watchSystemAppearance(source, (dark) => changes.push(dark))
    source.change(true)
    source.change(false)
    stop()
    source.change(true)
    expect(changes).toEqual([true, false])
  })

  it('updates document tokens, appearance attributes, and browser theme-color', () => {
    const document = fakeDocument()
    const dark = resolveTheme('ocean', 'dark')
    applyThemeToDocument(dark, document.target, 'system')
    expect(document.dataset).toMatchObject({ theme: 'ocean', appearance: 'dark', appearanceMode: 'system' })
    expect(document.properties.get('--color-primary')).toBe(dark.colors.primary)
    expect(document.meta.content).toBe(dark.colors.background)

    const light = resolveTheme('ocean', 'light')
    applyThemeToDocument(light, document.target, 'light')
    expect(document.meta.content).toBe(light.colors.background)
  })

  it('resolves native status-bar color and icon intent', () => {
    expect(statusBarIntent(resolveTheme('lavender', 'light'))).toMatchObject({ iconStyle: 'dark', backgroundColor: '#fdfafe' })
    expect(statusBarIntent(resolveTheme('lavender', 'dark'))).toMatchObject({ iconStyle: 'light', backgroundColor: '#1d1721' })
  })
})

describe('palette registry', () => {
  it('provides complete Light and Dark semantic token sets for every palette', () => {
    const required = ['background', 'backgroundAccent', 'surface', 'surfaceElevated', 'primary', 'primaryStrong', 'onPrimary', 'secondary', 'accent', 'text', 'mutedText', 'border', 'focus', 'success', 'warning', 'danger', 'artworkWarm', 'artworkWarmStrong', 'artworkCool', 'artworkCoolStrong'] as const
    expect(themePresets.map((theme) => theme.name)).toEqual(['Sunset', 'Forest', 'Ocean', 'Midnight', 'Slate', 'Lavender'])
    for (const palette of themePresets) for (const appearance of ['light', 'dark'] as const) {
      const variant = palette.variants[appearance]
      for (const token of required) expect(variant.colors[token], `${palette.name}.${appearance}.${token}`).toBeTruthy()
      expect(variant.colors.chartSeries).toHaveLength(5)
      expect(variant.colors.chartSeries.every(Boolean)).toBe(true)
      expect(variant.artworkFilter).toBeTruthy()
      expect(variant.shadows.card).toBeTruthy()
    }
  })

  it('keeps core text, controls, focus, and status colors readable in every combination', () => {
    for (const palette of themePresets) for (const appearance of ['light', 'dark'] as const) {
      const colors = palette.variants[appearance].colors
      const label = `${palette.name} ${appearance}`
      expect(contrast(colors.text, colors.background), `${label} body text`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(colors.mutedText, colors.surface), `${label} muted text`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(colors.onPrimary, colors.primary), `${label} primary button`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(colors.primaryStrong, colors.background), `${label} selected/navigation`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(colors.focus, colors.background), `${label} focus ring`).toBeGreaterThanOrEqual(3)
      expect(contrast(colors.success, colors.backgroundAccent), `${label} success`).toBeGreaterThanOrEqual(3)
      expect(contrast(colors.warning, colors.backgroundAccent), `${label} warning`).toBeGreaterThanOrEqual(3)
      expect(contrast(colors.danger, colors.backgroundAccent), `${label} danger`).toBeGreaterThanOrEqual(3)
    }
  })
})
