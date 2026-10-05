import type { TrendsData } from '../AnalyticsProvider.ts'
import { analysisSeriesOptions, buildAnalysisTrack, type AnalysisSeriesDescriptor, type AnalysisValue } from '../analysisModel.ts'
import { generateFeatureFrame } from '../features/featureEngine.ts'
import { snapshotForFeatureCutoff } from '../features/longitudinalIndex.ts'
import { reviewFeedbackWeight, type RelationshipReview } from '../insights/insightReview.ts'
import { discoverRelationships } from '../relationships/relationshipDiscovery.ts'
import type { FeatureDefinition } from '../features/featureTypes.ts'
import type { ForecastConfidence, ForecastDiagnostics, ForecastFeatureSummary, ForecastFold, ForecastModelKind, ForecastPolicy, ForecastRequest, ForecastResult, ForecastTarget } from './forecastTypes.ts'
import { forecastFeatureAvailability } from './featureAvailability.ts'

export const defaultForecastPolicy: ForecastPolicy = {
  minimumBaselineNumeric: 8, minimumBaselineCategorical: 8, minimumRecentObservations: 5, recentCoverageDays: 30, maximumLatestAgeDays: 21,
  minimumTraining: 18, minimumValidation: 6, minimumFolds: 3, maximumFolds: 5,
  minimumClassCases: 4, maximumMissingness: .55, recentWindow: 7, prevalenceWindow: 30,
  regularization: [.05, .5, 2], maximumPredictors: 12, minimumResidualSupport: 12,
  horizonObservationStep: 3, minimumHorizonCalibration: 8,
}

type ScalarKind = 'numeric' | 'binary'
type Point = { date: string; y: number; x: number[] }
type Model = { kind: ForecastModelKind; predict: (x: readonly number[]) => number; weights: readonly number[] }
const dayMs = 86_400_000
const clamp = (value: number, low = 0, high = 1): number => Math.max(low, Math.min(high, value))
const sigmoid = (value: number): number => value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value))
const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
const localDate = (day: number): string => new Date(day * dayMs).toISOString().slice(0, 10)
const dateNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / dayMs
const tomorrow = (date: string): string => localDate(dateNumber(date) + 1)
const optionId = (id: string): string => id.startsWith('option:') ? id.slice(7) : id

function policyFor(overrides: Partial<ForecastPolicy> = {}): ForecastPolicy {
  const policy = { ...defaultForecastPolicy, ...overrides, regularization: overrides.regularization ?? defaultForecastPolicy.regularization }
  if (policy.minimumTraining < 2 || policy.minimumValidation < 1 || policy.minimumFolds < 1 || policy.maximumFolds < policy.minimumFolds || policy.minimumBaselineNumeric < 2 || policy.minimumBaselineCategorical < 2) throw new Error('Invalid forecast policy.')
  return policy
}

function targetFor(descriptor: AnalysisSeriesDescriptor, values: readonly AnalysisValue[], data: TrendsData): ForecastTarget | null {
  const base = { descriptorId: descriptor.id, trackableId: descriptor.trackableId, label: descriptor.name, measurementType: descriptor.measurementType }
  const trackable = data.trackables.find((item) => item.id === descriptor.trackableId)
  const version = data.trackableVersions.find((item) => item.trackableId === descriptor.trackableId && item.version === trackable?.currentVersion)
  const scaleBounds = version?.scaleMin !== undefined && version.scaleMax !== undefined ? { minimum: version.scaleMin, maximum: version.scaleMax } : {}
  if (['continuous', 'count', 'duration', 'time'].includes(descriptor.measurementType)) {
    return { ...base, kind: 'numeric', valueDirection: version?.valueDirection, ...scaleBounds, ...(descriptor.measurementType === 'count' ? { minimum: 0 } : {}) }
  }
  if (descriptor.measurementType === 'ordinal') {
    const ordered = version?.configuration.orderedOptionIds
    const options = Array.isArray(ordered) ? ordered.filter((id): id is string => typeof id === 'string').map((id) => ({ id, label: data.trackableOptions.find((option) => option.trackableId === descriptor.trackableId && option.optionId === id && option.trackableVersion === trackable?.currentVersion)?.label ?? id })) : undefined
    return { ...base, kind: 'ordinal', valueDirection: version?.valueDirection, ...(options?.length ? { minimum: 0, maximum: options.length - 1, options } : scaleBounds) }
  }
  if (descriptor.measurementType === 'binary') return { ...base, kind: 'binary', valueDirection: version?.valueDirection }
  if (descriptor.measurementType === 'nominal-single' || descriptor.measurementType === 'nominal-multiselect') {
    const options = new Map(values.flatMap((value) => value.categories ?? []).map((item) => [optionId(item.id), item.label]))
    return options.size ? { ...base, kind: descriptor.measurementType === 'nominal-single' ? 'nominal' : 'multiselect', valueDirection: version?.valueDirection, options: [...options].map(([id, label]) => ({ id, label })).sort((a, b) => a.id.localeCompare(b.id)) } : null
  }
  return null // An occurrence is not a defensible daily binary target without an explicit daily assertion series.
}

