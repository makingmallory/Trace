import { useCallback, useEffect, useRef, useState } from 'react'
import type { TrendsData } from '../../analytics/AnalyticsProvider.ts'
import { analysisMappingOpportunitiesForTrackable, type AnalysisMappingOpportunity } from '../../analytics/analysisModel.ts'
import { AnalysisMappingEditor } from '../../components/AnalysisMappingEditor.tsx'
import type { TrackableDetails } from '../../domain/trackables/TrackableEngine.ts'
import { analyticsProvider } from '../trends/analyticsProvider.ts'

function typeLabel(type: AnalysisMappingOpportunity['sourceMeasurementType']): string {
  return type ? ({ continuous: 'Number', ordinal: 'Ordered categories', binary: 'Yes / No', 'nominal-single': 'Categories', 'nominal-multiselect': 'Multiple choice', count: 'Count', duration: 'Duration', time: 'Time', event: 'Occurrence' })[type] : 'Unsupported format'
}

function statusLabel(opportunity: AnalysisMappingOpportunity): string {
  if (opportunity.status === 'fully-compatible') return opportunity.mapping ? 'Fully mapped' : 'Compatible without mapping'
  if (opportunity.status === 'partially-mapped') return `${opportunity.coverage.mapped} of ${opportunity.coverage.total} historical values mapped`
  if (opportunity.status === 'unmapped-historical') return 'Needs mapping'
  return 'Not mappable'
}

export function TrackableAnalysisHistory({ details, autoOpenSourceVersion }: { details: TrackableDetails; autoOpenSourceVersion?: number }) {
  const [data, setData] = useState<TrendsData | null>(null)
  const [opportunities, setOpportunities] = useState<readonly AnalysisMappingOpportunity[]>([])
  const [selected, setSelected] = useState<AnalysisMappingOpportunity | null>(null)
  const [open, setOpen] = useState(Boolean(autoOpenSourceVersion))
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const load = useCallback(async () => {
    setError('')
    try {
      const next = await analyticsProvider.loadTrendsData()
      const items = analysisMappingOpportunitiesForTrackable(next, details.trackable.id)
      setData(next); setOpportunities(items)
      const requested = autoOpenSourceVersion === undefined ? null : items.find((item) => item.sourceVersion === autoOpenSourceVersion && item.compatibility === 'supported') ?? null
      if (requested) { setOpen(true); setSelected(requested) }
      if (items.some((item) => item.status !== 'fully-compatible')) setOpen(true)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Historical mappings could not be loaded.') }
  }, [autoOpenSourceVersion, details.trackable.id])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (autoOpenSourceVersion !== undefined && open) { heading.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); heading.current?.focus({ preventScroll: true }) } }, [autoOpenSourceVersion, open])
  const needsAttention = opportunities.some((item) => item.status === 'unmapped-historical' || item.status === 'partially-mapped')
  async function mappingChanged() { setSelected(null); await load() }

  return <details className={`trackable-history-disclosure${needsAttention ? ' needs-attention' : ''}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary><span><small>Compatibility</small><strong ref={heading} tabIndex={-1}>Historical mappings</strong></span>{needsAttention ? <em>Needs attention</em> : opportunities.length ? <em>{opportunities.length} transition{opportunities.length === 1 ? '' : 's'}</em> : <em>Up to date</em>}</summary><div className="analysis-history-body"><p>Review how older answers compare with the current Trackable definition.</p>{error ? <div className="notice notice--error" role="alert">{error}<button type="button" className="text-button" onClick={() => void load()}>Retry</button></div> : null}{!error && !data ? <p className="save-status">Loading history…</p> : null}{data && opportunities.length === 0 ? <p className="analysis-history-empty">No historical transitions need configuration.</p> : null}<div className="analysis-history-list">{opportunities.map((opportunity) => <section className={`analysis-history-transition analysis-history-transition--${opportunity.status}`} key={opportunity.sourceVersion}><button type="button" className="analysis-history-transition__summary" aria-expanded={selected?.sourceVersion === opportunity.sourceVersion} onClick={() => opportunity.compatibility === 'supported' ? setSelected((current) => current?.sourceVersion === opportunity.sourceVersion ? null : opportunity) : undefined}><span><small>Previous → current</small><strong>{typeLabel(opportunity.sourceMeasurementType)} → {typeLabel(opportunity.targetMeasurementType)}</strong></span><span><small>Status</small><strong>{statusLabel(opportunity)}</strong></span>{opportunity.compatibility === 'supported' ? <b>{opportunity.mapping ? 'Edit mapping' : 'Set up mapping'}</b> : <b>Kept separate</b>}</button>{selected?.sourceVersion === opportunity.sourceVersion ? <AnalysisMappingEditor key={`${opportunity.sourceVersion}:${opportunity.mapping?.revision ?? 0}`} opportunity={opportunity} provider={analyticsProvider} onClose={() => setSelected(null)} onSaved={() => void mappingChanged()} onRemoved={() => void mappingChanged()} /> : null}</section>)}</div></div></details>
}
