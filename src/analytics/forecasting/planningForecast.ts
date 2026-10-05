import type { TrendsData } from '../AnalyticsProvider.ts'
import { analysisSeriesOptions, buildAnalysisTrack, type AnalysisValue } from '../analysisModel.ts'
import { snapshotForFeatureCutoff } from '../features/longitudinalIndex.ts'
import { forecastTargetRangeAsOf } from './multiHorizonForecast.ts'
import type {
  CrossTargetPlanningWindow, ForecastConfidence, ForecastPrediction, ForecastTarget, HorizonForecastResult,
  PlanningDirection, PlanningForecastRequest, PlanningForecastResult, PlanningPreference, PlanningStrategy,
  PlanningStrategyScore, PlanningUsefulness, PlanningWindowResult, RecursiveForecastInput,
} from './forecastTypes.ts'

const dayMs = 86_400_000
const plusDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10)
const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
const clamp = (value: number, low = 0, high = 1): number => Math.max(low, Math.min(high, value))
const optionId = (id: string): string => id.replace(/^option:/, '')
const confidenceRank: Record<ForecastConfidence, number> = { low: 0, moderate: 1, high: 2 }
export const planningForecastConfigVersion = 'planning-v1'
export const defaultPlanningWindows = [7, 7, 7, 9] as const

type Strategy = Exclude<PlanningStrategy, 'recursive-continuation'>

function scalar(target: ForecastTarget, value: AnalysisValue, option?: string): number | null {
  if (option) return Number(Boolean(value.categories?.some((item) => optionId(item.id) === option)))
  if (target.kind === 'binary') return value.booleanValue === undefined ? null : Number(value.booleanValue)
  return value.numericValue ?? null
}

function observationsBefore(values: readonly AnalysisValue[], date: string): AnalysisValue[] {
  return values.filter((value) => value.localDate < date).sort((a, b) => a.localDate.localeCompare(b.localDate))
}

function seasonalValues(values: readonly AnalysisValue[], date: string): readonly AnalysisValue[] {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  const matching = values.filter((value) => new Date(`${value.localDate}T00:00:00Z`).getUTCDay() === weekday)
  return matching.length >= 3 ? matching : values
}

function baselinePrediction(target: ForecastTarget, history: readonly AnalysisValue[], date: string, strategy: Strategy): ForecastPrediction | undefined {
  const source = (strategy === 'seasonal-calendar' ? seasonalValues(history, date) : history).slice(strategy === 'recent-history' ? -30 : -16)
  if (!source.length) return undefined
  if (target.kind === 'numeric' || target.kind === 'ordinal') {
    const values = source.flatMap((value) => { const item = scalar(target, value); return item === null ? [] : [item] })
    if (!values.length) return undefined
    const estimate = mean(values.slice(-14)); const deviations = values.map((value) => Math.abs(value - estimate)).sort((a, b) => a - b)
    const radius = deviations[Math.floor((deviations.length - 1) * .8)] ?? 0
    const low = target.minimum === undefined ? estimate - radius : Math.max(target.minimum, estimate - radius)
    const high = target.maximum === undefined ? estimate + radius : Math.min(target.maximum, estimate + radius)
    return target.kind === 'ordinal'
      ? { kind: 'ordinal', estimate, likelyLow: Math.floor(low), likelyHigh: Math.ceil(high) }
      : { kind: 'numeric', estimate, likelyLow: low, likelyHigh: high }
  }
  if (target.kind === 'binary') {
    const values = source.flatMap((value) => { const item = scalar(target, value); return item === null ? [] : [item] })
    return values.length ? { kind: 'binary', probability: (values.reduce((sum, value) => sum + value, 0) + 1) / (values.length + 2) } : undefined
  }
  const probabilities = (target.options ?? []).map((option) => {
    const values = source.map((value) => scalar(target, value, option.id) ?? 0)
    return { ...option, probability: (values.reduce((sum, value) => sum + value, 0) + 1) / (values.length + 2) }
  })
  if (!probabilities.length) return undefined
  if (target.kind === 'nominal') {
    const total = probabilities.reduce((sum, item) => sum + item.probability, 0)
    return { kind: 'nominal', probabilities: probabilities.map((item) => ({ ...item, probability: item.probability / total })).sort((a, b) => b.probability - a.probability) }
  }
  return { kind: 'multiselect', probabilities: probabilities.sort((a, b) => b.probability - a.probability) }
}