function latestValues(values: readonly AnalysisValue[]): Map<string, AnalysisValue> {
  const result = new Map<string, AnalysisValue>()
  for (const value of values) result.set(value.localDate, value)
  return result
}

function valueFor(target: ForecastTarget, value: AnalysisValue, categoryId?: string): number | null {
  if (categoryId) return Number(Boolean(value.categories?.some((item) => optionId(item.id) === categoryId)))
  if (target.kind === 'binary') return value.booleanValue === undefined ? null : Number(value.booleanValue)
  return value.numericValue === undefined ? null : value.numericValue
}

function baseline(history: readonly number[], kind: ScalarKind, policy: ForecastPolicy): { value: number; model: 'persistence' | 'recent-mean' | 'recent-prevalence' } {
  if (kind === 'binary') { const recent = history.slice(-policy.prevalenceWindow); return { value: (recent.reduce((sum, value) => sum + value, 0) + 1) / (recent.length + 2), model: 'recent-prevalence' } }
  return { value: mean(history.slice(-policy.recentWindow)), model: history.length ? 'recent-mean' : 'persistence' }
}

function quantile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return 0
  const index = (sorted.length - 1) * fraction; const low = Math.floor(index); const high = Math.ceil(index)
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low)
}

function normalizer(points: readonly Point[]): { centers: number[]; scales: number[] } {
  const width = points[0]?.x.length ?? 0
  const centers = Array.from({ length: width }, (_, index) => mean(points.map((point) => point.x[index])))
  const scales = centers.map((center, index) => Math.sqrt(mean(points.map((point) => (point.x[index] - center) ** 2))) || 1)
  return { centers, scales }
}

function fitModel(points: readonly Point[], kind: ScalarKind, regularization: number): Model {
  const { centers, scales } = normalizer(points); const width = centers.length
  const weights = Array<number>(width).fill(0); const initialPrevalence = clamp(mean(points.map((point) => point.y)), .001, .999)
  let intercept = kind === 'binary' ? Math.log(initialPrevalence / (1 - initialPrevalence)) : mean(points.map((point) => point.y))
  const iterations = kind === 'binary' ? 700 : 500
  const rate = kind === 'binary' ? .08 : .06
  for (let step = 0; step < iterations; step++) {
    let interceptGradient = 0; const gradients = Array<number>(width).fill(0)
    for (const point of points) {
      const normalized = point.x.map((value, index) => (value - centers[index]) / scales[index])
      const linear = intercept + normalized.reduce((sum, value, index) => sum + value * weights[index], 0)
      const prediction = kind === 'binary' ? sigmoid(linear) : linear
      const error = prediction - point.y
      interceptGradient += error
      for (let index = 0; index < width; index++) gradients[index] += error * normalized[index]
    }
    intercept -= rate * interceptGradient / points.length
    for (let index = 0; index < width; index++) weights[index] -= rate * ((gradients[index] / points.length) + regularization * weights[index])
  }
  return { kind: kind === 'binary' ? 'logistic' : 'ridge', weights, predict: (x) => {
    const linear = intercept + x.reduce((sum, value, index) => sum + ((value - centers[index]) / scales[index]) * weights[index], 0)
    return kind === 'binary' ? sigmoid(linear) : linear
  } }
}

