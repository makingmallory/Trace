import { useEffect, useMemo, useState } from 'react'
import type { TrendsData } from '../../analytics/AnalyticsProvider.ts'
import { defaultForecastSelection, forecastSelectionEvent, readForecastSelection, saveForecastSelection } from '../../analytics/forecasting/forecastSelection.ts'
import { forecastabilityLabel, forecastDateLabel, forecastGlanceValue } from '../../analytics/forecasting/forecastPresentation.ts'
import type { ForecastResult } from '../../analytics/forecasting/forecastTypes.ts'
import { useForecastResults } from './useForecastResults.ts'

const compact = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(1)
const percentage = (value: number): string => `${Math.round(value * 100)}%`

export function ForecastCard({ result }: { result: ForecastResult }) {
  if (result.status !== 'ready' || !result.prediction) return <article className="forecast-card forecast-card--quiet"><h3>{result.target.label}</h3><p>{result.warnings[0] ?? 'Trace needs more recent history before forecasting this.'}</p></article>
  const prediction = result.prediction
  const uninformative = result.diagnostics.uninformativeRange === true
  let primary: string; let description: string | null = null
  if (prediction.kind === 'binary') primary = forecastGlanceValue(result)
  else if (prediction.kind === 'nominal') primary = `Most likely: ${prediction.probabilities[0]?.label ?? '—'}`
  else if (prediction.kind === 'multiselect') primary = 'Independent chances for each option'
  else if (prediction.kind === 'ordinal') { primary = `Most likely: ${result.target.options?.[Math.round(prediction.estimate)]?.label ?? Math.round(prediction.estimate)}`; description = uninformative ? 'Tomorrow is still hard to narrow down.' : `Likely around ${compact(prediction.likelyLow)}–${compact(prediction.likelyHigh)}.` }
  else { primary = uninformative ? `Estimate: ${compact(prediction.estimate)}` : `Likely around ${compact(prediction.likelyLow)}–${compact(prediction.likelyHigh)}`; description = uninformative ? 'Tomorrow is still hard to narrow down.' : `Estimated ${compact(prediction.estimate)}; likely range ${compact(prediction.likelyLow)}–${compact(prediction.likelyHigh)}.` }
  return <article className="forecast-card">
    <header><h3>{result.target.label}</h3><span className={`forecast-confidence forecast-confidence--${result.confidence}`}>{result.confidence} confidence</span></header>
    <p className="forecast-card__primary">{primary}</p>{description ? <p className="forecast-card__range">{description}</p> : null}
    {(prediction.kind === 'nominal' || prediction.kind === 'multiselect') ? <ul className="forecast-probabilities">{prediction.probabilities.map((item) => <li key={item.id}><span>{item.label}</span><strong>{percentage(item.probability)}</strong></li>)}</ul> : null}
    <p className="forecast-card__note">Based on your recorded history. This is an estimate, not a diagnosis.</p>
    <details><summary>Why this estimate?</summary><div className="forecast-card__explanation"><p>{result.selectedModelKind === 'baseline' ? 'Recent recordings provided the most dependable guide.' : 'Past outcomes and available earlier signals helped refine this estimate.'}</p>{result.diagnostics.limitedVariation ? <p>Only one outcome, or very little variation, has been recorded so far. The estimate is based on a smoothed recent pattern.</p> : null}{result.diagnostics.capability === 'basic' ? <p>There is not yet enough history for a reliable holdout check.</p> : null}{result.diagnostics.uncertaintyMethod === 'recent-dispersion' ? <p>The likely range reflects recent recorded variation.</p> : null}{result.diagnostics.uncertaintyMethod === 'holdout-residuals' ? <p>The likely range reflects past forecast errors.</p> : null}{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}{result.contributors.length ? <ul>{result.contributors.map((item) => <li key={item.key}>{item.source === 'self-history' ? `Recent ${result.target.label.toLowerCase()} history` : item.source === 'calendar' ? 'Calendar timing' : item.label}</li>)}</ul> : null}</div></details>
  </article>
}

export function ForecastPanel({ data }: { data: TrendsData | null }) {
  const { results, error, forecastDate, loading } = useForecastResults(data)
  const [selected, setSelected] = useState<readonly string[] | null>(readForecastSelection)
  useEffect(() => { if (results && selected === null) { const defaults = defaultForecastSelection(results); setSelected(defaults); saveForecastSelection(defaults) } }, [results, selected])
  useEffect(() => { const refresh = () => setSelected(readForecastSelection()); globalThis.addEventListener(forecastSelectionEvent, refresh); return () => globalThis.removeEventListener(forecastSelectionEvent, refresh) }, [])
  const visible = useMemo(() => results ? results.filter((item) => selected?.includes(item.target.descriptorId)) : [], [results, selected])
  function toggle(id: string) { const base = selected ?? defaultForecastSelection(results ?? []); const next = base.includes(id) ? base.filter((item) => item !== id) : [...base, id]; setSelected(next); saveForecastSelection(next) }
  return <section className="forecast-panel" aria-label="Forecast"><header className="forecast-panel__heading"><p>Tomorrow</p><h2>{forecastDateLabel(forecastDate)}</h2><p>Based on your history so far, here’s what Trace estimates for tomorrow.</p></header>{error ? <p role="alert" className="notice notice--error">{error}</p> : loading ? <p role="status" className="forecast-loading">Preparing tomorrow’s forecast…</p> : <><details className="forecast-targets"><summary>Forecast Trackables <span>{visible.length} shown</span></summary><div>{results!.map((item) => <label key={item.target.descriptorId}><input type="checkbox" checked={Boolean(selected?.includes(item.target.descriptorId))} onChange={() => toggle(item.target.descriptorId)} /><span>{item.target.label}<small>{forecastabilityLabel(item)}</small></span></label>)}</div></details>{visible.length ? <div className="forecast-list">{visible.map((item) => <ForecastCard key={item.target.descriptorId} result={item} />)}</div> : <p className="forecast-empty">{selected?.length === 0 ? 'Choose Trackables to see tomorrow’s estimates.' : 'Trace needs more recorded history before it can make a careful next-day estimate.'}</p>}</>}</section>
}
