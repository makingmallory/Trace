import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ForecastPrediction, ForecastResult, ForecastTarget, ForecastWeekResult, HorizonForecastResult, PlanningForecastResult } from '../../analytics/forecasting/forecastTypes.ts'
import { forecastDateLabel, localForecastDates } from '../../analytics/forecasting/forecastPresentation.ts'
import { CrossTargetPlanningSummary, ForecastCard, ForecastMethodology, ForecastPanel, PlanningForecastCard, WeekForecastCard } from './ForecastPanel.tsx'

const target = { descriptorId: 'energy', trackableId: 'energy', label: 'Energy', measurementType: 'continuous' as const, kind: 'numeric' as const }
const ready = (prediction: ForecastResult['prediction']): ForecastResult => ({ status: 'ready', target, forecastDate: '2026-10-05', generatedAt: '2026-10-04T23:59:59.999Z', dataCutoffDate: '2026-10-04', prediction, confidence: 'moderate', selectedModelKind: 'baseline', baselineModel: 'recent-mean', validationMetric: 'mae', validationScore: .5, baselineScore: .5, improvement: 0, regimeStrategy: 'full-history', contributors: [], warnings: [], diagnostics: { usableObservations: 80, missingness: .1, folds: [], reviewedFeatureFeedback: [], excludedFeatureKeys: [] } })
const week = (weekTarget: ForecastTarget, prediction: ForecastPrediction): ForecastWeekResult => ({ target: weekTarget, weeklyConfidence: 'moderate', confidenceSummary: 'Moderate confidence through Wednesday; lower later in the week.', summary: '6 of 7 days have a usable estimate.', days: Array.from({ length: 7 }, (_, index): HorizonForecastResult => ({ ...ready(index === 6 ? undefined : prediction), target: weekTarget, forecastDate: `2026-10-${String(5 + index).padStart(2, '0')}`, horizon: index + 1, horizonState: index === 6 ? 'insufficient' : index > 2 ? 'rough' : 'ready', usedRecursiveInputs: index > 0, status: index === 6 ? 'insufficient-history' : 'ready', confidence: index > 1 ? 'low' : 'moderate', diagnostics: { ...ready(undefined).diagnostics, horizon: index + 1, uninformativeRange: false } })) })
const planning = (planningTarget = target): PlanningForecastResult => ({ target: planningTarget, horizonDays: 30, selectedStrategy: 'recent-history', strategyScores: [{ strategy: 'recent-history', score: .4, validationCount: 20 }], validationMetric: 'mae', intervalCoverage: .8, confidenceSummary: 'Confidence is moderate through 2026-10-18; later windows are more uncertain.', summary: '23 of 30 days contribute to the planning windows.', regimeStrategy: 'full-history', usableFraction: 23 / 30, days: [], windows: [
  { startDate: '2026-10-05', endDate: '2026-10-11', startHorizon: 1, endHorizon: 7, state: 'useful', confidence: 'moderate', usableDays: 7, totalDays: 7, prediction: { kind: 'numeric', estimate: 3.5, likelyLow: 3, likelyHigh: 4 }, normalizedScore: 0, direction: 'around-usual', preference: 'neutral', summary: 'Expected to stay around your recent pattern.' },
  { startDate: '2026-10-12', endDate: '2026-10-18', startHorizon: 8, endHorizon: 14, state: 'rough', confidence: 'moderate', usableDays: 7, totalDays: 7, prediction: { kind: 'numeric', estimate: 4, likelyLow: 2.8, likelyHigh: 4.8 }, normalizedScore: .2, direction: 'higher', preference: 'unknown', summary: 'Trends higher than your recent pattern.' },
  { startDate: '2026-10-19', endDate: '2026-10-25', startHorizon: 15, endHorizon: 21, state: 'rough', confidence: 'low', usableDays: 6, totalDays: 7, prediction: { kind: 'numeric', estimate: 3.7, likelyLow: 2, likelyHigh: 5 }, normalizedScore: .1, direction: 'around-usual', preference: 'neutral', summary: 'Expected to stay around your recent pattern.' },
  { startDate: '2026-10-26', endDate: '2026-11-03', startHorizon: 22, endHorizon: 30, state: 'insufficient', confidence: 'low', usableDays: 3, totalDays: 9, direction: 'uncertain', preference: 'unknown', summary: 'Not enough evidence for a useful estimate this far out.' },
] })