function predictionScore(target: ForecastTarget, prediction: ForecastPrediction | undefined, actual: AnalysisValue): number | null {
  if (!prediction) return null
  if (prediction.kind === 'numeric' || prediction.kind === 'ordinal') { const value = scalar(target, actual); return value === null ? null : Math.abs(prediction.estimate - value) }
  if (prediction.kind === 'binary') { const value = scalar(target, actual); return value === null ? null : (prediction.probability - value) ** 2 }
  const scores = prediction.probabilities.map((item) => (item.probability - (scalar(target, actual, item.id) ?? 0)) ** 2)
  return scores.length ? mean(scores) : null
}

function validateStrategy(target: ForecastTarget, values: readonly AnalysisValue[], strategy: Strategy): PlanningStrategyScore {
  const ordered = [...values].sort((a, b) => a.localDate.localeCompare(b.localDate)); const scores: number[] = []
  for (const actual of ordered) for (const horizon of [7, 14, 21, 30]) {
    const historicalCutoff = plusDays(actual.localDate, -horizon)
    const history = ordered.filter((value) => value.localDate <= historicalCutoff)
    if (history.length < 14) continue
    const score = predictionScore(target, baselinePrediction(target, history, actual.localDate, strategy), actual)
    if (score !== null) scores.push(score)
  }
  return { strategy, score: scores.length ? mean(scores) : undefined, validationCount: scores.length }
}

function intervalCoverage(target: ForecastTarget, values: readonly AnalysisValue[], strategy: Strategy): number | undefined {
  if (target.kind !== 'numeric' && target.kind !== 'ordinal') return undefined
  const ordered = [...values].sort((a, b) => a.localDate.localeCompare(b.localDate)); let covered = 0; let total = 0
  for (const actual of ordered) for (const horizon of [7, 14, 21, 30]) {
    const history = ordered.filter((value) => value.localDate <= plusDays(actual.localDate, -horizon))
    if (history.length < 14) continue
    const prediction = baselinePrediction(target, history, actual.localDate, strategy); const observed = scalar(target, actual)
    if (!prediction || (prediction.kind !== 'numeric' && prediction.kind !== 'ordinal') || observed === null) continue
    total++; if (observed >= prediction.likelyLow && observed <= prediction.likelyHigh) covered++
  }
  return total ? covered / total : undefined
}

function recursivePrediction(days: readonly HorizonForecastResult[], target: ForecastTarget): ForecastPrediction | undefined {
  const predictions = days.slice(-7).flatMap((day) => day.prediction ? [day.prediction] : [])
  if (!predictions.length) return undefined
  if (target.kind === 'numeric' || target.kind === 'ordinal') {
    const compatible = predictions.flatMap((item) => item.kind === 'numeric' || item.kind === 'ordinal' ? [item] : [])
    if (!compatible.length) return undefined
    const estimate = mean(compatible.map((item) => item.estimate)); const likelyLow = mean(compatible.map((item) => item.likelyLow)); const likelyHigh = mean(compatible.map((item) => item.likelyHigh))
    return target.kind === 'ordinal' ? { kind: 'ordinal', estimate, likelyLow, likelyHigh } : { kind: 'numeric', estimate, likelyLow, likelyHigh }
  }
  if (target.kind === 'binary') {
    const values = predictions.flatMap((item) => item.kind === 'binary' ? [item.probability] : [])
    return values.length ? { kind: 'binary', probability: mean(values) } : undefined
  }
  const options = target.options ?? []
  const probabilities = options.map((option) => ({ ...option, probability: mean(predictions.flatMap((item) => item.kind === 'nominal' || item.kind === 'multiselect' ? [item.probabilities.find((candidate) => candidate.id === option.id)?.probability ?? 0] : [])) }))
  if (target.kind === 'nominal') { const total = probabilities.reduce((sum, item) => sum + item.probability, 0); return { kind: 'nominal', probabilities: probabilities.map((item) => ({ ...item, probability: total ? item.probability / total : 1 / Math.max(1, probabilities.length) })).sort((a, b) => b.probability - a.probability) } }
  return { kind: 'multiselect', probabilities: probabilities.sort((a, b) => b.probability - a.probability) }
}