function score(kind: ScalarKind, predicted: number, actual: number): number { return kind === 'binary' ? (predicted - actual) ** 2 : Math.abs(predicted - actual) }

function folds(points: readonly Point[], kind: ScalarKind, policy: ForecastPolicy, regularization: number, requireBothClasses = false): ForecastFold[] {
  if (points.length < policy.minimumTraining + policy.minimumValidation * policy.minimumFolds) return []
  const result: ForecastFold[] = []; const block = Math.max(policy.minimumValidation, Math.floor((points.length - policy.minimumTraining) / policy.maximumFolds))
  for (let end = policy.minimumTraining; end + policy.minimumValidation <= points.length && result.length < policy.maximumFolds; end += block) {
    const train = points.slice(0, end); const validation = points.slice(end, Math.min(points.length, end + block))
    if (requireBothClasses && kind === 'binary' && new Set(train.map((point) => point.y)).size < 2) continue
    const model = fitModel(train, kind, regularization)
    const history = train.map((point) => point.y); let baseLoss = 0; let modelLoss = 0; const baselineResiduals: number[] = []; const modelResiduals: number[] = []
    for (const point of validation) { const base = baseline(history, kind, policy).value; const modelPrediction = model.predict(point.x); baseLoss += score(kind, base, point.y); modelLoss += score(kind, modelPrediction, point.y); baselineResiduals.push(Math.abs(base - point.y)); modelResiduals.push(Math.abs(modelPrediction - point.y)); history.push(point.y) }
    result.push({ trainEnd: train.at(-1)!.date, validationStart: validation[0].date, validationEnd: validation.at(-1)!.date, baselineScore: baseLoss / validation.length, modelScore: modelLoss / validation.length, validationCount: validation.length, baselineResiduals, modelResiduals })
  }
  return result
}

export function forecastFeatureReviewWeight(feature: FeatureDefinition, reviews: readonly RelationshipReview[], targetDescriptorId?: string): { weight: number; review?: RelationshipReview } {
  const sourceId = feature.source?.descriptorId
  const review = reviews.find((item) => item.kind === 'relationship' && item.predictorDescriptorId === sourceId && (!targetDescriptorId || item.targetDescriptorId === targetDescriptorId))
  return review ? { weight: reviewFeedbackWeight(review), review } : { weight: 0 }
}

/** Only lagged values and calendar facts are known for tomorrow; events and same-day values are deliberately excluded. */
function forecastFeatures(definitions: readonly FeatureDefinition[], target: ForecastTarget, reviews: readonly RelationshipReview[], maximum: number, approvedRelationshipKeys: ReadonlySet<string>, horizon: number): { definitions: FeatureDefinition[]; feedback: Map<string, { weight: number; review?: RelationshipReview }>; excluded: string[] } {
  const safe = definitions.filter((item) => forecastFeatureAvailability(item, target, horizon) !== 'unavailable-future' && (item.transformation.kind === 'calendar' || item.source?.trackableId === target.trackableId || approvedRelationshipKeys.has(item.key)))
  const excluded = definitions.filter((item) => !safe.includes(item)).map((item) => item.key)
  const scored = safe.map((item) => ({ item, feedback: forecastFeatureReviewWeight(item, reviews, target.descriptorId), self: item.source?.trackableId === target.trackableId, relationship: approvedRelationshipKeys.has(item.key) }))
    .sort((a, b) => Number(b.self) - Number(a.self) || Number(b.relationship) - Number(a.relationship) || b.feedback.weight - a.feedback.weight || a.item.key.localeCompare(b.item.key)).slice(0, maximum)
  return { definitions: scored.map((item) => item.item), feedback: new Map(scored.map((item) => [item.item.key, item.feedback])), excluded }
}

function confidence(observations: number, improvement: number, foldsCount: number, uncertainty: number, capability: 'basic' | 'validated' | 'model', latestAge: number): ForecastConfidence {
  if (capability === 'basic' || observations < 25 || foldsCount < 3 || latestAge > 7 || uncertainty >= .7) return 'low'
  return capability === 'model' && observations >= 90 && foldsCount >= 4 && improvement >= .12 && uncertainty < .25 ? 'high' : 'moderate'
}

