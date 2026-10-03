export interface SeriesVisualStyle {
  colorToken: number
  dashPattern: string
  marker: 'circle' | 'square' | 'diamond' | 'triangle' | 'cross' | 'hexagon' | 'kite' | 'octagon'
}

const markerShapes: readonly SeriesVisualStyle['marker'][] = ['circle', 'square', 'diamond', 'triangle', 'cross', 'hexagon', 'kite', 'octagon']
const dashPatterns = ['', '10 4', '4 3', '12 3 2 3', '2 3', '8 3 2 3', '14 4', '1 3'] as const

export function seriesVisualStyle(index: number): SeriesVisualStyle {
  const normalized = ((index % 8) + 8) % 8
  return { colorToken: normalized + 1, dashPattern: dashPatterns[normalized], marker: markerShapes[normalized] }
}

/** Assign broad hue separation first; two-series overlays use blue and red rather than adjacent palette colors. */
export function assignVisibleSeriesStyles(ids: readonly string[]): ReadonlyMap<string, SeriesVisualStyle> {
  const order = ids.length === 2 ? [2, 6] : ids.length === 3 ? [2, 6, 3] : ids.length <= 5 ? [2, 6, 5, 3, 0] : [2, 6, 5, 3, 0, 1, 4, 7]
  return new Map(ids.map((id, index) => [id, seriesVisualStyle(order[index % order.length])]))
}

export function toggleSeriesVisibility(hiddenIds: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(hiddenIds)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}