function decayPrediction(prediction: ForecastPrediction, target: ForecastTarget, horizon: number): ForecastPrediction {
  const decay = Math.min(.45, Math.max(0, horizon - 7) * .018)
  if (prediction.kind === 'numeric' || prediction.kind === 'ordinal') {
    const radius = Math.max(prediction.estimate - prediction.likelyLow, prediction.likelyHigh - prediction.estimate) * Math.sqrt(horizon / 7)
    const low = target.minimum === undefined ? prediction.estimate - radius : Math.max(target.minimum, prediction.estimate - radius)
    const high = target.maximum === undefined ? prediction.estimate + radius : Math.min(target.maximum, prediction.estimate + radius)
    return prediction.kind === 'ordinal' ? { ...prediction, likelyLow: Math.floor(low), likelyHigh: Math.ceil(high) } : { ...prediction, likelyLow: low, likelyHigh: high }
  }
  if (prediction.kind === 'binary') return { ...prediction, probability: clamp(.5 + (prediction.probability - .5) * (1 - decay)) }
  const center = prediction.kind === 'nominal' ? 1 / Math.max(1, prediction.probabilities.length) : .5
  let probabilities = prediction.probabilities.map((item) => ({ ...item, probability: clamp(center + (item.probability - center) * (1 - decay)) }))
  if (prediction.kind === 'nominal') { const total = probabilities.reduce((sum, item) => sum + item.probability, 0); probabilities = probabilities.map((item) => ({ ...item, probability: item.probability / total })) }
  return { ...prediction, probabilities }
}

function predictionUncertainty(prediction: ForecastPrediction): number {
  if (prediction.kind === 'numeric' || prediction.kind === 'ordinal') return Math.max(0, prediction.likelyHigh - prediction.likelyLow)
  if (prediction.kind === 'binary') return 4 * prediction.probability * (1 - prediction.probability)
  return mean(prediction.probabilities.map((item) => 4 * item.probability * (1 - item.probability)))
}

function recursiveInput(day: HorizonForecastResult): RecursiveForecastInput | undefined {
  if (!day.prediction) return undefined
  const value = day.prediction.kind === 'numeric' || day.prediction.kind === 'ordinal' ? day.prediction.estimate
    : day.prediction.kind === 'binary' ? day.prediction.probability
      : day.prediction.kind === 'nominal' ? day.prediction.probabilities[0]?.id ?? ''
        : day.prediction.probabilities.filter((item) => item.probability >= .5).map((item) => item.id)
  return { sourceHorizon: day.horizon, forecastDate: day.forecastDate, kind: day.prediction.kind, value, uncertainty: predictionUncertainty(day.prediction) }
}

function uninformative(prediction: ForecastPrediction, target: ForecastTarget): boolean {
  if ((prediction.kind !== 'numeric' && prediction.kind !== 'ordinal') || target.minimum === undefined || target.maximum === undefined) return false
  return prediction.likelyHigh - prediction.likelyLow >= (target.maximum - target.minimum) * .8
}

