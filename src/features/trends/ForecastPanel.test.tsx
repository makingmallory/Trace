import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ForecastResult } from '../../analytics/forecasting/forecastTypes.ts'
import { forecastDateLabel, localForecastDates } from '../../analytics/forecasting/forecastPresentation.ts'
import { ForecastCard } from './ForecastPanel.tsx'

const target = { descriptorId: 'energy', trackableId: 'energy', label: 'Energy', measurementType: 'continuous' as const, kind: 'numeric' as const }
const ready = (prediction: ForecastResult['prediction']): ForecastResult => ({ status: 'ready', target, forecastDate: '2026-10-05', generatedAt: '2026-10-04T23:59:59.999Z', dataCutoffDate: '2026-10-04', prediction, confidence: 'moderate', selectedModelKind: 'baseline', baselineModel: 'recent-mean', validationMetric: 'mae', validationScore: .5, baselineScore: .5, improvement: 0, regimeStrategy: 'full-history', contributors: [], warnings: [], diagnostics: { usableObservations: 80, missingness: .1, folds: [], reviewedFeatureFeedback: [], excludedFeatureKeys: [] } })

describe('Forecast cards', () => {
  it('formats the actual next local date and numeric uncertainty without a naked estimate', () => {
    expect(forecastDateLabel('2026-10-05')).toContain('Oct')
    expect(localForecastDates(new Date(2026, 9, 4, 21))).toEqual({ asOfDate: '2026-10-04', forecastDate: '2026-10-05' })
    const html = renderToStaticMarkup(<ForecastCard result={ready({ kind: 'numeric', estimate: 3.4, likelyLow: 2.5, likelyHigh: 4.3 })} />)
    expect(html).toContain('Likely around 2.5–4.3'); expect(html).toContain('moderate confidence')
  })
  it('renders probability and independent multi-select language', () => {
    expect(renderToStaticMarkup(<ForecastCard result={ready({ kind: 'binary', probability: .28 })} />)).toContain('Chance · 28%')
    const html = renderToStaticMarkup(<ForecastCard result={ready({ kind: 'multiselect', probabilities: [{ id: 'jaw', label: 'Jaw', probability: .72 }, { id: 'chin', label: 'Chin', probability: .48 }] })} />)
    expect(html).toContain('Independent chances'); expect(html).toContain('Jaw'); expect(html).toContain('72%')
  })
  it('shows an estimate rather than a misleading full-domain interval and keeps model detail optional', () => {
    const result = { ...ready({ kind: 'ordinal', estimate: 3.7, likelyLow: 1, likelyHigh: 5 }), diagnostics: { ...ready(undefined).diagnostics, uninformativeRange: true, capability: 'basic' as const, limitedVariation: true }, warnings: ['Only one outcome has been common so far.'] }
    const html = renderToStaticMarkup(<ForecastCard result={result} />)
    expect(html).toContain('Most likely: 4'); expect(html).toContain('hard to narrow down'); expect(html).not.toContain('Likely around 1–5')
    expect(html).toContain('Why this estimate?'); expect(html).toContain('smoothed recent pattern')
  })
  it('gives insufficient history a calm, non-error state', () => {
    const result: ForecastResult = { ...ready(undefined), status: 'insufficient-history', prediction: undefined, warnings: ['Trace needs more recorded history before it can forecast this reliably.'] }
    expect(renderToStaticMarkup(<ForecastCard result={result} />)).toContain('needs more recorded history')
  })
})
