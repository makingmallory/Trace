import { describe, expect, it } from 'vitest'
import { assignVisibleSeriesStyles, seriesVisualStyle, toggleSeriesVisibility } from './seriesPresentation.ts'

describe('series presentation state', () => {
  it('provides eight distinguishable color, dash, and marker combinations', () => {
    const styles = Array.from({ length: 8 }, (_, index) => seriesVisualStyle(index))
    expect(new Set(styles.map((style) => style.colorToken)).size).toBe(8)
    expect(new Set(styles.map((style) => style.marker)).size).toBe(8)
    expect(new Set(styles.map((style) => style.dashPattern)).size).toBe(8)
  })

  it('hides and restores a series without changing the selection', () => {
    const selectedIds = ['energy', 'sleep']
    const hidden = toggleSeriesVisibility(new Set(), 'sleep')
    expect([...hidden]).toEqual(['sleep'])
    expect(selectedIds).toEqual(['energy', 'sleep'])
    expect([...toggleSeriesVisibility(hidden, 'sleep')]).toEqual([])
  })

  it('assigns strongly separated blue and red styles to a two-series overlay', () => {
    const styles = assignVisibleSeriesStyles(['energy', 'sleep'])
    expect(styles.get('energy')?.colorToken).toBe(3)
    expect(styles.get('sleep')?.colorToken).toBe(7)
  })
})
