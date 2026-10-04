import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TrendsData } from '../../analytics/AnalyticsProvider.ts'
import { analysisSeriesOptions, buildAnalysisView, hasSupportedAnalysisDefinition, type AnalysisSourceInputType, type AnalysisTrack, type AnalysisTransformation, type AnalysisValue } from '../../analytics/analysisModel.ts'
import { analysisSourceInputLabels, filterAnalysisSeries, groupAnalysisSeries } from '../../analytics/analysisSelector.ts'
import { inputTypeSelectionState, setAllInputTypes, shouldCloseAnalysisDropdown, toggleAnalysisSelection, toggleInputType } from '../../analytics/analysisExploreControls.ts'
import { pivotRecordedValues, recordedValuesDefaultOpen } from '../../analytics/recordedValuesTable.ts'
import { assignVisibleSeriesStyles, seriesVisualStyle, toggleSeriesVisibility } from '../../analytics/seriesPresentation.ts'
import { formatTrendNumber, type TrendRange } from '../../analytics/trendsAnalytics.ts'
import { analyticsProvider } from './analyticsProvider.ts'
import { trendsMappingEditPath } from './trendsNavigation.ts'
import { MainPageHeader } from '../../components/MainPageHeader.tsx'
import { InsightsPanel } from './InsightsPanel.tsx'

const ranges: readonly { value: TrendRange; label: string }[] = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 'all', label: 'All' }]
const transformations: readonly { value: AnalysisTransformation; label: string }[] = [{ value: 'raw', label: 'Raw values' }, { value: 'normalize', label: 'Normalize 0–100' }, { value: 'z-score', label: 'Standardize' }]
const sourceInputTypes = Object.keys(analysisSourceInputLabels) as AnalysisSourceInputType[]