describe('Forecast cards', () => {
  it('formats the actual next local date and numeric uncertainty without repeating tomorrow', () => {
    expect(forecastDateLabel('2026-10-05')).toContain('Oct')
    expect(localForecastDates(new Date(2026, 9, 4, 21))).toEqual({ asOfDate: '2026-10-04', forecastDate: '2026-10-05' })
    const html = renderToStaticMarkup(<ForecastCard result={ready({ kind: 'numeric', estimate: 3.4, likelyLow: 2.5, likelyHigh: 4.3 })} />)
    expect(html).toContain('>3.4</p>'); expect(html).toContain('Likely range 2.5–4.3'); expect(html).toContain('forecast-confidence--moderate'); expect(html).not.toContain('Likely tomorrow')
  })
  it('names the predicted binary class and retains its class probability', () => {
    const low = renderToStaticMarkup(<ForecastCard result={ready({ kind: 'binary', probability: .28 })} />)
    const high = renderToStaticMarkup(<ForecastCard result={ready({ kind: 'binary', probability: .97 })} />)
    expect(low).toContain('>No</p>'); expect(low).toContain('72%'); expect(high).toContain('>Yes</p>'); expect(high).toContain('97%')
  })
  it('renders independent multi-select language', () => {
    const html = renderToStaticMarkup(<ForecastCard result={ready({ kind: 'multiselect', probabilities: [{ id: 'jaw', label: 'Jaw', probability: .72 }, { id: 'chin', label: 'Chin', probability: .48 }] })} />)
    expect(html).toContain('Independent chances'); expect(html).toContain('Jaw'); expect(html).toContain('72%')
  })
  it('shows an estimate rather than a misleading full-domain interval and keeps model detail optional', () => {
    const result = { ...ready({ kind: 'ordinal', estimate: 3.7, likelyLow: 1, likelyHigh: 5 }), diagnostics: { ...ready(undefined).diagnostics, uninformativeRange: true, capability: 'basic' as const, limitedVariation: true }, warnings: ['Only one outcome has been common so far.'] }
    const html = renderToStaticMarkup(<ForecastCard result={result} />)
    expect(html).toContain('>4</p>'); expect(html).toContain('hard to narrow down'); expect(html).not.toContain('Likely range 1–5')
    expect(html).toContain('Why this estimate?'); expect(html).toContain('very little outcome variation'); expect(html).not.toContain('reliable holdout check')
  })
  it('gives insufficient history a calm, non-error state', () => {
    const result: ForecastResult = { ...ready(undefined), status: 'insufficient-history', prediction: undefined, warnings: ['Trace needs more recorded history before it can forecast this reliably.'] }
    expect(renderToStaticMarkup(<ForecastCard result={result} />)).toContain('needs more recorded history')
  })
  it('renders a compact accessible numeric chart with focusable inspection markers', () => {
    const html = renderToStaticMarkup(<WeekForecastCard week={week(target, { kind: 'numeric', estimate: 3.5, likelyLow: 3, likelyHigh: 4 })} />)
    expect(html).toContain('forecast-chart--numeric'); expect(html).toContain('role="img"'); expect(html).toContain('>Mon</text>'); expect(html).toContain('>Sun</text>')
    expect(html).toContain('forecast-chart__range'); expect(html).toContain('Moderate confidence through Wednesday'); expect(html).toContain('chart-tooltip-hit'); expect(html).toContain('tabindex="0"')
    expect((html.match(/forecast-week-card/g) ?? [])).toHaveLength(3) // card, summary, and confidence class—not seven day cards
  })
  it('uses target-appropriate binary, ordinal, nominal, and multi-select week visualizations', () => {
    const binary = renderToStaticMarkup(<WeekForecastCard week={week({ ...target, kind: 'binary', measurementType: 'binary' }, { kind: 'binary', probability: .72 })} />)
    const ordinalTarget = { ...target, kind: 'ordinal' as const, measurementType: 'ordinal' as const, options: [{ id: 'low', label: 'Low' }, { id: 'high', label: 'High' }] }
    const ordinal = renderToStaticMarkup(<WeekForecastCard week={week(ordinalTarget, { kind: 'ordinal', estimate: 1, likelyLow: 0, likelyHigh: 1 })} />)
    const nominal = renderToStaticMarkup(<WeekForecastCard week={week({ ...target, kind: 'nominal', measurementType: 'nominal-single', options: [{ id: 'good', label: 'Good' }] }, { kind: 'nominal', probabilities: [{ id: 'good', label: 'Good', probability: .7 }] })} />)
    const multi = renderToStaticMarkup(<WeekForecastCard week={week({ ...target, kind: 'multiselect', measurementType: 'nominal-multiselect', options: [{ id: 'jaw', label: 'Jaw' }] }, { kind: 'multiselect', probabilities: [{ id: 'jaw', label: 'Jaw', probability: .72 }, { id: 'chin', label: 'Chin', probability: .48 }] })} />)
    expect(binary).toContain('forecast-chart--binary'); expect(ordinal).toContain('forecast-chart--numeric'); expect(nominal).toContain('forecast-category-timeline'); expect(nominal).toContain('Good'); expect(multi).toContain('forecast-multi-chart'); expect(multi).toContain('Jaw'); expect(multi).toContain('72%')
  })
  it('does not draw a misleading uncertainty whisker for an uninformative range', () => {
    const item = week(target, { kind: 'numeric', estimate: 3.5, likelyLow: 1, likelyHigh: 5 })
    const uninformative = { ...item, days: item.days.map((day) => ({ ...day, diagnostics: { ...day.diagnostics, uninformativeRange: true } })) }
    expect(renderToStaticMarkup(<WeekForecastCard week={uninformative} />)).not.toContain('forecast-chart__range')
  })
  it('offers Tomorrow, 7 days, and 30 days in one Forecast surface', () => {
    const html = renderToStaticMarkup(<ForecastPanel data={null} />)
    expect(html).toContain('aria-label="Forecast horizon"'); expect(html).toContain('Tomorrow</button>'); expect(html).toContain('7 days</button>'); expect(html).toContain('30 days</button>')
  })
  it('renders compact planning windows, confidence decay, and focusable aggregate tooltips', () => {
    const html = renderToStaticMarkup(<PlanningForecastCard result={planning()} />)
    expect(html).toContain('forecast-planning-card'); expect(html).toContain('Oct 5–Oct 11'); expect(html).toContain('Trends higher than your recent pattern')
    expect(html).toContain('insufficient'); expect(html).toContain('planning-chart'); expect(html).toContain('chart-tooltip-hit'); expect(html).toContain('tabindex="0"')
    expect((html.match(/planning-window-state/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })
  it('keeps cross-target planning summaries separate and neutral', () => {
    const second = planning({ ...target, descriptorId: 'mood', trackableId: 'mood', label: 'Mood' })
    const html = renderToStaticMarkup(<CrossTargetPlanningSummary results={[planning(), second]} />)
    expect(html).toContain('Next few weeks'); expect(html).toContain('Energy'); expect(html).toContain('Mood'); expect(html).not.toContain('best vacation')
  })
  it('keeps common methodology once below the result cards instead of repeating it per card', () => {
    const html = renderToStaticMarkup(<ForecastMethodology />)
    expect(html).toContain('About your forecast')
    expect(html).toContain('only keeps them when they perform better on later dates')
  })
})
