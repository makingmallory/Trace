import type { TrendsData } from '../AnalyticsProvider.ts'
import { analysisSeriesOptions, buildAnalysisTrack, type AnalysisValue } from '../analysisModel.ts'
import type { FeatureDefinition } from '../features/featureTypes.ts'
import { generateFeatureFrame } from '../features/featureEngine.ts'
import { snapshotForFeatureCutoff } from '../features/longitudinalIndex.ts'
import type { LogRecord, Observation, ObservationAnswer, ObservationOptionSelection } from '../../domain/models/index.ts'
import { defaultForecastPolicy, forecastTargetAsOf, uninformativeForecastRange } from './forecastEngine.ts'
import { forecastFeatureAvailability } from './featureAvailability.ts'
import type { ForecastConfidence, ForecastFeatureAvailability, ForecastPrediction, ForecastRangeRequest, ForecastResult, ForecastTarget, ForecastWeekResult, HorizonForecastResult, RecursiveForecastInput } from './forecastTypes.ts'

const dayMs = 86_400_000
const dateNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / dayMs
const plusDays = (date: string, days: number): string => new Date((dateNumber(date) + days) * dayMs).toISOString().slice(0, 10)
const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
const clamp = (value: number, low = 0, high = 1): number => Math.max(low, Math.min(high, value))
const quantile = (values: readonly number[], fraction: number): number => { const sorted = [...values].sort((a, b) => a - b); if (!sorted.length) return 0; const index = (sorted.length - 1) * fraction; const low = Math.floor(index); const high = Math.ceil(index); return sorted[low] + (sorted[high] - sorted[low]) * (index - low) }
export const forecastConfigVersion = 'multi-horizon-v1'

export function forecastCacheKey(data: TrendsData, request: Pick<ForecastRangeRequest, 'asOfDate' | 'horizonDays' | 'targetDescriptorIds' | 'reviews' | 'policy'>): string {
  const entities = [data.logRecords, data.observations, data.observationSelections, data.trackables, data.trackableVersions, data.trackableOptions, data.analysisMappings].flat()
  const revision = entities.map((item) => `${item.id}:${item.updatedAt}:${item.revision}`).sort()
  const reviews = (request.reviews ?? []).map((item) => `${item.id}:${item.updatedAt}`).sort()
  return JSON.stringify([forecastConfigVersion, revision, request.asOfDate, request.horizonDays, [...(request.targetDescriptorIds ?? [])].sort(), reviews, request.policy ?? {}])
}

export function futureFeatureAvailability(feature: FeatureDefinition, target: ForecastTarget, horizon: number): ForecastFeatureAvailability {
  return forecastFeatureAvailability(feature, target, horizon)
}

function predictionUncertainty(prediction: ForecastPrediction): number {
  if (prediction.kind === 'numeric' || prediction.kind === 'ordinal') return Math.max(0, prediction.likelyHigh - prediction.likelyLow)
  if (prediction.kind === 'binary') return 4 * prediction.probability * (1 - prediction.probability)
  return mean(prediction.probabilities.map((item) => 4 * item.probability * (1 - item.probability)))
}

function recursiveInput(result: HorizonForecastResult): RecursiveForecastInput | null {
  const prediction = result.prediction
  if (!prediction) return null
  const value = prediction.kind === 'numeric' || prediction.kind === 'ordinal' ? prediction.estimate
    : prediction.kind === 'binary' ? prediction.probability
      : prediction.kind === 'nominal' ? prediction.probabilities[0]?.id ?? ''
        : prediction.probabilities.filter((item) => item.probability >= .5).map((item) => item.id).length ? prediction.probabilities.filter((item) => item.probability >= .5).map((item) => item.id) : prediction.probabilities.slice(0, 1).map((item) => item.id)
  return { sourceHorizon: result.horizon, forecastDate: result.forecastDate, kind: prediction.kind, value, uncertainty: predictionUncertainty(prediction) }
}