function todayLocal(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateLabel(localDate: string, short = false): string {
  return new Intl.DateTimeFormat(undefined, short ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${localDate}T12:00:00`))
}

function EmptyState({ title, children }: { title: string; children: string }) {
  return <section className="empty-state"><span aria-hidden="true">✦</span><h2>{title}</h2><p>{children}</p></section>
}

function typeLabel(type: AnalysisTrack['descriptor']['measurementType']): string {
  return ({ continuous: 'Numeric', ordinal: 'Ordered scale', binary: 'Yes / No', 'nominal-single': 'Category', 'nominal-multiselect': 'Multiple choice', count: 'Count', duration: 'Duration', time: 'Time', event: 'Occurrence' })[type]
}

function xPosition(localDate: string, dates: readonly string[], left = 64, right = 12, width = 720): number {
  if (dates.length < 2) return (left + width - right) / 2
  const first = Date.parse(`${dates[0]}T00:00:00Z`); const last = Date.parse(`${dates.at(-1)}T00:00:00Z`)
  return left + ((Date.parse(`${localDate}T00:00:00Z`) - first) / Math.max(1, last - first)) * (width - left - right)
}

function SeriesMarker({ x, y, seriesIndex }: { x: number; y: number; seriesIndex: number }) {
  const className = 'analysis-chart__point'
  switch (seriesIndex % 8) {
    case 1: return <rect className={className} x={x - 4.5} y={y - 4.5} width="9" height="9" rx="1"><title /></rect>
    case 2: return <path className={className} d={`M ${x} ${y - 5.5} L ${x + 5.5} ${y} L ${x} ${y + 5.5} L ${x - 5.5} ${y} Z`}><title /></path>
    case 3: return <path className={className} d={`M ${x} ${y - 6} L ${x + 5.5} ${y + 4.5} L ${x - 5.5} ${y + 4.5} Z`}><title /></path>
    case 4: return <path className={className} d={`M ${x - 5} ${y - 5} L ${x + 5} ${y + 5} M ${x + 5} ${y - 5} L ${x - 5} ${y + 5}`}><title /></path>
    case 5: return <path className={className} d={`M ${x - 5} ${y - 3} L ${x} ${y - 6} L ${x + 5} ${y - 3} L ${x + 5} ${y + 3} L ${x} ${y + 6} L ${x - 5} ${y + 3} Z`}><title /></path>
    case 6: return <path className={className} d={`M ${x - 6} ${y} L ${x} ${y - 6} L ${x + 6} ${y} L ${x} ${y + 6} Z`}><title /></path>
    case 7: return <path className={className} d={`M ${x - 5.5} ${y - 2} L ${x - 2} ${y - 5.5} L ${x + 2} ${y - 5.5} L ${x + 5.5} ${y - 2} L ${x + 2} ${y + 5.5} L ${x - 2} ${y + 5.5} Z`}><title /></path>
    default: return <circle className={className} cx={x} cy={y} r="5"><title /></circle>
  }
}

function QuantitativeTrack({ track, dates, seriesIndex = 0, overlay = false, sharedRange }: { track: AnalysisTrack; dates: readonly string[]; seriesIndex?: number; overlay?: boolean; sharedRange?: readonly [number, number] }) {
  const points = track.values.filter((value): value is AnalysisValue & { numericValue: number } => value.numericValue !== undefined)
  if (!points.length) return null
  const width = 720; const height = overlay ? 260 : 210; const left = 64; const right = 12; const top = 18; const bottom = 34
  const rawMin = sharedRange?.[0] ?? Math.min(...points.map((point) => point.numericValue)); const rawMax = sharedRange?.[1] ?? Math.max(...points.map((point) => point.numericValue))
  const pad = rawMin === rawMax ? Math.max(Math.abs(rawMin) * .1, 1) : (rawMax - rawMin) * .08
  const min = rawMin - pad; const max = rawMax + pad
  const y = (value: number) => top + ((max - value) / Math.max(.0001, max - min)) * (height - top - bottom)
  const positioned = points.map((point) => ({ ...point, x: xPosition(point.localDate, dates, left, right, width), y: y(point.numericValue) }))
  const path = positioned.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  return <svg className={`analysis-chart analysis-chart--series-${seriesIndex % 8}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${track.descriptor.name}: ${points.length} values`}>
    <line className="analysis-chart__axis" x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} />
    {!overlay ? <><text className="analysis-chart__label" x={left - 7} y={top + 5} textAnchor="end">{track.descriptor.measurementType === 'ordinal' ? points.find((point) => point.numericValue === rawMax)?.display ?? formatTrendNumber(rawMax) : formatTrendNumber(rawMax)}</text><text className="analysis-chart__label" x={left - 7} y={height - bottom + 5} textAnchor="end">{track.descriptor.measurementType === 'ordinal' ? points.find((point) => point.numericValue === rawMin)?.display ?? formatTrendNumber(rawMin) : formatTrendNumber(rawMin)}</text></> : null}
    {positioned.length > 1 ? <path className="analysis-chart__line" d={path} /> : null}
    {positioned.map((point) => <g key={point.id}><SeriesMarker x={point.x} y={point.y} seriesIndex={seriesIndex} /><title>{dateLabel(point.localDate)}: {point.display}</title></g>)}
    <text className="analysis-chart__date" x={left} y={height - 8}>{dates[0] ? dateLabel(dates[0], true) : ''}</text><text className="analysis-chart__date" x={width - right} y={height - 8} textAnchor="end">{dates.at(-1) ? dateLabel(dates.at(-1)!, true) : ''}</text>
  </svg>
}

function LaneTrack({ track, dates }: { track: AnalysisTrack; dates: readonly string[] }) {
  const lanes = track.descriptor.measurementType === 'event' ? [{ id: 'event', label: 'Occurred', dates: track.values.map((value) => value.localDate), count: track.values.length }] : track.lanes
  const width = 720; const left = 112; const right = 16; const row = 38; const top = 12; const bottom = 34; const height = Math.max(96, top + lanes.length * row + bottom)
  return <svg className="analysis-chart analysis-lane-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${track.descriptor.name}: categorical timeline`}>
    {lanes.map((lane, laneIndex) => { const y = top + laneIndex * row + row / 2; return <g key={lane.id}><text className="analysis-chart__lane-label" x={left - 10} y={y + 5} textAnchor="end">{lane.label}</text><line className="analysis-chart__lane" x1={left} y1={y} x2={width - right} y2={y} />{[...new Set(lane.dates)].map((date) => <circle key={date} className="analysis-chart__occurrence" cx={xPosition(date, dates, left, right, width)} cy={y} r="6"><title>{dateLabel(date)}: {lane.label}</title></circle>)}</g> })}
    <text className="analysis-chart__date" x={left} y={height - 8}>{dates[0] ? dateLabel(dates[0], true) : ''}</text><text className="analysis-chart__date" x={width - right} y={height - 8} textAnchor="end">{dates.at(-1) ? dateLabel(dates.at(-1)!, true) : ''}</text>
  </svg>
}

function TrackSummary({ track }: { track: AnalysisTrack }) {
  const summary = track.summary; const quantitative = summary.average !== undefined
  return <div className="analysis-summary" aria-label={`${track.descriptor.name} summary`}><div><span>Most recent</span><strong>{summary.latest?.display ?? '—'}</strong><small>{summary.latest ? dateLabel(summary.latest.localDate) : 'No value'}</small></div>{quantitative ? <><div><span>Average</span><strong>{formatTrendNumber(summary.average!)}</strong><small>{track.unit ?? 'in range'}</small></div><div><span>Range</span><strong>{formatTrendNumber(summary.min!)}–{formatTrendNumber(summary.max!)}</strong><small>{track.unit ?? 'recorded values'}</small></div></> : <div><span>Most frequent</span><strong>{summary.mostFrequent?.[0]?.label ?? '—'}</strong><small>{summary.mostFrequent?.[0] ? `${summary.mostFrequent[0].count} selections` : 'No values'}</small></div>}<div className="analysis-summary__recorded"><strong>{summary.recordedCount}</strong><span>{track.descriptor.measurementType === 'event' ? 'occurrences' : 'recorded'}</span></div></div>
}

function VisibilityToggle({ name, visible, onToggle }: { name: string; visible: boolean; onToggle: () => void }) {
  return <button className="analysis-visibility-toggle" type="button" aria-pressed={visible} onClick={onToggle}>{visible ? 'Hide' : 'Show'} <span className="sr-only">{name}</span></button>
}

function InputTypeFilter({ selectedTypes, onChange }: { selectedTypes: ReadonlySet<AnalysisSourceInputType>; onChange: (types: ReadonlySet<AnalysisSourceInputType>) => void }) {
  const selectAll = useRef<HTMLInputElement>(null)
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  const selectionState = inputTypeSelectionState(selectedTypes, sourceInputTypes)
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = selectionState === 'some' }, [selectionState])
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => { const node = details.current; if (node && shouldCloseAnalysisDropdown(node.open, { pointerInside: node.contains(event.target as Node) })) node.open = false }
    const closeEscape = (event: KeyboardEvent) => { const node = details.current; if (node && shouldCloseAnalysisDropdown(node.open, { key: event.key })) { node.open = false; summary.current?.focus() } }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape) }
  }, [])
  const label = selectionState === 'all' ? 'All types' : selectionState === 'none' ? 'No types' : `${selectedTypes.size} types`
  return <details ref={details} className="analysis-type-filter"><summary ref={summary}><span>Input types</span><strong>{label}</strong></summary><fieldset><label><input ref={selectAll} type="checkbox" checked={selectionState === 'all'} onChange={(event) => onChange(setAllInputTypes(sourceInputTypes, event.target.checked))} />Select all</label>{sourceInputTypes.map((type) => <label key={type}><input type="checkbox" checked={selectedTypes.has(type)} onChange={() => onChange(toggleInputType(selectedTypes, type))} />{analysisSourceInputLabels[type]}</label>)}</fieldset></details>
}

