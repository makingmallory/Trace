import { useEffect, useMemo, useState } from 'react'
import type { TrendsData } from '../../analytics/AnalyticsProvider.ts'
import { defaultForecastSelection, forecastSelectionEvent, readForecastSelection, saveForecastSelection } from '../../analytics/forecasting/forecastSelection.ts'
import { forecastabilityLabel, forecastDateLabel } from '../../analytics/forecasting/forecastPresentation.ts'
import type { ForecastResult, ForecastWeekResult } from '../../analytics/forecasting/forecastTypes.ts'
import { iconGlyph } from '../../presets/iconLibrary.ts'
import { effectiveCategoryColor } from '../../themes/categoryColors.ts'
import { ForecastIdentityMark, ForecastWeekVisualization, type ForecastIdentity } from './ForecastVisualizations.tsx'
import { forecastDisplay, targetSpecificForecastReasons } from './forecastPresentation.ts'
import { useForecastResults, useForecastWeekResults } from './useForecastResults.ts'

const percentage = (value: number): string => `${Math.round(value * 100)}%`

export function ForecastCard({ result, identity }: { result: ForecastResult; identity?: ForecastIdentity }) {
  if (result.status !== 'ready' || !result.prediction) return <article className="forecast-card forecast-card--quiet"><header><div className="forecast-card__identity"><ForecastIdentityMark identity={identity} /><h3>{result.target.label}</h3></div></header><p>{result.warnings[0] ?? 'More history is needed before this forecast is ready.'}</p></article>
  const prediction = result.prediction
  const display = forecastDisplay(result)
  const reasons = targetSpecificForecastReasons(result)
  return <article className="forecast-card">
    <header><div className="forecast-card__identity"><ForecastIdentityMark identity={identity} /><div><h3>{result.target.label}</h3><p>{identity?.category ?? 'Tomorrow'}</p></div></div><span className={`forecast-confidence forecast-confidence--${result.confidence}`}>{result.confidence ?? 'low'}</span></header>
    <div className="forecast-card__result"><p className="forecast-card__primary">{prediction.kind === 'multiselect' ? 'Independent chances for each option' : display.value}</p>{display.probability ? <span>{display.probability}</span> : null}</div>{display.detail ? <p className="forecast-card__range">{display.detail}</p> : null}
    {(prediction.kind === 'nominal' || prediction.kind === 'multiselect') ? <ul className="forecast-probabilities">{prediction.probabilities.map((item) => <li key={item.id}><span>{item.label}</span><strong>{percentage(item.probability)}</strong></li>)}</ul> : null}
    {reasons.length ? <details><summary>Why this estimate?</summary><div className="forecast-card__explanation">{reasons.map((reason) => <p key={reason}>{reason}</p>)}</div></details> : null}
  </article>
}

export function WeekForecastCard({ week, identity }: { week: ForecastWeekResult; identity?: ForecastIdentity }) {
  const useful = week.days.filter((day) => day.horizonState !== 'insufficient')
  const topPrediction = useful[0]?.prediction
  const nominalLabels = useful.flatMap((day) => day.prediction?.kind === 'nominal' && day.prediction.probabilities[0] ? [day.prediction.probabilities[0].label] : [])
  const mostCommonNominal = [...new Set(nominalLabels)].sort((a, b) => nominalLabels.filter((item) => item === b).length - nominalLabels.filter((item) => item === a).length || a.localeCompare(b))[0]
  const summary = topPrediction?.kind === 'binary' ? `Highest daily chance ${percentage(Math.max(...useful.flatMap((day) => day.prediction?.kind === 'binary' ? [day.prediction.probability] : [])))}`
    : topPrediction?.kind === 'nominal' ? `Most often ${mostCommonNominal ?? 'still learning'}`
      : topPrediction?.kind === 'multiselect' ? `Likely recurring: ${topPrediction.probabilities.slice(0, 2).map((item) => item.label).join(', ')}` : week.summary
  return <article className="forecast-week-card"><header><div className="forecast-card__identity"><ForecastIdentityMark identity={identity} /><div><h3>{week.target.label}</h3><p>{identity?.category ?? summary}</p></div></div><span className={`forecast-confidence forecast-confidence--${week.weeklyConfidence}`}>{week.weeklyConfidence}</span></header><p className="forecast-week-card__summary">{summary}</p><ForecastWeekVisualization week={week} /><p className="forecast-week-card__confidence">{week.confidenceSummary}</p></article>
}

