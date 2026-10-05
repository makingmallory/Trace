import { useEffect, useMemo, useState } from 'react'
import type { TrendsData } from '../../analytics/AnalyticsProvider.ts'
import { defaultForecastSelection, forecastSelectionEvent, readForecastSelection, saveForecastSelection } from '../../analytics/forecasting/forecastSelection.ts'
import { forecastabilityLabel, forecastDateLabel } from '../../analytics/forecasting/forecastPresentation.ts'
import { crossTargetPlanningSummary } from '../../analytics/forecasting/planningForecast.ts'
import type { ForecastResult, ForecastWeekResult, PlanningForecastResult } from '../../analytics/forecasting/forecastTypes.ts'
import { iconGlyph } from '../../presets/iconLibrary.ts'
import { effectiveCategoryColor } from '../../themes/categoryColors.ts'
import { ForecastIdentityMark, ForecastWeekVisualization, PlanningForecastVisualization, type ForecastIdentity } from './ForecastVisualizations.tsx'
import { forecastDisplay, targetSpecificForecastReasons } from './forecastPresentation.ts'
import { useForecastPlanningResults, useForecastResults, useForecastWeekResults } from './useForecastResults.ts'

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

const planningDate = (date: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`))

export function PlanningForecastCard({ result, identity }: { result: PlanningForecastResult; identity?: ForecastIdentity }) {
  return <article className="forecast-planning-card"><header><div className="forecast-card__identity"><ForecastIdentityMark identity={identity} /><div><h3>{result.target.label}</h3><p>{identity?.category ?? 'Next 30 days'}</p></div></div><span className={`forecast-confidence forecast-confidence--${result.windows[0]?.confidence ?? 'low'}`}>{result.windows[0]?.confidence ?? 'low'}</span></header>
    <p className="forecast-week-card__summary">{result.summary}</p><PlanningForecastVisualization result={result} />
    <ol className="planning-window-list">{result.windows.map((window) => <li key={window.startDate} data-state={window.state}><div><time dateTime={window.startDate}>{planningDate(window.startDate)}–{planningDate(window.endDate)}</time><span className={`planning-window-state planning-window-state--${window.state}`}>{window.state}</span></div><p>{window.summary}</p><small>{window.usableDays} of {window.totalDays} days · {window.confidence} confidence</small></li>)}</ol>
    <p className="forecast-week-card__confidence">{result.confidenceSummary}</p>
  </article>
}

export function CrossTargetPlanningSummary({ results }: { results: readonly PlanningForecastResult[] }) {
  const windows = crossTargetPlanningSummary(results).filter((window) => window.items.some((item) => item.state !== 'insufficient'))
  if (results.length < 2 || !windows.length) return null
  return <section className="planning-overview" aria-labelledby="planning-overview-title"><header><p>Selected Trackables</p><h3 id="planning-overview-title">Next few weeks</h3></header><div>{windows.map((window) => <article key={window.startDate}><time dateTime={window.startDate}>{planningDate(window.startDate)}–{planningDate(window.endDate)}</time><ul>{window.items.map((item) => <li key={item.descriptorId}><strong>{item.label}</strong><span>{item.summary}</span></li>)}</ul></article>)}</div></section>
}

export function ForecastMethodology() {
  return <footer className="forecast-methodology"><h3>About your forecast</h3><p>Estimates use your recorded history. Trace compares richer models with simple recent-history baselines and only keeps them when they perform better on later dates. Month-ahead results are grouped into planning windows as precision fades.</p><small>Estimates are not medical diagnoses.</small></footer>
}

function forecastIdentities(data: TrendsData | null): ReadonlyMap<string, ForecastIdentity> {
  const categories = new Map(data?.categories.map((category) => [category.id, category]))
  return new Map(data?.trackables.map((trackable) => { const category = categories.get(trackable.categoryId); return [trackable.id, { icon: iconGlyph(trackable.icon), accent: effectiveCategoryColor(category ?? { id: trackable.categoryId }), category: category?.name }] }) ?? [])
}

export function ForecastPanel({ data }: { data: TrendsData | null }) {
  const { results, error, forecastDate, loading } = useForecastResults(data)
  const [horizon, setHorizon] = useState<1 | 7 | 30>(1)
  const [selected, setSelected] = useState<readonly string[] | null>(readForecastSelection)
  useEffect(() => { if (results && selected === null) { const defaults = defaultForecastSelection(results); setSelected(defaults); saveForecastSelection(defaults) } }, [results, selected])
  useEffect(() => { const refresh = () => setSelected(readForecastSelection()); globalThis.addEventListener(forecastSelectionEvent, refresh); return () => globalThis.removeEventListener(forecastSelectionEvent, refresh) }, [])
  const visible = useMemo(() => results ? results.filter((item) => selected?.includes(item.target.descriptorId)) : [], [results, selected])
  const selectedIds = useMemo(() => selected ?? [], [selected])
  const identities = useMemo(() => forecastIdentities(data), [data])
  const week = useForecastWeekResults(data, selectedIds, horizon === 7)
  const planning = useForecastPlanningResults(data, selectedIds, horizon === 30)
  function toggle(id: string) { const base = selected ?? defaultForecastSelection(results ?? []); const next = base.includes(id) ? base.filter((item) => item !== id) : [...base, id]; setSelected(next); saveForecastSelection(next) }
  const activeError = horizon === 1 ? error : horizon === 7 ? week.error : planning.error
  const activeLoading = loading || horizon === 7 && week.loading || horizon === 30 && planning.loading
  const eyebrow = horizon === 1 ? 'Tomorrow' : horizon === 7 ? 'Next 7 days' : 'Next 30 days'
  const title = horizon === 1 ? forecastDateLabel(forecastDate) : horizon === 7 ? 'Your week ahead' : 'Your planning outlook'
  const introduction = horizon === 1 ? 'A careful estimate from your recorded history.' : horizon === 7 ? 'A daily outlook that becomes more cautious farther from today.' : 'Broad windows for relative patterns—not 30 day-by-day promises.'
  const loadingLabel = horizon === 1 ? 'tomorrow’s forecast' : horizon === 7 ? 'your 7-day outlook' : 'your 30-day planning outlook'
  return <section className="forecast-panel" aria-label="Forecast"><div className="forecast-horizon-switch" role="group" aria-label="Forecast horizon"><button type="button" aria-pressed={horizon === 1} onClick={() => setHorizon(1)}>Tomorrow</button><button type="button" aria-pressed={horizon === 7} onClick={() => setHorizon(7)}>7 days</button><button type="button" aria-pressed={horizon === 30} onClick={() => setHorizon(30)}>30 days</button></div><header className="forecast-panel__heading"><p>{eyebrow}</p><h2>{title}</h2><p>{introduction}</p></header>{activeError ? <p role="alert" className="notice notice--error">{activeError}</p> : activeLoading ? <p role="status" className="forecast-loading">Preparing {loadingLabel}…</p> : <><details className="forecast-targets"><summary>Forecast Trackables <span>{visible.length} shown</span></summary><div>{results!.map((item) => <label key={item.target.descriptorId}><input type="checkbox" checked={Boolean(selected?.includes(item.target.descriptorId))} onChange={() => toggle(item.target.descriptorId)} /><span>{item.target.label}<small>{forecastabilityLabel(item)}</small></span></label>)}</div></details>{horizon === 1 ? visible.length ? <div className="forecast-list">{visible.map((item) => <ForecastCard key={item.target.descriptorId} result={item} identity={identities.get(item.target.trackableId)} />)}</div> : <p className="forecast-empty">{selected?.length === 0 ? 'Choose Trackables to see tomorrow’s estimates.' : 'Trace needs more recorded history before it can make a careful next-day estimate.'}</p> : horizon === 7 ? week.results?.length ? <div className="forecast-week-list">{week.results.map((item) => <WeekForecastCard key={item.target.descriptorId} week={item} identity={identities.get(item.target.trackableId)} />)}</div> : <p className="forecast-empty">Choose Trackables to see your 7-day outlook.</p> : planning.results?.length ? <><CrossTargetPlanningSummary results={planning.results} /><div className="forecast-planning-list">{planning.results.map((item) => <PlanningForecastCard key={item.target.descriptorId} result={item} identity={identities.get(item.target.trackableId)} />)}</div></> : <p className="forecast-empty">There isn’t enough history yet for a useful month-ahead pattern.</p>}<ForecastMethodology /></>}</section>
}
