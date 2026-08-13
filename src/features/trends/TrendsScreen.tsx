import { useEffect, useMemo, useState } from 'react'
import type { TrendsData } from '../../analytics/AnalyticsProvider.ts'
import {
  buildTrendSummary,
  formatTrendNumber,
  hasCompatibleActiveTrackable,
  trendMetricOptions,
  type NumericTrendSummary,
  type TrendRange,
} from '../../analytics/trendsAnalytics.ts'
import { analyticsProvider } from './analyticsProvider.ts'

const ranges: readonly { value: TrendRange; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 'all', label: 'All' },
]

function todayLocal(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateLabel(localDate: string, short = false): string {
  return new Intl.DateTimeFormat(undefined, short ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${localDate}T12:00:00`))
}

function NumericChart({ summary }: { summary: NumericTrendSummary }) {
  const width = 680; const height = 260; const left = 48; const right = 18; const top = 18; const bottom = 38
  const values = summary.points.map((point) => point.value)
  const rawMin = Math.min(...values); const rawMax = Math.max(...values)
  const padding = rawMin === rawMax ? Math.max(Math.abs(rawMin) * 0.1, 1) : (rawMax - rawMin) * 0.08
  const min = rawMin - padding; const max = rawMax + padding
  const dates = summary.points.map((point) => Date.parse(`${point.localDate}T00:00:00Z`))
  const dateMin = Math.min(...dates); const dateMax = Math.max(...dates)
  const x = (date: number, index: number) => dateMin === dateMax ? left + ((width - left - right) * (summary.points.length === 1 ? 0.5 : index / (summary.points.length - 1))) : left + ((date - dateMin) / (dateMax - dateMin)) * (width - left - right)
  const y = (value: number) => top + ((max - value) / (max - min)) * (height - top - bottom)
  const positions = summary.points.map((point, index) => ({ ...point, x: x(dates[index], index), y: y(point.value) }))
  const path = positions.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')

  return (
    <figure className="trend-chart-card" aria-labelledby="trend-chart-title">
      <figcaption id="trend-chart-title">{summary.name} over time</figcaption>
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${summary.points.length} recorded values from ${dateLabel(summary.points[0].localDate)} to ${dateLabel(summary.points.at(-1)!.localDate)}`}>
        <line className="trend-chart__axis" x1={left} y1={top} x2={left} y2={height - bottom} />
        <line className="trend-chart__axis" x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} />
        <text className="trend-chart__label" x={left - 8} y={top + 4} textAnchor="end">{formatTrendNumber(rawMax)}</text>
        <text className="trend-chart__label" x={left - 8} y={height - bottom + 4} textAnchor="end">{formatTrendNumber(rawMin)}</text>
        <text className="trend-chart__label" x={left} y={height - 10}>{dateLabel(summary.points[0].localDate, true)}</text>
        <text className="trend-chart__label" x={width - right} y={height - 10} textAnchor="end">{dateLabel(summary.points.at(-1)!.localDate, true)}</text>
        {positions.length > 1 ? <path className="trend-chart__line" d={path} /> : null}
        {positions.map((point) => <circle key={point.observationId} className="trend-chart__point" cx={point.x} cy={point.y} r="5"><title>{dateLabel(point.localDate)}: {point.display}</title></circle>)}
      </svg>
      <details className="trend-data-details">
        <summary>View recorded values</summary>
        <ol>{summary.points.map((point) => <li key={point.observationId}><time dateTime={point.localDate}>{dateLabel(point.localDate)}</time><strong>{point.display}</strong></li>)}</ol>
      </details>
    </figure>
  )
}

function EmptyState({ title, children }: { title: string; children: string }) {
  return <section className="empty-state"><span aria-hidden="true">✦</span><h2>{title}</h2><p>{children}</p></section>
}