export function ForecastMethodology() {
  return <footer className="forecast-methodology"><h3>About your forecast</h3><p>Estimates use your recorded history. Trace compares richer models with simple recent-history baselines and only keeps them when they perform better on later dates.</p><small>Estimates are not medical diagnoses.</small></footer>
}

function forecastIdentities(data: TrendsData | null): ReadonlyMap<string, ForecastIdentity> {
  const categories = new Map(data?.categories.map((category) => [category.id, category]))
  return new Map(data?.trackables.map((trackable) => { const category = categories.get(trackable.categoryId); return [trackable.id, { icon: iconGlyph(trackable.icon), accent: effectiveCategoryColor(category ?? { id: trackable.categoryId }), category: category?.name }] }) ?? [])
}

export function ForecastPanel({ data }: { data: TrendsData | null }) {
  const { results, error, forecastDate, loading } = useForecastResults(data)
  const [horizon, setHorizon] = useState<1 | 7>(1)
  const [selected, setSelected] = useState<readonly string[] | null>(readForecastSelection)
  useEffect(() => { if (results && selected === null) { const defaults = defaultForecastSelection(results); setSelected(defaults); saveForecastSelection(defaults) } }, [results, selected])
  useEffect(() => { const refresh = () => setSelected(readForecastSelection()); globalThis.addEventListener(forecastSelectionEvent, refresh); return () => globalThis.removeEventListener(forecastSelectionEvent, refresh) }, [])
  const visible = useMemo(() => results ? results.filter((item) => selected?.includes(item.target.descriptorId)) : [], [results, selected])
  const selectedIds = useMemo(() => selected ?? [], [selected])
  const identities = useMemo(() => forecastIdentities(data), [data])
  const week = useForecastWeekResults(data, selectedIds, horizon === 7)
  function toggle(id: string) { const base = selected ?? defaultForecastSelection(results ?? []); const next = base.includes(id) ? base.filter((item) => item !== id) : [...base, id]; setSelected(next); saveForecastSelection(next) }
  const activeError = horizon === 1 ? error : week.error
  const activeLoading = loading || horizon === 7 && week.loading
  return <section className="forecast-panel" aria-label="Forecast"><div className="forecast-horizon-switch" role="group" aria-label="Forecast horizon"><button type="button" aria-pressed={horizon === 1} onClick={() => setHorizon(1)}>Tomorrow</button><button type="button" aria-pressed={horizon === 7} onClick={() => setHorizon(7)}>7 days</button></div><header className="forecast-panel__heading"><p>{horizon === 1 ? 'Tomorrow' : 'Next 7 days'}</p><h2>{horizon === 1 ? forecastDateLabel(forecastDate) : 'Your week ahead'}</h2><p>{horizon === 1 ? 'A careful estimate from your recorded history.' : 'A daily outlook that becomes more cautious farther from today.'}</p></header>{activeError ? <p role="alert" className="notice notice--error">{activeError}</p> : activeLoading ? <p role="status" className="forecast-loading">Preparing {horizon === 1 ? 'tomorrow’s forecast' : 'your 7-day outlook'}…</p> : <><details className="forecast-targets"><summary>Forecast Trackables <span>{visible.length} shown</span></summary><div>{results!.map((item) => <label key={item.target.descriptorId}><input type="checkbox" checked={Boolean(selected?.includes(item.target.descriptorId))} onChange={() => toggle(item.target.descriptorId)} /><span>{item.target.label}<small>{forecastabilityLabel(item)}</small></span></label>)}</div></details>{horizon === 1 ? visible.length ? <div className="forecast-list">{visible.map((item) => <ForecastCard key={item.target.descriptorId} result={item} identity={identities.get(item.target.trackableId)} />)}</div> : <p className="forecast-empty">{selected?.length === 0 ? 'Choose Trackables to see tomorrow’s estimates.' : 'Trace needs more recorded history before it can make a careful next-day estimate.'}</p> : week.results?.length ? <div className="forecast-week-list">{week.results.map((item) => <WeekForecastCard key={item.target.descriptorId} week={item} identity={identities.get(item.target.trackableId)} />)}</div> : <p className="forecast-empty">Choose Trackables to see your 7-day outlook.</p>}<ForecastMethodology /></>}</section>
}
