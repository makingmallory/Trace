import { useState } from 'react'
import type { AnalysisMappingDraft, AnalyticsProvider } from '../analytics/AnalyticsProvider.ts'
import type { AnalysisMappingOpportunity } from '../analytics/analysisModel.ts'

function measurementLabel(type: AnalysisMappingOpportunity['targetMeasurementType'] | AnalysisMappingOpportunity['sourceMeasurementType']): string {
  return type ? ({ continuous: 'Number', ordinal: 'Ordered categories', binary: 'Yes / No', 'nominal-single': 'Categories', 'nominal-multiselect': 'Multiple choice', count: 'Count', duration: 'Duration', time: 'Time', event: 'Occurrence' })[type] : 'Unsupported format'
}

export function AnalysisMappingEditor({ opportunity, provider, onClose, onSaved = onClose, onRemoved = onClose }: { opportunity: AnalysisMappingOpportunity; provider: AnalyticsProvider; onClose: () => void; onSaved?: () => void; onRemoved?: () => void }) {
  const existing = opportunity.mapping
  const [assignments, setAssignments] = useState<Record<string, string>>(() => Object.fromEntries(existing?.valueMappings.map((entry) => [entry.sourceValue, entry.mappedValue]) ?? []))
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const targetMeasurementType = existing?.targetMeasurementType ?? (opportunity.targetRawMeasurementType === 'ordinal' ? 'ordinal' : 'nominal-single')
  const order = existing?.ordinalOrder ?? opportunity.ordinalOrder ?? opportunity.targetValues.map((item) => item.value)
  async function save() {
    setSaving(true); setMessage('')
    const valueMappings = opportunity.sourceValues.flatMap((source) => { const mappedValue = assignments[source.value]; const target = opportunity.targetValues.find((item) => item.value === mappedValue); return mappedValue && target ? [{ sourceValue: source.value, mappedValue, label: target.label }] : [] })
    const draft: AnalysisMappingDraft = { trackableId: opportunity.trackableId, sourceTrackableVersion: opportunity.sourceVersion, targetTrackableVersion: opportunity.targetVersion, targetMeasurementType, valueMappings, ...(targetMeasurementType === 'ordinal' ? { ordinalOrder: order } : {}) }
    try { await provider.saveAnalysisMapping(draft); onSaved() } catch (error) { setMessage(error instanceof Error ? error.message : 'Mapping could not be saved.'); setSaving(false) }
  }
  async function remove() {
    if (!existing) return
    setSaving(true); setMessage('')
    try { await provider.removeAnalysisMapping(existing.id); onRemoved() } catch { setMessage('Mapping could not be removed.'); setSaving(false) }
  }
  return <section className="analysis-mapping-editor" aria-labelledby="analysis-mapping-title"><header><div><p>Historical mapping</p><h2 id="analysis-mapping-title">Match older values</h2></div></header><p>Match older values to the current format. Original records will not be changed.</p><dl className="analysis-mapping-formats"><div><dt>Old format</dt><dd>{measurementLabel(opportunity.sourceMeasurementType)}</dd></div><div><dt>Current format</dt><dd>{measurementLabel(targetMeasurementType)}</dd></div><div><dt>Coverage</dt><dd>{opportunity.coverage.mapped} of {opportunity.coverage.total} mapped</dd></div></dl><div className="analysis-mapping-grid"><div className="analysis-mapping-grid__heading">Old value</div><div className="analysis-mapping-grid__heading">Map to</div>{opportunity.sourceValues.map((source) => <div className="analysis-mapping-row" key={source.value}><label htmlFor={`mapping-${encodeURIComponent(source.value)}`}><strong>{source.label}</strong><small>{source.observedCount} recorded</small></label><select id={`mapping-${encodeURIComponent(source.value)}`} value={assignments[source.value] ?? ''} onChange={(event) => setAssignments((current) => ({ ...current, [source.value]: event.target.value }))}><option value="">Leave unmapped</option>{opportunity.targetValues.map((target) => <option value={target.value} key={target.value}>{target.label}</option>)}</select></div>)}</div>{message ? <p className="notice notice--error" role="alert">{message}</p> : null}<footer>{existing ? <button type="button" className="danger-button" disabled={saving} onClick={() => void remove()}>Remove mapping</button> : <span />}<div><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={saving} onClick={() => void save()}>{existing ? 'Save changes' : 'Save mapping'}</button></div></footer></section>
}