export function uninformativeForecastRange(low: number, high: number, target: ForecastTarget): boolean {
  const width = (target.maximum ?? NaN) - (target.minimum ?? NaN)
  return Number.isFinite(width) && width > 0 && (high - low) / width >= .8
}

function numericUncertainty(result: ScalarForecastOutcome, target: ForecastTarget, policy: ForecastPolicy): { low: number; high: number; method: 'holdout-residuals' | 'recent-dispersion' | 'target-fallback'; uninformative: boolean; widthFraction: number } {
  const estimate = result.prediction!
  const residuals = result.folds.flatMap((fold) => result.modelKind === 'baseline' ? fold.baselineResiduals : fold.modelResiduals)
  const recent = result.observedValues.slice(-Math.max(policy.recentWindow, 20))
  let low: number; let high: number; let method: 'holdout-residuals' | 'recent-dispersion' | 'target-fallback'
  if (residuals.length >= policy.minimumResidualSupport) {
    const radius = quantile(residuals, .8)
    low = estimate - radius; high = estimate + radius; method = 'holdout-residuals'
  } else if (recent.length >= policy.minimumBaselineNumeric && new Set(recent).size > 1) {
    low = Math.min(estimate, quantile(recent, .1)); high = Math.max(estimate, quantile(recent, .9)); method = 'recent-dispersion'
  } else {
    const domainWidth = target.minimum !== undefined && target.maximum !== undefined ? target.maximum - target.minimum : 0
    const radius = Math.max(target.kind === 'ordinal' ? 1 : 0, domainWidth * .15, Math.abs(estimate) * .1, .5)
    low = estimate - radius; high = estimate + radius; method = 'target-fallback'
  }
  low = target.minimum === undefined ? low : Math.max(target.minimum, low)
  high = target.maximum === undefined ? high : Math.min(target.maximum, high)
  if (target.kind === 'ordinal') { low = Math.max(target.minimum ?? -Infinity, Math.floor(low)); high = Math.min(target.maximum ?? Infinity, Math.ceil(high)) }
  const uninformative = uninformativeForecastRange(low, high, target)
  const domainWidth = target.minimum !== undefined && target.maximum !== undefined ? target.maximum - target.minimum : 0
  const widthFraction = domainWidth > 0 ? Math.min(1, (high - low) / domainWidth) : Math.min(1, (high - low) / Math.max(1, Math.abs(estimate)))
  return { low, high, method, uninformative, widthFraction }
}

function baselineEligibility(target: ForecastTarget, observed: readonly Point[], asOfDate: string, policy: ForecastPolicy): string[] {
  const minimum = target.kind === 'numeric' || target.kind === 'ordinal' ? policy.minimumBaselineNumeric : policy.minimumBaselineCategorical
  if (observed.length < minimum) return ['There are too few recorded days for a careful next-day estimate.']
  const latestAge = dateNumber(asOfDate) - dateNumber(observed.at(-1)!.date)
  if (latestAge > policy.maximumLatestAgeDays) return ['The most recent recording is too old to guide tomorrow.']
  const recent = observed.filter((point) => dateNumber(asOfDate) - dateNumber(point.date) < policy.recentCoverageDays)
  if (recent.length < policy.minimumRecentObservations) return ['Recent recordings are too sparse to guide tomorrow.']
  return []
}

interface ScalarForecastOutcome {
  prediction?: number; model?: Model; kind: ScalarKind; modelKind?: ForecastModelKind; folds: ForecastFold[]
  baselineScore?: number; score?: number; improvement?: number; baselineModel: ForecastResult['baselineModel']
  warnings: string[]; diagnostics: ForecastDiagnostics; observedValues: readonly number[]
}

