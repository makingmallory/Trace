import type { ForecastResult } from './forecastTypes.ts'

export function forecastDateLabel(date: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

const percent = (value: number): string => `${Math.round(value * 100)}%`
const number = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(1)
export function forecastabilityLabel(result: ForecastResult): 'Ready' | 'Rough estimate' | 'More history needed' {
  if (result.status !== 'ready') return 'More history needed'
  return result.diagnostics.capability === 'basic' || result.confidence === 'low' ? 'Rough estimate' : 'Ready'
}

export function forecastGlanceValue(result: ForecastResult): string {
  const prediction = result.prediction
  if (result.status !== 'ready' || !prediction) return 'More history needed'
  if (prediction.kind === 'binary') return `${prediction.probability >= .85 ? 'Very likely' : prediction.probability <= .15 ? 'Unlikely' : 'Chance'} · ${percent(prediction.probability)}`
  if (prediction.kind === 'nominal') return prediction.probabilities[0] ? `Most likely: ${prediction.probabilities[0].label}` : 'Still learning'
  if (prediction.kind === 'multiselect') return prediction.probabilities.slice(0, 2).map((item) => `${item.label} ${percent(item.probability)}`).join(' · ') || 'Still learning'
  if (prediction.kind === 'ordinal') return `Likely ${result.target.options?.[Math.round(prediction.estimate)]?.label ?? Math.round(prediction.estimate)}`
  return `~${number(prediction.estimate)}`
}

export function localForecastDates(now: Date): { asOfDate: string; forecastDate: string } {
  const localDate = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const next = new Date(now)
  next.setDate(next.getDate() + 1)
  return { asOfDate: localDate(now), forecastDate: localDate(next) }
}