function compatibilityLabel(track: AnalysisTrack): string {
  return ({ 'fully-compatible': 'Fully compatible', 'partially-mapped': 'Partially mapped', 'unmapped-historical': 'Historical values need mapping', incompatible: 'Some history is incompatible' })[track.compatibilityStatus]
}

function mappingEditPath(track: AnalysisTrack, sourceVersion: number): string {
  return trendsMappingEditPath(track.descriptor.trackableId, sourceVersion)
}

function AnalysisTrackCard({ track, dates, visible, onToggle }: { track: AnalysisTrack; dates: readonly string[]; visible: boolean; onToggle: () => void }) {
  const quantitative = ['continuous', 'ordinal', 'count', 'duration', 'time'].includes(track.descriptor.measurementType)
  const attention = track.mappingOpportunities.find((item) => item.status !== 'fully-compatible')
  return <article className={`analysis-track-card${visible ? '' : ' analysis-track-card--hidden'}`}><header><div><p>{typeLabel(track.descriptor.measurementType)}</p><h2>{track.descriptor.name}</h2>{attention ? <span className={`analysis-compatibility analysis-compatibility--${track.compatibilityStatus}`}>{compatibilityLabel(track)}</span> : null}</div><div className="analysis-track-actions">{attention ? <Link className="analysis-map-button" to={mappingEditPath(track, attention.sourceVersion)}>{attention.status === 'unmapped-historical' && attention.compatibility === 'supported' ? 'Set up mapping' : 'Edit Trackable'}</Link> : null}<VisibilityToggle name={track.descriptor.name} visible={visible} onToggle={onToggle} />{track.warnings.length ? <span className="analysis-warning-count" title="Historical compatibility notes">{track.warnings.length} note{track.warnings.length === 1 ? '' : 's'}</span> : null}</div></header><TrackSummary track={track} />{visible ? track.values.length ? quantitative ? <QuantitativeTrack track={track} dates={dates} /> : <LaneTrack track={track} dates={dates} /> : <p className="analysis-empty-track">No data in this range.</p> : <p className="analysis-hidden-track">Hidden from the visualization. Your selection and recorded values are unchanged.</p>}{track.warnings.length ? <ul className="analysis-warnings">{track.warnings.map((warning, index) => <li key={`${warning.code}:${warning.recordId ?? index}`}>{warning.message}</li>)}</ul> : null}</article>
}