function contributors(definitions: readonly FeatureDefinition[], model: Model | undefined, feedback: ReadonlyMap<string, { weight: number; review?: RelationshipReview }>, target: ForecastTarget): ForecastFeatureSummary[] {
  if (!model) return []
  return definitions.map((feature, index) => ({ key: feature.key, label: feature.label, coefficient: model.weights[index] ?? 0,
    source: (feature.source?.trackableId === target.trackableId ? 'self-history' : feature.transformation.kind === 'calendar' ? 'calendar' : 'relationship') as ForecastFeatureSummary['source'],
    ...(feedback.get(feature.key)?.review ? { reviewWeight: feedback.get(feature.key)!.weight } : {}) }))
    .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient) || a.key.localeCompare(b.key)).slice(0, 4)
}

function emptyDiagnostics(observations = 0): ForecastDiagnostics { return { usableObservations: observations, missingness: 1, folds: [], reviewedFeatureFeedback: [], excludedFeatureKeys: [] } }

function scalarForecast(target: ForecastTarget, categoryId: string | undefined, targetValues: ReadonlyMap<string, AnalysisValue>, dates: readonly string[], frame: ReturnType<typeof generateFeatureFrame>, definitions: readonly FeatureDefinition[], feedback: ReadonlyMap<string, { weight: number; review?: RelationshipReview }>, request: ForecastRequest, policy: ForecastPolicy): ScalarForecastOutcome {
  const kind: ScalarKind = target.kind === 'binary' || categoryId ? 'binary' : 'numeric'
  const rows = new Map(frame.rows.map((row) => [row.date, row]))
  const asNumber = (value: number | boolean | null | undefined): number | null => typeof value === 'boolean' ? Number(value) : typeof value === 'number' && Number.isFinite(value) ? value : null
  const observed = dates.flatMap((date) => { const value = targetValues.get(date); const y = value ? valueFor(target, value, categoryId) : null; return y === null ? [] : [{ date, y, x: [] as number[] }] })
  const raw = dates.flatMap((date) => { const value = targetValues.get(date); const row = rows.get(date); const y = value ? valueFor(target, value, categoryId) : null; const x = row ? definitions.map((definition) => asNumber(row.cells[definition.key]?.value)) : []; return y === null || x.some((item) => item === null) ? [] : [{ date, y, x: x as number[] }] })
  const span = dates.length ? dateNumber(dates.at(-1)!) - dateNumber(dates[0]) + 1 : 0
  const observedValues = observed.map((point) => point.y)
  const warnings = baselineEligibility(target, observed, request.historyCutoffDate ?? request.asOfDate, policy)
  const missingness = span ? 1 - observed.length / span : 1
  const positives = observedValues.filter(Boolean).length
  const limitedVariation = kind === 'binary' ? Math.min(positives, observed.length - positives) < policy.minimumClassCases : new Set(observedValues).size < 2
  if (warnings.length) return { kind, folds: [], baselineModel: kind === 'binary' ? 'recent-prevalence' : 'recent-mean', warnings, diagnostics: { ...emptyDiagnostics(observed.length), missingness, limitedVariation }, observedValues }
  const baselineFolds = folds(observed, kind, policy, policy.regularization[0] ?? 0)
  const validated = baselineFolds.length >= policy.minimumFolds
  const base = baseline(observedValues, kind, policy)
  const baseScore = validated ? mean(baselineFolds.map((fold) => fold.baselineScore)) : undefined
  const fallback = (warning: string): ScalarForecastOutcome => ({ kind, prediction: base.value, modelKind: 'baseline', folds: baselineFolds, baselineScore: baseScore, score: baseScore, improvement: 0, baselineModel: base.model, warnings: [warning], diagnostics: { ...emptyDiagnostics(observed.length), missingness, folds: baselineFolds, capability: validated ? 'validated' : 'basic', limitedVariation }, observedValues })
  if (!validated) return fallback(limitedVariation ? 'Only one outcome has been common so far; this is a smoothed recent-history estimate.' : 'This is a rough estimate from recent recordings; there is not enough history for a holdout check yet.')
  if (limitedVariation) return fallback('There is too little outcome variation for a predictor model; recent history gives a smoothed estimate.')
  if (missingness > policy.maximumMissingness) return fallback('Recording gaps limit predictor modeling; the recent-history estimate remains available.')
  const validation = policy.regularization.map((regularization) => ({ regularization, folds: folds(raw, kind, policy, regularization, true) })).filter((item) => item.folds.length >= policy.minimumFolds)
  if (!validation.length) return fallback('Predictor history is incomplete; the recent-history estimate remains available.')
  // Tune on earlier folds only; the latest fold remains an honest final temporal check.
  const chosen = validation.sort((a, b) => mean(a.folds.slice(0, -1).map((fold) => fold.modelScore)) - mean(b.folds.slice(0, -1).map((fold) => fold.modelScore)) || a.regularization - b.regularization)[0]
  const baselineScore = mean(chosen.folds.map((fold) => fold.baselineScore)); const modelScore = mean(chosen.folds.map((fold) => fold.modelScore)); const improvement = baselineScore > 0 ? (baselineScore - modelScore) / baselineScore : 0
  const finalRow = rows.get(request.forecastDate); const forecastX = finalRow ? definitions.map((definition) => asNumber(finalRow.cells[definition.key]?.value)) : []
  if (!finalRow || forecastX.some((item) => item === null)) return fallback('Some predictor values are unavailable for tomorrow; using recent history.')
  const finalModel = fitModel(raw, kind, chosen.regularization)
  const useModel = improvement >= .02 && chosen.folds.filter((fold) => fold.modelScore < fold.baselineScore).length / chosen.folds.length >= .6
  const prediction = useModel ? finalModel.predict(forecastX as number[]) : base.value
  const reviewedFeatureFeedback = definitions.flatMap((feature) => { const item = feedback.get(feature.key); return item?.review ? [{ featureKey: feature.key, judgment: item.review.judgment, confidence: item.review.confidence, weight: item.weight, validationOverrode: !useModel || Math.abs(item.weight) > 0 && !contributors(definitions, finalModel, feedback, target).some((contributor) => contributor.key === feature.key) }] : [] })
  return { prediction, model: useModel ? finalModel : undefined, kind, modelKind: useModel ? finalModel.kind : 'baseline', folds: chosen.folds, baselineScore, score: useModel ? modelScore : baselineScore, improvement: useModel ? improvement : 0, baselineModel: base.model, warnings: useModel ? [] : ['Recent history was more reliable than the tested predictors.'], diagnostics: { usableObservations: observed.length, missingness, folds: chosen.folds, reviewedFeatureFeedback, excludedFeatureKeys: [], capability: useModel ? 'model' : 'validated', limitedVariation }, observedValues }
}

