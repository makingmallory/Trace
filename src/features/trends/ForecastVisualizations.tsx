import type { CSSProperties } from 'react'
import type { ForecastWeekResult, HorizonForecastResult } from '../../analytics/forecasting/forecastTypes.ts'
import { ChartTooltip } from './ChartTooltip.tsx'
import { useChartTooltip } from './chartTooltipInteraction.ts'

export interface ForecastIdentity { icon?: string; accent?: string; category?: string }

const shortDate = (date: string) => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(`${date}T12:00:00`))
const fullDate = (date: string) => new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`))
const percent = (value: number) => `${Math.round(value * 100)}%`
const compact = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1)
const scale = (value: number, low: number, high: number, top: number, height: number) => top + height - ((value - low) / Math.max(.0001, high - low)) * height
const points = (values: readonly (number | null)[], low: number, high: number, width = 312, left = 18, top = 12, height = 84) => values.map((value, index) => value === null ? null : { x: left + index * ((width - left * 2) / 6), y: scale(value, low, high, top, height) })
const valueFor = (day: HorizonForecastResult): number | null => day.prediction?.kind === 'numeric' || day.prediction?.kind === 'ordinal' ? day.prediction.estimate : null

function DateAxis({ days, y = 122 }: { days: readonly HorizonForecastResult[]; y?: number }) {
  return <>{days.map((day, index) => <text className="forecast-chart__date" key={day.forecastDate} x={18 + index * 46} y={y} textAnchor="middle">{shortDate(day.forecastDate)}</text>)}</>
}

function NumericWeekChart({ week }: { week: ForecastWeekResult }) {
  const chart = useChartTooltip()
  const values = week.days.map(valueFor); const ranged = week.days.filter((day) => (day.prediction?.kind === 'numeric' || day.prediction?.kind === 'ordinal') && !day.diagnostics.uninformativeRange)
  const all = ranged.flatMap((day) => day.prediction?.kind === 'numeric' || day.prediction?.kind === 'ordinal' ? [day.prediction.likelyLow, day.prediction.likelyHigh] : []).concat(values.filter((value): value is number => value !== null))
  const targetLow = week.target.minimum; const targetHigh = week.target.maximum
  const low = targetLow ?? Math.min(...all, 0); const high = targetHigh ?? Math.max(...all, low + 1)
  const plot = points(values, low, high); const path = plot.reduce<string[]>((result, point, index) => point ? [...result, `${index && plot[index - 1] ? 'L' : 'M'}${point.x},${point.y}`] : result, []).join(' ')
  const label = `${week.target.label}: ${week.summary}. ${week.confidenceSummary}`
  return <div ref={chart.rootRef} className="chart-tooltip-region"><svg className="forecast-chart forecast-chart--numeric" viewBox="0 0 312 136" role="img" aria-label={label} onClick={chart.dismiss}><line className="forecast-chart__axis" x1="18" x2="294" y1="96" y2="96" />
    {ranged.map((day, index) => { const prediction = day.prediction; if (!prediction || (prediction.kind !== 'numeric' && prediction.kind !== 'ordinal') || day.diagnostics.uninformativeRange) return null; const x = 18 + index * 46; return <line className="forecast-chart__range" key={day.forecastDate} x1={x} x2={x} y1={scale(prediction.likelyLow, low, high, 12, 84)} y2={scale(prediction.likelyHigh, low, high, 12, 84)} /> })}
    {path ? <path className="forecast-chart__line" d={path} /> : null}{plot.map((point, index) => { const day = week.days[index]; const prediction = day.prediction; if (!point || !prediction || (prediction.kind !== 'numeric' && prediction.kind !== 'ordinal')) return null; const estimate = prediction.kind === 'ordinal' ? week.target.options?.[Math.round(prediction.estimate)]?.label ?? compact(prediction.estimate) : compact(prediction.estimate); const lines = [`${week.target.label}: ${estimate}`]; if (!day.diagnostics.uninformativeRange) lines.push(`Likely range: ${compact(prediction.likelyLow)}–${compact(prediction.likelyHigh)}`); lines.push(`Confidence: ${day.confidence ?? 'low'}`); const content = { id: day.forecastDate, title: fullDate(day.forecastDate), lines, x: point.x / 312 * 100, y: point.y / 136 * 100 }; return <g key={day.forecastDate}><circle className="chart-tooltip-hit" cx={point.x} cy={point.y} r="13" {...chart.markerProps(content)} /><circle className="forecast-chart__point" cx={point.x} cy={point.y} r="4" /></g> })}
    {targetLow !== undefined && targetHigh !== undefined ? <><text className="forecast-chart__bound" x="2" y="18">{targetHigh}</text><text className="forecast-chart__bound" x="2" y="96">{targetLow}</text></> : null}<DateAxis days={week.days} />
  </svg><ChartTooltip tooltip={chart.tooltip} /></div>
}

function BinaryWeekChart({ week }: { week: ForecastWeekResult }) {
  const chart = useChartTooltip()
  const values = week.days.map((day) => day.prediction?.kind === 'binary' ? day.prediction.probability : null); const plot = points(values, 0, 1)
  const path = plot.reduce<string[]>((result, point, index) => point ? [...result, `${index && plot[index - 1] ? 'L' : 'M'}${point.x},${point.y}`] : result, []).join(' ')
  return <div ref={chart.rootRef} className="chart-tooltip-region"><svg className="forecast-chart forecast-chart--binary" viewBox="0 0 312 136" role="img" aria-label={`${week.target.label}: ${week.summary}. ${week.confidenceSummary}`} onClick={chart.dismiss}><line className="forecast-chart__axis" x1="18" x2="294" y1="96" y2="96" /><line className="forecast-chart__guide" x1="18" x2="294" y1="54" y2="54" />{path ? <path className="forecast-chart__line" d={path} /> : null}{plot.map((point, index) => { const day = week.days[index]; const prediction = day.prediction; if (!point || !prediction || prediction.kind !== 'binary') return null; const yes = prediction.probability >= .5; const content = { id: day.forecastDate, title: fullDate(day.forecastDate), lines: [`${week.target.label}: ${yes ? 'Yes' : 'No'}`, `Probability: ${percent(yes ? prediction.probability : 1 - prediction.probability)}`], x: point.x / 312 * 100, y: point.y / 136 * 100 }; return <g key={day.forecastDate}><circle className="chart-tooltip-hit" cx={point.x} cy={point.y} r="13" {...chart.markerProps(content)} /><circle className="forecast-chart__point" cx={point.x} cy={point.y} r="4" /></g> })}<text className="forecast-chart__bound" x="0" y="17">100%</text><text className="forecast-chart__bound" x="3" y="57">50%</text><DateAxis days={week.days} /></svg><ChartTooltip tooltip={chart.tooltip} /></div>
}

function NominalWeekTimeline({ week }: { week: ForecastWeekResult }) {
  const chart = useChartTooltip()
  return <div ref={chart.rootRef} className="chart-tooltip-region"><ol className="forecast-category-timeline" aria-label={`${week.target.label}: ${week.summary}`} onClick={chart.dismiss}>{week.days.map((day, index) => { const top = day.prediction?.kind === 'nominal' ? day.prediction.probabilities[0] : undefined; const content = { id: day.forecastDate, title: fullDate(day.forecastDate), lines: [`${week.target.label}: ${top?.label ?? 'No estimate'}`, top ? `Probability: ${percent(top.probability)}` : 'More history needed'], x: (index + .5) / 7 * 100, y: 50 }; return <li key={day.forecastDate} data-state={day.horizonState}><button type="button" {...chart.markerProps(content)}><time dateTime={day.forecastDate}>{shortDate(day.forecastDate)}</time><strong>{top?.label ?? '—'}</strong><small>{top ? percent(top.probability) : 'More history needed'}</small></button></li> })}</ol><ChartTooltip tooltip={chart.tooltip} /></div>
}

function MultiSelectWeekTrends({ week }: { week: ForecastWeekResult }) {
  const chart = useChartTooltip()
  const options = new Map<string, { label: string; values: (number | null)[] }>()
  for (const day of week.days) for (const item of day.prediction?.kind === 'multiselect' ? day.prediction.probabilities : []) { const entry = options.get(item.id) ?? { label: item.label, values: Array(week.days.length).fill(null) }; entry.values[week.days.indexOf(day)] = item.probability; options.set(item.id, entry) }
  const total = (values: readonly (number | null)[]) => values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
  const strongest = [...options.values()].sort((a, b) => total(b.values) - total(a.values)).slice(0, 3)
  return <div ref={chart.rootRef} className="forecast-multi-chart chart-tooltip-region" role="img" aria-label={`${week.target.label}: independent probabilities for likely options. ${week.summary}`}>{strongest.map((option) => { const plot = points(option.values, 0, 1, 230, 4, 4, 20); const path = plot.reduce<string[]>((result, point, index, all) => point ? [...result, `${index && all[index - 1] ? 'L' : 'M'}${point.x},${point.y}`] : result, []).join(' '); return <div key={option.label}><span>{option.label}</span><svg viewBox="0 0 230 34" aria-label={`${option.label} probability by date`} onClick={chart.dismiss}><path className="forecast-chart__line" d={path} />{plot.map((point, index) => { const value = option.values[index]; if (!point || value === null) return null; const content = { id: `${option.label}-${week.days[index].forecastDate}`, title: fullDate(week.days[index].forecastDate), lines: [`${option.label}: ${percent(value)}`], x: point.x / 230 * 100, y: 30 }; return <g key={index}><circle className="chart-tooltip-hit" cx={point.x} cy={point.y} r="10" {...chart.markerProps(content)} /><circle className="forecast-chart__point" cx={point.x} cy={point.y} r="2.8" /></g> })}</svg><strong>{percent(option.values.find((value) => value !== null) ?? 0)}</strong></div> })}<div className="forecast-multi-chart__axis">{week.days.map((day) => <span key={day.forecastDate}>{shortDate(day.forecastDate)}</span>)}</div><ChartTooltip tooltip={chart.tooltip} /></div>
}

export function ForecastWeekVisualization({ week }: { week: ForecastWeekResult }) {
  const first = week.days.find((day) => day.prediction)?.prediction
  if (!first) return null
  if (first.kind === 'numeric' || first.kind === 'ordinal') return <NumericWeekChart week={week} />
  if (first.kind === 'binary') return <BinaryWeekChart week={week} />
  if (first.kind === 'nominal') return <NominalWeekTimeline week={week} />
  return <MultiSelectWeekTrends week={week} />
}

export function ForecastIdentityMark({ identity }: { identity?: ForecastIdentity }) {
  return <span className="forecast-identity" style={identity?.accent ? { '--forecast-accent': identity.accent } as CSSProperties : undefined} aria-hidden="true">{identity?.icon ?? '✦'}</span>
}
