import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TrendsData } from '../../analytics/AnalyticsProvider.ts'
import { forecastGlanceValue } from '../../analytics/forecasting/forecastPresentation.ts'
import { forecastSelectionEvent, homeForecastRows, readForecastSelection } from '../../analytics/forecasting/forecastSelection.ts'
import type { ForecastResult } from '../../analytics/forecasting/forecastTypes.ts'
import { analyticsProvider } from '../trends/analyticsProvider.ts'
import { useForecastResults } from '../trends/useForecastResults.ts'

export function TomorrowGlanceContent({ results, selected, loading, error }: { results: readonly ForecastResult[] | null; selected: readonly string[]; loading: boolean; error: string }) {
  const rows = results ? homeForecastRows(results, selected) : []
  return <section className="tomorrow-glance" aria-label="Tomorrow forecast"><div className="tomorrow-glance__heading"><div><p>Tomorrow</p><h2>Your forecast</h2></div><Link to="/trends?tab=forecast">View forecast <span aria-hidden="true">→</span></Link></div>
    {error ? <p className="tomorrow-glance__state">Forecast unavailable right now.</p> : loading ? <p className="tomorrow-glance__state" role="status">Preparing tomorrow’s forecast…</p> : rows.length ? <ul>{rows.map((result) => <li key={result.target.descriptorId}><span>{result.target.label}</span><strong>{forecastGlanceValue(result)}</strong></li>)}</ul> : <p className="tomorrow-glance__state">{selected.length ? 'Those Trackables need more recent history before a forecast is ready.' : 'Choose Trackables in Forecast to see them here.'}</p>}
  </section>
}

export function TomorrowGlance() {
  const [data, setData] = useState<TrendsData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<readonly string[]>(() => readForecastSelection() ?? [])
  const forecast = useForecastResults(data, selected)
  useEffect(() => {
    let active = true
    const load = () => void analyticsProvider.loadTrendsData().then((next) => { if (active) { setData(next); setLoadError('') } }).catch(() => { if (active) setLoadError('Forecast data could not be loaded.') })
    load(); globalThis.addEventListener('trace:data-changed', load)
    return () => { active = false; globalThis.removeEventListener('trace:data-changed', load) }
  }, [])
  useEffect(() => { const refresh = () => setSelected(readForecastSelection() ?? []); globalThis.addEventListener(forecastSelectionEvent, refresh); return () => globalThis.removeEventListener(forecastSelectionEvent, refresh) }, [])
  return <TomorrowGlanceContent results={forecast.results} selected={selected} loading={forecast.loading} error={loadError || forecast.error} />
}