function OverlayCard({ tracks, dates, transformation, hiddenIds, onToggle }: { tracks: readonly AnalysisTrack[]; dates: readonly string[]; transformation: AnalysisTransformation; hiddenIds: ReadonlySet<string>; onToggle: (id: string) => void }) {
  const visibleTracks = tracks.filter((track) => !hiddenIds.has(track.descriptor.id))
  const visibleStyles = assignVisibleSeriesStyles(visibleTracks.map((track) => track.descriptor.id))
  const selectedStyles = assignVisibleSeriesStyles(tracks.map((track) => track.descriptor.id))
  const numericValues = visibleTracks.flatMap((track) => track.values.flatMap((value) => value.numericValue === undefined ? [] : [value.numericValue]))
  const sharedRange: readonly [number, number] | undefined = numericValues.length ? [Math.min(...numericValues), Math.max(...numericValues)] : undefined
  return <article className="analysis-track-card analysis-overlay-card"><header><div><p>{transformation === 'raw' ? 'Comparable values' : transformation === 'normalize' ? 'Normalized · 0–100' : 'Standardized · z-score'}</p><h2>Combined comparison</h2></div></header><ul className="analysis-legend" aria-label="Toggle plotted series">{tracks.map((track) => { const visible = !hiddenIds.has(track.descriptor.id); const style = visibleStyles.get(track.descriptor.id) ?? selectedStyles.get(track.descriptor.id) ?? seriesVisualStyle(0); return <li className={`analysis-legend--series-${style.colorToken - 1}${visible ? '' : ' analysis-legend--hidden'}`} key={track.descriptor.id}><button type="button" aria-pressed={visible} onClick={() => onToggle(track.descriptor.id)}><span aria-hidden="true" />{track.descriptor.name}<small>{visible ? 'Shown' : 'Hidden'}</small></button></li> })}</ul>{visibleTracks.length ? <div className="analysis-overlay-chart">{visibleTracks.map((track) => <QuantitativeTrack key={track.descriptor.id} track={track} dates={dates} seriesIndex={(visibleStyles.get(track.descriptor.id) ?? seriesVisualStyle(0)).colorToken - 1} overlay sharedRange={sharedRange} />)}</div> : <p className="analysis-hidden-track">All plotted series are hidden. Use the legend to show one.</p>}<div className="analysis-overlay-summaries">{tracks.map((track) => { const attention = track.mappingOpportunities.find((item) => item.status !== 'fully-compatible'); return <section className={hiddenIds.has(track.descriptor.id) ? 'analysis-overlay-summary--hidden' : ''} key={track.descriptor.id}><div className="analysis-overlay-summary-heading"><h3>{track.descriptor.name}</h3>{attention ? <Link className="analysis-map-button" to={mappingEditPath(track, attention.sourceVersion)}>Edit Trackable</Link> : null}</div><TrackSummary track={track} /></section> })}</div></article>
}

function RecordedValues({ tracks }: { tracks: readonly AnalysisTrack[] }) {
  const rows = pivotRecordedValues(tracks)
  return <details className="recorded-values" open={recordedValuesDefaultOpen}><summary>Recorded values <span>{rows.length} dates</span></summary><div className="recorded-values__table-wrap"><table><thead><tr><th scope="col">Date</th>{tracks.map((track) => <th scope="col" key={track.descriptor.id}>{track.descriptor.name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.localDate}><th scope="row"><time dateTime={row.localDate}>{dateLabel(row.localDate)}</time></th>{tracks.map((track) => { const originals = track.values.filter((value) => value.localDate === row.localDate && value.rawDisplay).map((value) => value.rawDisplay); return <td key={track.descriptor.id} title={originals.length ? `Originally recorded as: ${originals.join('; ')}` : undefined}>{row.valuesBySeriesId[track.descriptor.id] ?? '—'}{originals.length ? <span className="recorded-values__mapped" aria-label={`Originally recorded as ${originals.join('; ')}`}>Mapped</span> : null}</td> })}</tr>)}</tbody></table></div></details>
}