/** Adds a derived value only to an in-memory cutoff snapshot. Raw repository data is never changed. */
function appendRecursivePrediction(data: TrendsData, result: HorizonForecastResult, stamp: string): TrendsData {
  const prediction = result.prediction
  if (!prediction) return data
  const trackable = data.trackables.find((item) => item.id === result.target.trackableId)
  if (!trackable) return data
  const id = `derived-forecast:${result.target.descriptorId}:${result.horizon}`
  const sync = { createdAt: stamp, updatedAt: stamp, deletedAt: null, revision: 1 }
  const record: LogRecord = { ...sync, id: `${id}:record`, recordKind: 'routine', localDate: result.forecastDate, startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'app' }
  let answer: ObservationAnswer; let optionIds: readonly string[] = []
  if (prediction.kind === 'numeric' && result.target.measurementType === 'duration') answer = { state: 'answered', value: { kind: 'duration', value: prediction.estimate, unit: 'minutes' } }
  else if (prediction.kind === 'numeric' && result.target.measurementType === 'time') { const minutes = Math.round(prediction.estimate); answer = { state: 'answered', value: { kind: 'time', value: `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` } } }
  else if (prediction.kind === 'numeric') answer = { state: 'answered', value: { kind: 'number', value: prediction.estimate } }
  else if (prediction.kind === 'ordinal' && result.target.options?.length) { answer = { state: 'answered', value: { kind: 'choice', value: null } }; optionIds = [result.target.options[Math.round(prediction.estimate)]?.id ?? result.target.options[0].id] }
  else if (prediction.kind === 'ordinal') answer = { state: 'answered', value: { kind: 'scale', value: Math.round(prediction.estimate) } }
  else if (prediction.kind === 'binary') answer = { state: 'answered', value: { kind: 'boolean', value: prediction.probability >= .5 } }
  else { answer = { state: 'answered', value: { kind: 'choice', value: null } }; optionIds = prediction.kind === 'nominal' ? prediction.probabilities.slice(0, 1).map((item) => item.id) : prediction.probabilities.filter((item) => item.probability >= .5).map((item) => item.id); if (!optionIds.length) optionIds = prediction.probabilities.slice(0, 1).map((item) => item.id) }
  const observation: Observation = { ...sync, id: `${id}:observation`, logRecordId: record.id, trackableId: result.target.trackableId, trackableVersion: trackable.currentVersion, answer }
  const selections: ObservationOptionSelection[] = optionIds.map((optionId) => ({ ...sync, id: `${id}:selection:${optionId}`, observationId: observation.id, optionId }))
  return { ...data, logRecords: [...data.logRecords, record], observations: [...data.observations, observation], observationSelections: [...data.observationSelections, ...selections] }
}

function scalarValue(target: ForecastTarget, value: AnalysisValue, option?: string): number | null {
  if (option) return Number(Boolean(value.categories?.some((item) => item.id.replace(/^option:/, '') === option)))
  if (target.kind === 'binary') return value.booleanValue === undefined ? null : Number(value.booleanValue)
  return value.numericValue ?? null
}

function horizonErrors(values: readonly AnalysisValue[], target: ForecastTarget, horizon: number, option?: string): number[] {
  const byDate = new Map(values.map((value) => [value.localDate, value]))
  const ordered = [...byDate.keys()].sort(); const errors: number[] = []
  for (let index = 7; index < ordered.length; index++) {
    const cutoff = ordered[index]; const actual = byDate.get(plusDays(cutoff, horizon)); if (!actual) continue
    const history = ordered.slice(0, index + 1).map((date) => scalarValue(target, byDate.get(date)!, option)).filter((item): item is number => item !== null)
    const y = scalarValue(target, actual, option); if (y === null || !history.length) continue
    const prediction = target.kind === 'binary' || option ? (history.slice(-30).reduce((sum, item) => sum + item, 0) + 1) / (Math.min(30, history.length) + 2) : mean(history.slice(-7))
    errors.push(target.kind === 'binary' || option ? (prediction - y) ** 2 : Math.abs(prediction - y))
  }
  return errors
}