function forecastOne(input: TrendsData, descriptor: AnalysisSeriesDescriptor, request: ForecastRequest, policy: ForecastPolicy): ForecastResult {
  const cutoffStamp = request.asOfTimestamp ?? `${request.asOfDate}T23:59:59.999Z`
  const snapshot = snapshotForFeatureCutoff(input, request.asOfDate, cutoffStamp)
  const historyCutoffDate = request.historyCutoffDate ?? request.asOfDate
  const track = buildAnalysisTrack(snapshot, descriptor, 'all', historyCutoffDate)
  const target = targetFor(descriptor, track.values, snapshot)
  const generatedAt = cutoffStamp
  if (!target) return { status: 'not-forecastable', target: { descriptorId: descriptor.id, trackableId: descriptor.trackableId, label: descriptor.name, measurementType: descriptor.measurementType, kind: 'numeric' }, forecastDate: request.forecastDate, generatedAt, dataCutoffDate: request.asOfDate, baselineModel: 'recent-mean', contributors: [], warnings: ['This Trackable does not yet have a defensible daily forecast representation.'], diagnostics: emptyDiagnostics() }
  const first = track.values.map((value) => value.localDate).sort().at(0) ?? request.asOfDate
  const frame = generateFeatureFrame(snapshot, { startDate: first, endDate: request.forecastDate, asOfDate: request.forecastDate, targetTrackableId: target.trackableId })
  // Relationship discovery narrows external predictors, but only cutoff-safe lag definitions may enter the forecast.
  let approvedRelationshipKeys = new Set<string>()
  const regimeStarts = new Map<string, string>()
  try {
    const catalog = discoverRelationships(snapshot, { targetDescriptorId: descriptor.id, startDate: first, endDate: historyCutoffDate, asOfDate: historyCutoffDate, asOfTimestamp: cutoffStamp, evaluateCurrentRegime: true })
    approvedRelationshipKeys = new Set(catalog.ranked.filter((candidate) => candidate.status !== 'screened_out' && candidate.predictor.transformation.kind === 'lag').map((candidate) => candidate.predictor.key))
    for (const [id, regimes] of Object.entries(catalog.regimes)) { const current = regimes.find((regime) => regime.current); if (current) regimeStarts.set(id, current.startDate) }
  } catch { /* Forecasting can still use target history and known calendar features. */ }
  const selection = forecastFeatures(frame.catalog, target, request.reviews ?? [], policy.maximumPredictors, approvedRelationshipKeys, request.horizon ?? 1)
  const dates = [...new Set(track.values.map((value) => value.localDate))].sort(); const values = latestValues(track.values)
  const latestAge = dates.length ? dateNumber(request.asOfDate) - dateNumber(dates.at(-1)!) : Number.POSITIVE_INFINITY
  const scalarFor = (categoryId?: string) => {
    const full = scalarForecast(target, categoryId, values, dates, frame, selection.definitions, selection.feedback, request, policy)
    const regimeKey = `${encodeURIComponent(descriptor.id)}/${encodeURIComponent(categoryId ?? '')}`
    const start = regimeStarts.get(regimeKey); const currentDates = start ? dates.filter((date) => date >= start) : []
    if (!start || currentDates.length < policy.minimumTraining + policy.minimumValidation * policy.minimumFolds) return { result: full, strategy: 'full-history' as const }
    const current = scalarForecast(target, categoryId, values, currentDates, frame, selection.definitions, selection.feedback, request, policy)
    return current.prediction !== undefined && current.score !== undefined && full.score !== undefined && current.score < full.score * .98 ? { result: current, strategy: 'current-regime' as const } : { result: full, strategy: 'full-history' as const }
  }
  if (target.kind === 'nominal' || target.kind === 'multiselect') {
    const individual = (target.options ?? []).map((option) => ({ option, ...scalarFor(option.id) }))
    const usable = individual.filter((item) => item.result.prediction !== undefined)
    if (!usable.length) { const firstResult = individual[0]?.result; return { status: 'insufficient-history', target, forecastDate: request.forecastDate, generatedAt, dataCutoffDate: request.asOfDate, baselineModel: 'recent-prevalence', contributors: [], warnings: firstResult?.warnings ?? ['Trace needs more category history before forecasting this.'], diagnostics: firstResult?.diagnostics ?? emptyDiagnostics() } }
    let probabilities = usable.map((item) => ({ id: item.option.id, label: item.option.label, probability: clamp(item.result.prediction!) }))
    if (target.kind === 'nominal') { const total = probabilities.reduce((sum, item) => sum + item.probability, 0); probabilities = probabilities.map((item) => ({ ...item, probability: total ? item.probability / total : 1 / probabilities.length })) }
    const baselineScore = usable.every((item) => item.result.baselineScore !== undefined) ? mean(usable.map((item) => item.result.baselineScore!)) : undefined
    const validationScore = usable.every((item) => item.result.score !== undefined) ? mean(usable.map((item) => item.result.score!)) : undefined
    const improvement = mean(usable.map((item) => item.result.improvement ?? 0)); const allBaseline = usable.every((item) => item.result.modelKind === 'baseline')
    const concentrationUncertainty = target.kind === 'nominal' ? 1 - Math.max(...probabilities.map((item) => item.probability)) : mean(probabilities.map((item) => 4 * item.probability * (1 - item.probability)))
    const uncertainty = Math.max(concentrationUncertainty, validationScore === undefined ? 0 : Math.min(1, validationScore * 4))
    const capability = usable.some((item) => item.result.diagnostics.capability === 'basic') ? 'basic' : allBaseline ? 'validated' : 'model'
    return { status: 'ready', target, forecastDate: request.forecastDate, generatedAt, dataCutoffDate: request.asOfDate, prediction: { kind: target.kind, probabilities: probabilities.sort((a, b) => b.probability - a.probability || a.label.localeCompare(b.label)) }, confidence: confidence(mean(usable.map((item) => item.result.diagnostics.usableObservations)), improvement, usable[0].result.folds.length, uncertainty, capability, latestAge), selectedModelKind: allBaseline ? 'baseline' : 'logistic', baselineModel: 'recent-prevalence', validationMetric: target.kind === 'nominal' ? 'multiclass-brier' : 'brier', validationScore, baselineScore, improvement, regimeStrategy: usable.some((item) => item.strategy === 'current-regime') ? 'current-regime' : 'full-history', contributors: contributors(selection.definitions, usable.find((item) => item.result.model)?.result.model, selection.feedback, target), warnings: [...new Set(usable.flatMap((item) => item.result.warnings))], diagnostics: { ...usable[0].result.diagnostics, capability, uncertaintyMethod: 'not-applicable', limitedVariation: usable.some((item) => item.result.diagnostics.limitedVariation), excludedFeatureKeys: selection.excluded } }
  }
  const { result, strategy } = scalarFor()
  if (result.prediction === undefined) return { status: 'insufficient-history', target, forecastDate: request.forecastDate, generatedAt, dataCutoffDate: request.asOfDate, baselineModel: result.baselineModel, contributors: [], warnings: result.warnings, diagnostics: { ...result.diagnostics, excludedFeatureKeys: selection.excluded } }
  const interval = result.kind === 'numeric' ? numericUncertainty(result, target, policy) : undefined
  const uncertainty = interval?.widthFraction ?? Math.max(4 * result.prediction * (1 - result.prediction), result.score === undefined ? 0 : Math.min(1, result.score * 4))
  return { status: 'ready', target, forecastDate: request.forecastDate, generatedAt, dataCutoffDate: request.asOfDate, prediction: result.kind === 'binary' ? { kind: 'binary', probability: clamp(result.prediction) } : { kind: target.kind === 'ordinal' ? 'ordinal' : 'numeric', estimate: result.prediction, likelyLow: interval!.low, likelyHigh: interval!.high }, confidence: confidence(result.diagnostics.usableObservations, result.improvement ?? 0, result.folds.length, uncertainty, result.diagnostics.capability ?? 'basic', latestAge), selectedModelKind: result.modelKind, baselineModel: result.baselineModel, validationMetric: result.kind === 'binary' ? 'brier' : 'mae', validationScore: result.score, baselineScore: result.baselineScore, improvement: result.improvement, regimeStrategy: strategy, contributors: contributors(selection.definitions, result.model, selection.feedback, target), warnings: result.warnings, diagnostics: { ...result.diagnostics, uncertaintyMethod: interval?.method ?? 'not-applicable', uninformativeRange: interval?.uninformative, excludedFeatureKeys: selection.excluded } }
}

