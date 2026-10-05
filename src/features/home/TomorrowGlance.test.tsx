import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ForecastResult } from '../../analytics/forecasting/forecastTypes.ts'
import { forecastGlanceValue } from '../../analytics/forecasting/forecastPresentation.ts'
import { defaultForecastSelection, homeForecastRows, readForecastSelection, saveForecastSelection } from '../../analytics/forecasting/forecastSelection.ts'
import { TomorrowGlanceContent } from './TomorrowGlance.tsx'

const result = (id: string, prediction: ForecastResult['prediction'], confidence: ForecastResult['confidence'] = 'low', status: ForecastResult['status'] = 'ready'): ForecastResult => ({ status, target: { descriptorId: id, trackableId: id, label: id, measurementType: 'continuous', kind: 'numeric' }, forecastDate: '2026-10-05', generatedAt: '2026-10-04T12:00:00Z', dataCutoffDate: '2026-10-04', prediction, confidence, selectedModelKind: 'baseline', baselineModel: 'recent-mean', contributors: [], warnings: [], diagnostics: { usableObservations: 29, missingness: .1, folds: [], reviewedFeatureFeedback: [], excludedFeatureKeys: [], capability: 'basic' } })
const numeric = { kind: 'numeric' as const, estimate: 145, likelyLow: 140, likelyHigh: 150 }
const items = [result('Energy', { kind: 'ordinal', estimate: 3.7, likelyLow: 3, likelyHigh: 5 }, 'moderate'), result('Acne Present', { kind: 'binary', probability: .97 }, 'low'), result('Weight', numeric, 'high'), result('Mood', { kind: 'nominal', probabilities: [{ id: 'good', label: 'Good', probability: .7 }] }), result('Acne Location', { kind: 'multiselect', probabilities: [{ id: 'jaw', label: 'Jaw', probability: .72 }, { id: 'chin', label: 'Chin', probability: .48 }] }), result('Sparse', undefined, 'low', 'insufficient-history')]
afterEach(() => vi.unstubAllGlobals())

describe('Home Tomorrow glance', () => {
  it('shares persisted selection and removes a deselected target', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value) } })
    saveForecastSelection(['Energy', 'Weight'])
    expect(readForecastSelection()).toEqual(['Energy', 'Weight'])
    expect(homeForecastRows(items, readForecastSelection()!).map((item) => item.target.label)).toEqual(['Weight', 'Energy'])
    saveForecastSelection(['Energy'])
    expect(homeForecastRows(items, readForecastSelection()!).map((item) => item.target.label)).toEqual(['Energy'])
    expect(defaultForecastSelection(items)).toHaveLength(4)
  })
  it('limits rows, prioritizes forecastable outputs, and formats each target kind', () => {
    expect(homeForecastRows(items, items.map((item) => item.target.descriptorId))).toHaveLength(3)
    expect(homeForecastRows(items, ['Sparse', 'Mood'])).toHaveLength(1)
    expect(forecastGlanceValue(items[0])).toBe('Likely 4')
    expect(forecastGlanceValue(items[1])).toBe('Very likely · 97%')
    expect(forecastGlanceValue(items[2])).toBe('~145')
    expect(forecastGlanceValue(items[3])).toBe('Most likely: Good')
    expect(forecastGlanceValue(items[4])).toBe('Jaw 72% · Chin 48%')
  })
  it('shows loading, no-forecast state, rows, and direct Forecast navigation', () => {
    const render = (results: readonly ForecastResult[] | null, selected: string[], loading = false) => renderToStaticMarkup(<MemoryRouter><TomorrowGlanceContent results={results} selected={selected} loading={loading} error="" /></MemoryRouter>)
    expect(render(null, ['Energy'], true)).toContain('Preparing tomorrow')
    expect(render(items, ['Sparse'])).toContain('need more recent history')
    const html = render(items, ['Energy'])
    expect(html).toContain('Likely 4'); expect(html).toContain('/trends?tab=forecast'); expect(html).not.toContain('Acne Present')
  })
})
