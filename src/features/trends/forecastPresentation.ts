import type { ForecastResult } from '../../analytics/forecasting/forecastTypes.ts'

const compact = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(1)
const percent = (value: number): string => `${Math.round(value * 100)}%`

export interface ForecastDisplay {
  value: string
  probability?: string
  detail?: string
}

/** Presentation-only wording. Prediction values and confidence remain owned by the forecasting engine. */
export function forecastDisplay(result: ForecastResult): ForecastDisplay {
  const prediction = result.prediction
  if (!prediction) return { value: 'Still learning' }
  if (prediction.kind === 'binary') {
    const yes = prediction.probability >= .5
    return { value: yes ? 'Yes' : 'No', probability: percent(yes ? prediction.probability : 1 - prediction.probability) }
  }
  if (prediction.kind === 'numeric') return { value: compact(prediction.estimate), detail: result.diagnostics.uninformativeRange ? 'Tomorrow is still hard to narrow down.' : `Likely range ${compact(prediction.likelyLow)}–${compact(prediction.likelyHigh)}` }
  if (prediction.kind === 'ordinal') return { value: result.target.options?.[Math.round(prediction.estimate)]?.label ?? compact(Math.round(prediction.estimate)), detail: result.diagnostics.uninformativeRange ? 'Tomorrow is still hard to narrow down.' : `Likely range ${compact(prediction.likelyLow)}–${compact(prediction.likelyHigh)}` }
  const leading = prediction.probabilities[0]
  if (prediction.kind === 'nominal') return { value: leading?.label ?? '—', probability: leading ? percent(leading.probability) : undefined }
  return { value: leading?.label ?? '—', probability: leading ? percent(leading.probability) : undefined }
}

export function targetSpecificForecastReasons(result: ForecastResult): readonly string[] {
  const messages: string[] = []
  if (result.diagnostics.limitedVariation) messages.push(`${result.target.label} has shown very little outcome variation recently.`)
  if (result.regimeStrategy === 'current-regime') messages.push('A recent pattern was more dependable than the full history for this target.')
  if (result.contributors.some((contributor) => contributor.source === 'relationship')) messages.push('A reviewed relationship materially contributed to this estimate.')
  for (const warning of result.warnings) {
    if (!/history|holdout|predictor|estimate, not a diagnosis/i.test(warning)) messages.push(warning)
  }
  return [...new Set(messages)]
}