function ExploreScreen({ handoff }: { handoff: readonly string[] | null }) {
  const [data, setData] = useState<TrendsData | null>(null); const [error, setError] = useState(''); const [selectedIds, setSelectedIds] = useState<readonly string[]>([]); const [query, setQuery] = useState(''); const [categoryId, setCategoryId] = useState('all'); const [selectedInputTypes, setSelectedInputTypes] = useState<ReadonlySet<AnalysisSourceInputType>>(() => new Set(sourceInputTypes)); const [range, setRange] = useState<TrendRange>(30); const [transformation, setTransformation] = useState<AnalysisTransformation>('raw'); const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set()); const hasInitializedSelection = useRef(false)
  useEffect(() => { let active = true; const load = () => void analyticsProvider.loadTrendsData().then((next) => { if (active) { setData(next); setError('') } }).catch(() => { if (active) setError('Trends could not be loaded right now.') }); load(); globalThis.addEventListener('trace:data-changed', load); return () => { active = false; globalThis.removeEventListener('trace:data-changed', load) } }, [])
  const options = useMemo(() => data ? analysisSeriesOptions(data) : [], [data]); useEffect(() => { if (!hasInitializedSelection.current && options[0]) { hasInitializedSelection.current = true; setSelectedIds([options[0].id]) } }, [options]); const effectiveIds = useMemo(() => { const availableIds = new Set(options.map((option) => option.id)); return selectedIds.filter((id) => availableIds.has(id)) }, [options, selectedIds]); const selectionKey = effectiveIds.join('|'); useEffect(() => setHiddenIds(new Set()), [selectionKey])
  useEffect(() => { if (!handoff || !options.length) return; const available = new Set(options.map((option) => option.id)); const next = handoff.filter((id) => available.has(id)); setSelectedIds(next); hasInitializedSelection.current = true }, [handoff, options])
  const filteredGroups = useMemo(() => groupAnalysisSeries(filterAnalysisSeries(options, { query, categoryId, inputTypes: selectedInputTypes })), [options, query, categoryId, selectedInputTypes]); const categories = useMemo(() => [...new Map(options.map((option) => [option.categoryId, option.categoryName])).entries()].sort((left, right) => left[1].localeCompare(right[1])), [options]); const filtersActive = Boolean(query.trim() || categoryId !== 'all' || inputTypeSelectionState(selectedInputTypes, sourceInputTypes) !== 'all')
  const view = useMemo(() => data ? buildAnalysisView(data, effectiveIds, range, todayLocal(), transformation) : null, [data, effectiveIds, range, transformation]); const canTransform = Boolean(view && view.tracks.length > 1 && view.tracks.every((track) => ['continuous', 'ordinal', 'count', 'duration'].includes(track.descriptor.measurementType)))
  function toggle(id: string) { setSelectedIds((current) => toggleAnalysisSelection(current, id)) }
  function toggleVisibility(id: string) { setHiddenIds((current) => toggleSeriesVisibility(current, id)) }
  function clearFilters() { setQuery(''); setCategoryId('all'); setSelectedInputTypes(new Set(sourceInputTypes)) }
  return <section className="trends-explore">{error ? <p className="notice notice--error" role="alert">{error}</p> : null}{!data && !error ? <p className="trackables-loading">Loading your trends…</p> : null}{data && options.length === 0 && hasSupportedAnalysisDefinition(data) ? <EmptyState title="No recorded data yet">Record a value and it’ll appear here.</EmptyState> : null}{data && options.length === 0 && !hasSupportedAnalysisDefinition(data) ? <EmptyState title="No supported Trackables">Add or activate a numeric, scale, duration, time, boolean, choice, or occurrence Trackable first.</EmptyState> : null}
    {data && options.length ? <><section className="analysis-composer" aria-labelledby="analysis-composer-title"><div className="analysis-composer__heading"><div><p>Explore</p><h2 id="analysis-composer-title">Choose Trackables</h2></div><span>{effectiveIds.length} selected</span></div><div className="analysis-selected" aria-label="Selected Trackables">{effectiveIds.map((id) => { const option = options.find((item) => item.id === id); return option ? <button type="button" key={id} onClick={() => toggle(id)} aria-label={`Remove ${option.name}`}>{option.name}<span aria-hidden="true">×</span></button> : null })}</div><label className="analysis-search"><span>Search available Trackables</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Trackables and fields" /></label><div className="analysis-selector-filters"><label>Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="all">All categories</option>{categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><InputTypeFilter selectedTypes={selectedInputTypes} onChange={setSelectedInputTypes} />{filtersActive ? <button type="button" className="analysis-clear-filters" onClick={clearFilters}>Clear filters</button> : null}</div><div className="analysis-option-groups">{filteredGroups.map((group) => <section key={group.categoryId} className="analysis-option-group" aria-labelledby={`category-${group.categoryId}`}><h3 id={`category-${group.categoryId}`}>{group.categoryName}<span>{group.items.length}</span></h3><div className="analysis-option-list">{group.items.map((option) => <button type="button" key={option.id} aria-pressed={effectiveIds.includes(option.id)} onClick={() => toggle(option.id)}><span className="analysis-option-check" aria-hidden="true">{effectiveIds.includes(option.id) ? '✓' : '+'}</span><span><strong>{option.name}</strong><small>{analysisSourceInputLabels[option.sourceInputType]} · {option.recordedCount} recorded</small></span></button>)}</div></section>)}</div>{!filteredGroups.length ? <div className="analysis-no-results"><p>No Trackables match these filters.</p><button type="button" onClick={clearFilters}>Clear filters</button></div> : null}</section>
      <section className="analysis-controls" aria-label="Analysis controls"><fieldset><legend>Date range</legend><div className="segmented segmented--small">{ranges.map((item) => <button key={String(item.value)} type="button" aria-pressed={range === item.value} onClick={() => setRange(item.value)}>{item.label}</button>)}</div></fieldset>{canTransform ? <fieldset><legend>Comparison</legend><div className="segmented segmented--small">{transformations.map((item) => <button key={item.value} type="button" aria-pressed={transformation === item.value} onClick={() => setTransformation(item.value)}>{item.label}</button>)}</div></fieldset> : null}</section>
      {view && view.tracks.length ? <><section className="analysis-view" data-layout={view.layout} aria-label="Selected data visualization">{view.layout === 'overlay' ? <OverlayCard tracks={view.tracks} dates={view.dates} transformation={transformation} hiddenIds={hiddenIds} onToggle={toggleVisibility} /> : view.tracks.map((track) => <AnalysisTrackCard key={track.descriptor.id} track={track} dates={view.dates} visible={!hiddenIds.has(track.descriptor.id)} onToggle={() => toggleVisibility(track.descriptor.id)} />)}</section><RecordedValues tracks={view.tracks} /></> : <EmptyState title="Select Trackables">Select Trackables to explore your data.</EmptyState>}</> : null}
  </section>
}

