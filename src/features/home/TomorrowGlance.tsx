import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TrendsData } from '../../analytics/AnalyticsProvider.ts'
import { forecastSelectionEvent, homeForecastRows, readForecastSelection } from '../../analytics/forecasting/forecastSelection.ts'
import type { ForecastResult } from '../../analytics/forecasting/forecastTypes.ts'
import { analyticsProvider } from '../trends/analyticsProvider.ts'
import { useForecastResults } from '../trends/useForecastResults.ts'
import { iconGlyph } from '../../presets/iconLibrary.ts'
import { effectiveCategoryColor } from '../../themes/categoryColors.ts'
import { ForecastIdentityMark, type ForecastIdentity } from '../trends/ForecastVisualizations.tsx'
import { forecastDisplay } from '../trends/forecastPresentation.ts'

export function TomorrowGlanceContent({ results, selected, loading, error, identities = new Map() }: { results: readonly ForecastResult[] | null; selected: readonly string[]; loading: boolean; error: string; identities?: ReadonlyMap<string, ForecastIdentity> }) {
  const rows = results ? homeForecastRows(results, selected) : []
  return <section className="tomorrow-glance" aria-label="Tomorrow forecast"><div className="tomorrow-glance__heading"><div><p>Tomorrow</p><h2>Your forecast</h2></div><Link className="tomorrow-glance__action" to="/trends?tab=forecast">View <span aria-hidden="true">›</span></Link></div>
    {error ? <p className="tomorrow-glance__state">Forecast unavailable right now.</p> : loading ? <p className="tomorrow-glance__state" role="status">Preparing tomorrow’s forecast…</p> : rows.length ? <ul>{rows.map((result) => { const display = forecastDisplay(result); return <li key={result.target.descriptorId}><ForecastIdentityMark identity={identities.get(result.target.trackableId)} /><strong className="tomorrow-glance__name">{result.target.label}</strong><b className="tomorrow-glance__value">{display.value}</b><span className="tomorrow-glance__probability">{display.probability ?? ''}</span></li> })}</ul> : <p className="tomorrow-glance__state">{selected.length ? 'Those Trackables need more recent history before a forecast is ready.' : 'Choose Trackables in Forecast to see them here.'}</p>}
  </section>
}

function identities(data: TrendsData | null): ReadonlyMap<string, ForecastIdentity> {
  const categories = new Map(data?.categories.map((category) => [category.id, category]))
  return new Map(data?.trackables.map((trackable) => { const category = categories.get(trackable.categoryId); return [trackable.id, { icon: iconGlyph(trackable.icon), accent: effectiveCategoryColor(category ?? { id: trackable.categoryId }), category: category?.name }] }) ?? [])
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
  return <TomorrowGlanceContent results={forecast.results} selected={selected} loading={forecast.loading} error={loadError || forecast.error} identities={identities(data)} />
}