function aggregatePrediction(target: ForecastTarget, days: readonly HorizonForecastResult[]): ForecastPrediction | undefined {
  const predictions = days.flatMap((day) => day.prediction ? [day.prediction] : [])
  if (!predictions.length) return undefined
  if (target.kind === 'numeric' || target.kind === 'ordinal') {
    const compatible = predictions.flatMap((item) => item.kind === 'numeric' || item.kind === 'ordinal' ? [item] : [])
    if (!compatible.length) return undefined
    const estimate = mean(compatible.map((item) => item.estimate)); const likelyLow = mean(compatible.map((item) => item.likelyLow)); const likelyHigh = mean(compatible.map((item) => item.likelyHigh))
    return target.kind === 'ordinal' ? { kind: 'ordinal', estimate, likelyLow, likelyHigh } : { kind: 'numeric', estimate, likelyLow, likelyHigh }
  }
  if (target.kind === 'binary') { const values = predictions.flatMap((item) => item.kind === 'binary' ? [item.probability] : []); return values.length ? { kind: 'binary', probability: mean(values) } : undefined }
  const probabilities = (target.options ?? []).map((option) => ({ ...option, probability: mean(predictions.flatMap((item) => item.kind === 'nominal' || item.kind === 'multiselect' ? [item.probabilities.find((entry) => entry.id === option.id)?.probability ?? 0] : [])) }))
  if (target.kind === 'nominal') { const total = probabilities.reduce((sum, item) => sum + item.probability, 0); return { kind: 'nominal', probabilities: probabilities.map((item) => ({ ...item, probability: total ? item.probability / total : 1 / Math.max(1, probabilities.length) })).sort((a, b) => b.probability - a.probability) } }
  return { kind: 'multiselect', probabilities: probabilities.sort((a, b) => b.probability - a.probability) }
}

function historicalBaseline(target: ForecastTarget, values: readonly AnalysisValue[]): ForecastPrediction | undefined {
  return baselinePrediction(target, values.slice(-30), plusDays(values.at(-1)?.localDate ?? '1970-01-01', 1), 'recent-history')
}