export function TrendsScreen() {
  const [tab, setTab] = useState<'explore' | 'insights'>('explore')
  const [visitedInsights, setVisitedInsights] = useState(false)
  const [insightsData, setInsightsData] = useState<TrendsData | null>(null)
  const [handoff, setHandoff] = useState<readonly string[] | null>(null)
  useEffect(() => {
    if (!visitedInsights) return
    let active = true
    const load = () => void analyticsProvider.loadTrendsData().then((data) => { if (active) setInsightsData(data) })
    load(); globalThis.addEventListener('trace:data-changed', load)
    return () => { active = false; globalThis.removeEventListener('trace:data-changed', load) }
  }, [visitedInsights])
  function explore(target: string, source?: string) { setHandoff([target, ...(source && source !== target ? [source] : [])]); setTab('explore') }
  return <section className="screen main-page-screen trends-screen"><MainPageHeader eyebrow="Patterns" title="Trends" subtitle="Explore your records and review patterns worth noticing." /><nav className="analysis-tabs" aria-label="Trends sections"><button type="button" aria-current={tab === 'explore' ? 'page' : undefined} onClick={() => setTab('explore')}>Explore</button><button type="button" aria-current={tab === 'insights' ? 'page' : undefined} onClick={() => { setVisitedInsights(true); setTab('insights') }}>Insights</button></nav><div hidden={tab !== 'explore'}><ExploreScreen handoff={handoff} /></div>{visitedInsights ? <div hidden={tab !== 'insights'}><InsightsPanel data={insightsData} onExplore={explore} /></div> : null}</section>
}