export function TrendsScreen() {
  const [data, setData] = useState<TrendsData | null>(null)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [range, setRange] = useState<TrendRange>(30)

  useEffect(() => {
    let active = true
    const load = () => void analyticsProvider.loadTrendsData().then((next) => { if (active) { setData(next); setError('') } }).catch(() => { if (active) setError('Trends could not be loaded right now.') })
    load()
    globalThis.addEventListener('trace:data-changed', load)
    return () => { active = false; globalThis.removeEventListener('trace:data-changed', load) }
  }, [])

  const options = useMemo(() => data ? trendMetricOptions(data) : [], [data])
  const activeId = options.some((option) => option.trackableId === selectedId) ? selectedId : options[0]?.trackableId ?? ''
  const summary = useMemo(() => data && activeId ? buildTrendSummary(data, activeId, range, todayLocal()) : null, [data, activeId, range])

  return (
    <section className="screen trends-screen">
      <header className="screen__heading">
        <p className="eyebrow">Patterns</p>
        <h1>Trends</h1>
        <p className="screen__description">A simple look at what you’ve recorded.</p>
      </header>

      {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
      {!data && !error ? <p className="trackables-loading">Loading your trends…</p> : null}
      {data && options.length === 0 && hasCompatibleActiveTrackable(data) ? <EmptyState title="No recorded data yet">Record a value and it’ll appear here.</EmptyState> : null}
      {data && options.length === 0 && !hasCompatibleActiveTrackable(data) ? <EmptyState title="No supported Trackables">Add or activate a numeric, scale, duration, boolean, or choice Trackable first.</EmptyState> : null}

      {data && options.length > 0 ? <>
        <section className="trend-controls" aria-label="Trend controls">
          <label htmlFor="trend-metric">Trackable</label>
          <select id="trend-metric" value={activeId} onChange={(event) => setSelectedId(event.target.value)}>
            {options.map((option) => <option key={option.trackableId} value={option.trackableId}>{option.name}</option>)}
          </select>
          <div className="segmented segmented--small" aria-label="Date range">
            {ranges.map((item) => <button key={String(item.value)} type="button" aria-pressed={range === item.value} onClick={() => setRange(item.value)}>{item.label}</button>)}
          </div>
        </section>

        {summary?.kind === 'numeric' && summary.points.length > 0 ? <>
          <section className="trend-stat-grid" aria-label={`${summary.name} summary`}>
            <article><span>Most recent</span><strong>{summary.latest?.display}</strong><small>{summary.latest ? dateLabel(summary.latest.localDate) : ''}</small></article>
            <article><span>Recorded</span><strong>{summary.count}</strong><small>{summary.unit === 'entries' ? 'entries' : 'observations'}</small></article>
            <article><span>Average</span><strong>{summary.average === null ? '—' : `${formatTrendNumber(summary.average)}${summary.unit ? ` ${summary.unit}` : ''}`}</strong><small>in this range</small></article>
            <article><span>Range</span><strong>{summary.min === null ? '—' : `${formatTrendNumber(summary.min)}–${formatTrendNumber(summary.max!)}`}</strong><small>{summary.unit ?? 'recorded values'}</small></article>
          </section>
          <NumericChart summary={summary} />
          {summary.points.length < 2 ? <p className="trend-hint">Add another observation to see a line.</p> : null}
        </> : null}

        {summary?.kind === 'categorical' && summary.entries.length > 0 ? <section className="categorical-trend">
          <div className="trend-stat-grid trend-stat-grid--categorical">
            <article><span>Recorded</span><strong>{summary.entries.length}</strong><small>observations</small></article>
            <article><span>Most common</span><strong>{summary.mostCommon?.value ?? '—'}</strong><small>{summary.mostCommon ? `${summary.mostCommon.count} times` : ''}</small></article>
          </div>
          <article className="trend-list-card"><h2>Counts</h2><ul>{summary.counts.map((item) => <li key={item.value}><span>{item.value}</span><strong>{item.count}</strong></li>)}</ul></article>
          <article className="trend-list-card"><h2>Recent values</h2><ol>{[...summary.entries].reverse().slice(0, 8).map((entry) => <li key={entry.observationId}><time dateTime={entry.localDate}>{dateLabel(entry.localDate)}</time><strong>{entry.display}</strong></li>)}</ol></article>
        </section> : null}

        {summary && ((summary.kind === 'numeric' && summary.points.length === 0) || (summary.kind === 'categorical' && summary.entries.length === 0)) ? <EmptyState title="No data in this range">Try a wider date range or record another value.</EmptyState> : null}
      </> : null}
    </section>
  )
}