function relativeDirection(target: ForecastTarget, prediction: ForecastPrediction | undefined, baseline: ForecastPrediction | undefined): { score?: number; direction: PlanningDirection } {
  if (!prediction || !baseline || prediction.kind !== baseline.kind) return { direction: 'uncertain' }
  if ((prediction.kind === 'numeric' || prediction.kind === 'ordinal') && (baseline.kind === 'numeric' || baseline.kind === 'ordinal')) {
    const span = target.maximum !== undefined && target.minimum !== undefined ? target.maximum - target.minimum : Math.max(1, baseline.likelyHigh - baseline.likelyLow)
    const score = (prediction.estimate - baseline.estimate) / Math.max(1e-6, span)
    return { score, direction: score > .1 ? 'higher' : score < -.1 ? 'lower' : 'around-usual' }
  }
  if (prediction.kind === 'binary' && baseline.kind === 'binary') { const score = prediction.probability - baseline.probability; return { score, direction: score > .06 ? 'more-likely' : score < -.06 ? 'less-likely' : 'around-usual' } }
  if ((prediction.kind === 'nominal' || prediction.kind === 'multiselect') && (baseline.kind === 'nominal' || baseline.kind === 'multiselect')) {
    const deltas = prediction.probabilities.map((item) => ({ item, delta: item.probability - (baseline.probabilities.find((base) => base.id === item.id)?.probability ?? 0) })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    const strongest = deltas[0]; return strongest && Math.abs(strongest.delta) > .06 ? { score: strongest.delta, direction: strongest.delta > 0 ? 'more-likely' : 'less-likely' } : { score: 0, direction: 'around-usual' }
  }
  return { direction: 'mixed' }
}

function preferenceFor(target: ForecastTarget, direction: PlanningDirection): PlanningPreference {
  if (!target.valueDirection || target.valueDirection === 'neutral' || !['higher', 'lower', 'more-likely', 'less-likely'].includes(direction)) return direction === 'around-usual' ? 'neutral' : 'unknown'
  const increased = direction === 'higher' || direction === 'more-likely'
  return increased === (target.valueDirection === 'better') ? 'favorable' : 'unfavorable'
}

function windowSummary(target: ForecastTarget, prediction: ForecastPrediction | undefined, direction: PlanningDirection, state: PlanningUsefulness): string {
  if (state === 'insufficient' || !prediction) return 'Not enough evidence for a useful estimate this far out.'
  if (prediction.kind === 'numeric') return direction === 'higher' ? 'Trends higher than your recent pattern.' : direction === 'lower' ? 'Trends lower than your recent pattern.' : direction === 'around-usual' ? 'Expected to stay around your recent pattern.' : 'The range is harder to narrow down.'
  if (prediction.kind === 'ordinal') { const label = target.options?.[Math.round(prediction.estimate)]?.label; return label ? `Centers around ${label}; ${direction === 'around-usual' ? 'close to your recent pattern' : `${direction} than your recent pattern`}.` : `Expected to be ${direction === 'around-usual' ? 'around your recent pattern' : `${direction} than your recent pattern`}.` }
  if (prediction.kind === 'binary') return `${Math.round(prediction.probability * 100)}% average chance; ${direction === 'more-likely' ? 'more likely' : direction === 'less-likely' ? 'less likely' : 'around your recent pattern'}.`
  const top = prediction.probabilities[0]
  if (!top) return 'The pattern is too uncertain to summarize.'
  return prediction.kind === 'nominal' ? `${top.label} is the leading pattern at about ${Math.round(top.probability * 100)}%.` : `${top.label} has the strongest average signal at about ${Math.round(top.probability * 100)}%.`
}

function configuredWindows(horizonDays: number, requested?: readonly number[]): number[] {
  const valid = (requested?.length ? requested : defaultPlanningWindows).filter((size) => Number.isInteger(size) && size > 0)
  const result: number[] = []; let used = 0
  for (const size of valid) { if (used >= horizonDays) break; const bounded = Math.min(size, horizonDays - used); result.push(bounded); used += bounded }
  if (used < horizonDays) result.push(horizonDays - used)
  return result
}

function aggregateWindows(target: ForecastTarget, values: readonly AnalysisValue[], days: readonly HorizonForecastResult[], sizes: readonly number[]): PlanningWindowResult[] {
  const baseline = historicalBaseline(target, values); const windows: PlanningWindowResult[] = []; let offset = 0
  for (const size of sizes) {
    const members = days.slice(offset, offset + size); offset += size
    const usable = members.filter((day) => day.horizonState !== 'insufficient' && day.prediction)
    const coverage = usable.length / Math.max(1, members.length)
    const state: PlanningUsefulness = coverage < .5 ? 'insufficient' : coverage < 1 || usable.some((day) => day.horizonState === 'rough') ? 'rough' : 'useful'
    const prediction = state === 'insufficient' ? undefined : aggregatePrediction(target, usable)
    const relative = relativeDirection(target, prediction, baseline)
    const rank = usable.length ? mean(usable.map((day) => confidenceRank[day.confidence ?? 'low'])) : 0
    const confidence: ForecastConfidence = state === 'useful' && rank >= 1.7 ? 'high' : state !== 'insufficient' && rank >= .75 ? 'moderate' : 'low'
    windows.push({ startDate: members[0]?.forecastDate ?? '', endDate: members.at(-1)?.forecastDate ?? '', startHorizon: members[0]?.horizon ?? 0, endHorizon: members.at(-1)?.horizon ?? 0, state, confidence, usableDays: usable.length, totalDays: members.length, prediction, normalizedScore: relative.score, direction: state === 'insufficient' ? 'uncertain' : relative.direction, preference: preferenceFor(target, relative.direction), summary: windowSummary(target, prediction, relative.direction, state) })
  }
  return windows
}

function planningConfidence(windows: readonly PlanningWindowResult[]): string {
  const moderate = windows.filter((window) => window.state !== 'insufficient' && confidenceRank[window.confidence] >= 1).at(-1)
  if (moderate) { const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${moderate.endDate}T12:00:00`)); return `Confidence is ${moderate.confidence} through ${date}; later windows are more uncertain.` }
  return windows.some((window) => window.state !== 'insufficient') ? 'This month-ahead outlook is rough and becomes less certain farther out.' : 'There is not enough history yet for a useful month-ahead pattern.'
}

function forecastPlanningTarget(snapshot: TrendsData, descriptorId: string, cutoffDate: string, request: PlanningForecastRequest): PlanningForecastResult {
  const firstWeek = forecastTargetRangeAsOf(snapshot, descriptorId, cutoffDate, Math.min(7, request.horizonDays), request)
  const target = firstWeek.target
  const descriptor = analysisSeriesOptions(snapshot).find((item) => item.id === descriptorId)
  if (!descriptor) throw new Error(`Unknown forecast target: ${descriptorId}`)
  const values = buildAnalysisTrack(snapshot, descriptor, 'all', cutoffDate).values
  const recentScore = validateStrategy(target, values, 'recent-history'); const seasonalScore = validateStrategy(target, values, 'seasonal-calendar')
  const recursiveScores = firstWeek.days.flatMap((day) => day.validationScore === undefined ? [] : [day.validationScore])
  const recursiveScore: PlanningStrategyScore = { strategy: 'recursive-continuation', score: recursiveScores.length ? mean(recursiveScores) : undefined, validationCount: recursiveScores.length }
  const hasValidatedModel = firstWeek.days.some((day) => day.selectedModelKind !== 'baseline' && (day.improvement ?? 0) >= .02)
  const currentRegime = firstWeek.days.some((day) => day.regimeStrategy === 'current-regime')
  let selectedStrategy: PlanningStrategy = !currentRegime && seasonalScore.validationCount >= 8 && seasonalScore.score !== undefined && recentScore.score !== undefined && seasonalScore.score < recentScore.score * .98 ? 'seasonal-calendar' : 'recent-history'
  const selectedBaselineScore = selectedStrategy === 'seasonal-calendar' ? seasonalScore.score : recentScore.score
  if (hasValidatedModel && recursiveScore.score !== undefined && (selectedBaselineScore === undefined || recursiveScore.score < selectedBaselineScore * .98)) selectedStrategy = 'recursive-continuation'
  const days = [...firstWeek.days]
  const support = new Set(values.map((value) => value.localDate)).size
  for (let horizon = 8; horizon <= request.horizonDays; horizon++) {
    const forecastDate = plusDays(cutoffDate, horizon)
    const base = selectedStrategy === 'recursive-continuation' ? recursivePrediction(days, target) : baselinePrediction(target, observationsBefore(values, forecastDate), forecastDate, selectedStrategy)
    const prediction = base ? decayPrediction(base, target, horizon) : undefined
    const tooSparse = support < Math.max(14, Math.ceil(horizon * 1.1))
    const tooBroad = prediction ? uninformative(prediction, target) && horizon > 14 : true
    const horizonState: HorizonForecastResult['horizonState'] = !prediction || tooSparse || tooBroad ? 'insufficient' : horizon <= 14 && support >= 45 ? 'ready' : 'rough'
    const previousInputs = days.slice(-7).flatMap((day) => { const input = recursiveInput(day); return input ? [input] : [] })
    const template = firstWeek.days.at(-1)!
    days.push({ ...template, forecastDate, horizon, prediction: horizonState === 'insufficient' ? undefined : prediction, status: horizonState === 'insufficient' ? 'insufficient-history' : 'ready', horizonState, confidence: horizonState === 'ready' ? 'moderate' : horizonState === 'rough' ? 'low' : undefined, selectedModelKind: selectedStrategy === 'recursive-continuation' ? template.selectedModelKind : 'baseline', baselineModel: target.kind === 'binary' || target.kind === 'nominal' || target.kind === 'multiselect' ? 'recent-prevalence' : 'recent-mean', usedRecursiveInputs: selectedStrategy === 'recursive-continuation', warnings: horizonState === 'insufficient' ? ['This target becomes too uncertain this far out.'] : [], diagnostics: { ...template.diagnostics, horizon, recursiveInputs: previousInputs, uninformativeRange: tooBroad, featureAvailability: template.diagnostics.featureAvailability?.map((item) => ({ ...item, availability: item.availability === 'calendar-known' || item.availability === 'recursive-target' ? item.availability : 'unavailable-future' })) } })
  }
  const windows = aggregateWindows(target, values, days, configuredWindows(request.horizonDays, request.windowDays))
  const usable = days.filter((day) => day.horizonState !== 'insufficient').length
  const validationMetric = target.kind === 'binary' ? 'brier' : target.kind === 'nominal' || target.kind === 'multiselect' ? 'multiclass-brier' : 'mae'
  const selectedBaseline = selectedStrategy === 'seasonal-calendar' ? 'seasonal-calendar' : 'recent-history'
  return { target, horizonDays: request.horizonDays, days, windows, selectedStrategy, strategyScores: [recentScore, seasonalScore, recursiveScore], validationMetric, intervalCoverage: intervalCoverage(target, values, selectedBaseline), confidenceSummary: planningConfidence(windows), summary: `${usable} of ${request.horizonDays} days contribute to the planning windows.`, regimeStrategy: currentRegime ? 'current-regime' : 'full-history', usableFraction: usable / request.horizonDays }
}

export function planningForecastCacheKey(data: TrendsData, request: PlanningForecastRequest): string {
  const revisions = [data.logRecords, data.observations, data.observationSelections, data.trackables, data.trackableVersions, data.trackableOptions, data.analysisMappings].flat().map((item) => `${item.id}:${item.updatedAt}:${item.revision}`).sort()
  const reviews = (request.reviews ?? []).map((review) => `${review.id}:${review.updatedAt}`).sort()
  return JSON.stringify([planningForecastConfigVersion, revisions, request.asOfDate, request.horizonDays, request.windowDays ?? defaultPlanningWindows, [...(request.targetDescriptorIds ?? [])].sort(), reviews, request.policy ?? {}])
}

/** Historical planning forecast. Every result is derived from a strict end-of-cutoff snapshot. */
export function forecastPlanningAsOf(input: TrendsData, targetDescriptorId: string, cutoffDate: string, horizonDays = 30, request: Omit<PlanningForecastRequest, 'asOfDate' | 'horizonDays'> = {}): PlanningForecastResult {
  if (!Number.isInteger(horizonDays) || horizonDays < 14 || horizonDays > 30) throw new Error('Planning horizon must be between 14 and 30 days.')
  const stamp = request.asOfTimestamp ?? `${cutoffDate}T23:59:59.999Z`
  const snapshot = snapshotForFeatureCutoff(input, cutoffDate, stamp)
  return forecastPlanningTarget(snapshot, targetDescriptorId, cutoffDate, { ...request, asOfDate: cutoffDate, horizonDays, asOfTimestamp: stamp })
}

export function forecastPlanning(input: TrendsData, request: PlanningForecastRequest): readonly PlanningForecastResult[] {
  if (!Number.isInteger(request.horizonDays) || request.horizonDays < 14 || request.horizonDays > 30) throw new Error('Planning horizon must be between 14 and 30 days.')
  const stamp = request.asOfTimestamp ?? `${request.asOfDate}T23:59:59.999Z`
  const snapshot = snapshotForFeatureCutoff(input, request.asOfDate, stamp); const selected = new Set(request.targetDescriptorIds ?? [])
  return analysisSeriesOptions(snapshot).filter((descriptor) => !descriptor.ownerTrackableId && (!selected.size || selected.has(descriptor.id))).map((descriptor) => forecastPlanningTarget(snapshot, descriptor.id, request.asOfDate, { ...request, asOfTimestamp: stamp }))
}

export function crossTargetPlanningSummary(results: readonly PlanningForecastResult[]): readonly CrossTargetPlanningWindow[] {
  const keys = new Map<string, CrossTargetPlanningWindow>()
  for (const result of results) for (const window of result.windows) {
    if (window.state === 'insufficient') continue
    const key = `${window.startDate}/${window.endDate}`; const current = keys.get(key)
    const item = { descriptorId: result.target.descriptorId, label: result.target.label, summary: window.summary, state: window.state, preference: window.preference }
    keys.set(key, current ? { ...current, items: [...current.items, item] } : { startDate: window.startDate, endDate: window.endDate, items: [item] })
  }
  return [...keys.values()].sort((a, b) => a.startDate.localeCompare(b.startDate))
}