function calibratePrediction(result: ForecastResult, targetValues: readonly AnalysisValue[], horizon: number, minimumSupport: number): ForecastResult {
  const prediction = result.prediction
  if (!prediction) return result
  const optionErrors = prediction.kind === 'nominal' || prediction.kind === 'multiselect' ? prediction.probabilities.flatMap((item) => horizonErrors(targetValues, result.target, horizon, item.id)) : []
  const errors = optionErrors.length ? optionErrors : horizonErrors(targetValues, result.target, horizon)
  const calibrationError = errors.length ? mean(errors) : undefined
  let adjusted: ForecastPrediction = prediction
  if (prediction.kind === 'numeric' || prediction.kind === 'ordinal') {
    const originalRadius = Math.max(prediction.estimate - prediction.likelyLow, prediction.likelyHigh - prediction.estimate)
    const radius = errors.length >= minimumSupport ? Math.max(originalRadius, quantile(errors, .8)) : originalRadius * Math.sqrt(horizon)
    let low = result.target.minimum === undefined ? prediction.estimate - radius : Math.max(result.target.minimum, prediction.estimate - radius)
    let high = result.target.maximum === undefined ? prediction.estimate + radius : Math.min(result.target.maximum, prediction.estimate + radius)
    if (prediction.kind === 'ordinal') { low = Math.floor(low); high = Math.ceil(high) }
    adjusted = { ...prediction, likelyLow: low, likelyHigh: high }
  } else if (prediction.kind === 'binary') {
    const shrink = Math.min(.35, (horizon - 1) * .015 + (calibrationError ?? .1) * .1)
    adjusted = { ...prediction, probability: clamp(.5 + (prediction.probability - .5) * (1 - shrink)) }
  } else {
    const shrink = Math.min(.3, (horizon - 1) * .012 + (calibrationError ?? .1) * .08)
    const center = prediction.kind === 'nominal' ? 1 / Math.max(1, prediction.probabilities.length) : .5
    let probabilities = prediction.probabilities.map((item) => ({ ...item, probability: clamp(center + (item.probability - center) * (1 - shrink)) }))
    if (prediction.kind === 'nominal') { const total = probabilities.reduce((sum, item) => sum + item.probability, 0); probabilities = probabilities.map((item) => ({ ...item, probability: item.probability / total })) }
    adjusted = { ...prediction, probabilities }
  }
  const uninformative = adjusted.kind === 'numeric' || adjusted.kind === 'ordinal' ? uninformativeForecastRange(adjusted.likelyLow, adjusted.likelyHigh, result.target) : undefined
  return { ...result, prediction: adjusted, diagnostics: { ...result.diagnostics, horizon, horizonCalibrationCount: errors.length, horizonCalibrationError: calibrationError, uninformativeRange: uninformative ?? result.diagnostics.uninformativeRange } }
}

const confidenceRank: Record<ForecastConfidence, number> = { low: 0, moderate: 1, high: 2 }
function horizonConfidence(confidence: ForecastConfidence | undefined, horizon: number, state: 'ready' | 'rough' | 'insufficient', uninformative?: boolean): ForecastConfidence | undefined {
  if (!confidence || state === 'insufficient') return undefined
  let rank = confidenceRank[confidence]
  if (horizon >= 3) rank--; if (horizon >= 6) rank--; if (state === 'rough' || uninformative) rank = 0
  return (['low', 'moderate', 'high'] as const)[Math.max(0, rank)]
}

function insufficientFrom(result: ForecastResult, horizon: number, date: string): HorizonForecastResult {
  return { ...result, status: 'insufficient-history', prediction: undefined, confidence: undefined, horizon, horizonState: 'insufficient', usedRecursiveInputs: horizon > 1, forecastDate: date, warnings: ['There is not enough horizon-specific evidence for this date.'], diagnostics: { ...result.diagnostics, horizon } }
}

function weekSummary(days: readonly HorizonForecastResult[]): { confidence: ForecastConfidence; text: string; summary: string } {
  const useful = days.filter((day) => day.horizonState !== 'insufficient')
  const moderateThrough = useful.filter((day) => confidenceRank[day.confidence ?? 'low'] >= 1).at(-1)
  const confidence: ForecastConfidence = useful.length === 7 && useful.every((day) => day.confidence === 'high') ? 'high' : moderateThrough ? 'moderate' : 'low'
  const text = moderateThrough ? `${moderateThrough.confidence === 'high' ? 'Strong' : 'Moderate'} confidence through ${new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date(`${moderateThrough.forecastDate}T12:00:00`))}; lower later in the week.` : useful.length ? 'A rough outlook is available; uncertainty is higher across the week.' : 'Not enough recent evidence for a weekly outlook yet.'
  return { confidence, text, summary: `${useful.length} of 7 days have a usable estimate.` }
}