/** Forecasts date D+1 from a strict end-of-D snapshot. It is also the historical backtesting API. */
export function forecastTargetAsOf(data: TrendsData, targetDescriptorId: string, asOfDate: string, request: Omit<ForecastRequest, 'forecastDate' | 'asOfDate'> = {}): ForecastResult {
  const descriptor = analysisSeriesOptions(data).find((item) => item.id === targetDescriptorId)
  if (!descriptor) throw new Error(`Unknown forecast target: ${targetDescriptorId}`)
  return forecastOne(data, descriptor, { ...request, asOfDate, forecastDate: tomorrow(asOfDate) }, policyFor(request.policy))
}

export function forecastTomorrow(data: TrendsData, request: Omit<ForecastRequest, 'forecastDate'>): readonly ForecastResult[] {
  const policy = policyFor(request.policy); const selected = new Set(request.targetDescriptorIds ?? [])
  const confidenceRank: Record<ForecastConfidence, number> = { high: 2, moderate: 1, low: 0 }
  return analysisSeriesOptions(data).filter((descriptor) => !descriptor.ownerTrackableId && (!selected.size || selected.has(descriptor.id))).map((descriptor) => forecastOne(data, descriptor, { ...request, forecastDate: tomorrow(request.asOfDate) }, policy))
    .sort((a, b) => confidenceRank[b.confidence ?? 'low'] - confidenceRank[a.confidence ?? 'low'] || a.target.label.localeCompare(b.target.label))
}