function forecastTargetRangeFromSnapshot(snapshot: TrendsData, targetDescriptorId: string, cutoffDate: string, horizonDays: number, stamp: string, request: Omit<ForecastRangeRequest, 'asOfDate' | 'horizonDays'>): ForecastWeekResult {
  const descriptor = analysisSeriesOptions(snapshot).find((item) => item.id === targetDescriptorId)
  if (!descriptor) throw new Error(`Unknown forecast target: ${targetDescriptorId}`)
  const targetTrack = buildAnalysisTrack(snapshot, descriptor, 'all', cutoffDate)
  const historicalObservationCount = new Set(targetTrack.values.map((value) => value.localDate)).size
  const availabilityCatalog = generateFeatureFrame(snapshot, { startDate: cutoffDate, endDate: plusDays(cutoffDate, horizonDays), asOfDate: plusDays(cutoffDate, horizonDays), targetTrackableId: descriptor.trackableId }).catalog
  let working = snapshot; let stepCutoff = cutoffDate; const days: HorizonForecastResult[] = []; const recursive: RecursiveForecastInput[] = []
  for (let horizon = 1; horizon <= horizonDays; horizon++) {
    const raw = forecastTargetAsOf(working, targetDescriptorId, stepCutoff, { ...request, asOfTimestamp: stamp, horizon, historyCutoffDate: cutoffDate })
    const required = (raw.target.kind === 'numeric' || raw.target.kind === 'ordinal' ? (request.policy?.minimumBaselineNumeric ?? defaultForecastPolicy.minimumBaselineNumeric) : (request.policy?.minimumBaselineCategorical ?? defaultForecastPolicy.minimumBaselineCategorical)) + (horizon - 1) * (request.policy?.horizonObservationStep ?? defaultForecastPolicy.horizonObservationStep)
    if (historicalObservationCount < required || raw.status !== 'ready') { days.push(insufficientFrom({ ...raw, diagnostics: { ...raw.diagnostics, usableObservations: historicalObservationCount } }, horizon, plusDays(cutoffDate, horizon))); stepCutoff = plusDays(cutoffDate, horizon); continue }
    const calibrated = calibratePrediction(raw, targetTrack.values, horizon, request.policy?.minimumHorizonCalibration ?? defaultForecastPolicy.minimumHorizonCalibration)
    const calibrationCount = calibrated.diagnostics.horizonCalibrationCount ?? 0
    const horizonState = horizon === 1 && calibrated.confidence !== 'low' || calibrationCount >= (request.policy?.minimumHorizonCalibration ?? defaultForecastPolicy.minimumHorizonCalibration) && calibrated.confidence !== 'low' ? 'ready' : 'rough'
    const day: HorizonForecastResult = { ...calibrated, horizon, horizonState, usedRecursiveInputs: recursive.length > 0, confidence: horizonConfidence(calibrated.confidence, horizon, horizonState, calibrated.diagnostics.uninformativeRange), diagnostics: { ...calibrated.diagnostics, usableObservations: historicalObservationCount, recursiveInputs: [...recursive], featureAvailability: availabilityCatalog.map((feature) => ({ featureKey: feature.key, availability: futureFeatureAvailability(feature, calibrated.target, horizon) })) } }
    days.push(day)
    const inputValue = recursiveInput(day); if (inputValue) recursive.push(inputValue)
    working = appendRecursivePrediction(working, day, stamp); stepCutoff = day.forecastDate
  }
  const target = days[0]?.target ?? forecastTargetAsOf(snapshot, targetDescriptorId, cutoffDate, request).target
  const weekly = weekSummary(days)
  return { target, days, weeklyConfidence: weekly.confidence, confidenceSummary: weekly.text, summary: weekly.summary }
}

/** Deterministic historical multi-step forecast using only the end-of-cutoff snapshot and derived recursive values. */
export function forecastTargetRangeAsOf(input: TrendsData, targetDescriptorId: string, cutoffDate: string, horizonDays = 7, request: Omit<ForecastRangeRequest, 'asOfDate' | 'horizonDays'> = {}): ForecastWeekResult {
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 7) throw new Error('Forecast horizon must be between 1 and 7 days.')
  const stamp = request.asOfTimestamp ?? `${cutoffDate}T23:59:59.999Z`
  return forecastTargetRangeFromSnapshot(snapshotForFeatureCutoff(input, cutoffDate, stamp), targetDescriptorId, cutoffDate, horizonDays, stamp, request)
}

export function forecastRange(input: TrendsData, request: ForecastRangeRequest): readonly ForecastWeekResult[] {
  if (!Number.isInteger(request.horizonDays) || request.horizonDays < 1 || request.horizonDays > 7) throw new Error('Forecast horizon must be between 1 and 7 days.')
  const stamp = request.asOfTimestamp ?? `${request.asOfDate}T23:59:59.999Z`
  const snapshot = snapshotForFeatureCutoff(input, request.asOfDate, stamp)
  const selected = new Set(request.targetDescriptorIds ?? [])
  return analysisSeriesOptions(snapshot).filter((descriptor) => !descriptor.ownerTrackableId && (!selected.size || selected.has(descriptor.id)))
    .map((descriptor) => forecastTargetRangeFromSnapshot(snapshot, descriptor.id, request.asOfDate, request.horizonDays, stamp, request))
}
