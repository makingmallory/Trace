import type { RelationshipFold, RelationshipPolicy, TargetKind } from './relationshipTypes.ts'
import type { FeatureMissingness } from '../features/featureTypes.ts'

export interface AlignedPoint { date: string; x: number; y: number; mapped: boolean; predictorStatus?: FeatureMissingness }
const average = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length
const clamp = (value: number): number => Math.max(.001, Math.min(.999, value))

export function pearson(x: readonly number[], y: readonly number[]): number | null {
  if (x.length < 2 || x.length !== y.length) return null
  const mx = average(x); const my = average(y)
  const numerator = x.reduce((sum, value, index) => sum + (value - mx) * (y[index] - my), 0)
  const dx = x.reduce((sum, value) => sum + (value - mx) ** 2, 0)
  const dy = y.reduce((sum, value) => sum + (value - my) ** 2, 0)
  return dx > 0 && dy > 0 ? numerator / Math.sqrt(dx * dy) : null
}

function ranks(values: readonly number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index)
  const result = Array<number>(values.length)
  for (let first = 0; first < sorted.length;) {
    let last = first + 1
    while (last < sorted.length && sorted[last].value === sorted[first].value) last++
    for (let index = first; index < last; index++) result[sorted[index].index] = (first + last - 1) / 2
    first = last
  }
  return result
}

export function spearman(x: readonly number[], y: readonly number[]): number | null { return pearson(ranks(x), ranks(y)) }

function baseline(history: readonly number[], kind: TargetKind): number {
  return kind === 'binary' ? (history.reduce((sum, value) => sum + value, 0) + 1) / (history.length + 2) : average(history.slice(-7))
}

function fitEffect(training: readonly AlignedPoint[], kind: TargetKind): { center: number; effect: number } {
  const center = average(training.map((point) => point.x))
  const history: number[] = []
  let numerator = 0; let denominator = 0
  for (const point of training) {
    if (history.length >= 2) {
      const centered = point.x - center
      numerator += centered * (point.y - baseline(history, kind))
      denominator += centered * centered
    }
    history.push(point.y)
  }
  return { center, effect: denominator > 0 ? numerator / (denominator + 1e-9) : 0 }
}

export function walkForward(points: readonly AlignedPoint[], kind: TargetKind, policy: RelationshipPolicy): readonly RelationshipFold[] {
  if (points.length < policy.minimumTraining + policy.minimumValidation * policy.minimumFolds) return []
  const remaining = points.length - policy.minimumTraining
  const block = Math.max(policy.minimumValidation, Math.floor(remaining / policy.maximumFolds))
  const folds: RelationshipFold[] = []
  for (let endTrain = policy.minimumTraining; endTrain + policy.minimumValidation <= points.length && folds.length < policy.maximumFolds; endTrain += block) {
    const train = points.slice(0, endTrain)
    const validation = points.slice(endTrain, Math.min(points.length, endTrain + block))
    let baselineLoss = 0; let candidateLoss = 0
    let effect: number
    if (kind === 'ordinal') {
      // Score each ordered boundary as a binary event. No distance between category ranks is used.
      const thresholds = [...new Set(train.map((point) => point.y))].sort((a, b) => a - b).slice(0, -1)
      const effects: number[] = []
      for (const threshold of thresholds) {
        const indicators = train.map((point) => ({ ...point, y: Number(point.y > threshold) }))
        const fitted = fitEffect(indicators, 'binary')
        effects.push(fitted.effect)
        const history = indicators.map((point) => point.y)
        for (const point of validation) {
          const actual = Number(point.y > threshold)
          const base = baseline(history, 'binary')
          const predicted = base + fitted.effect * (point.x - fitted.center)
          baselineLoss += (clamp(base) - actual) ** 2
          candidateLoss += (clamp(predicted) - actual) ** 2
          history.push(actual)
        }
      }
      effect = effects.length ? average(effects) : 0
      baselineLoss /= Math.max(1, thresholds.length)
      candidateLoss /= Math.max(1, thresholds.length)
    } else {
      const fitted = fitEffect(train, kind)
      effect = fitted.effect
      const history = train.map((point) => point.y)
      for (const point of validation) {
        const base = baseline(history, kind)
        const predicted = base + fitted.effect * (point.x - fitted.center)
        baselineLoss += kind === 'binary' ? (clamp(base) - point.y) ** 2 : Math.abs(base - point.y)
        candidateLoss += kind === 'binary' ? (clamp(predicted) - point.y) ** 2 : Math.abs(predicted - point.y)
        // Once a later date arrives, its earlier observed outcome is available to the target-only baseline.
        history.push(point.y)
      }
    }
    const baselineScore = baselineLoss / validation.length
    const candidateScore = candidateLoss / validation.length
    folds.push({ trainStart: train[0].date, trainEnd: train.at(-1)!.date, validationStart: validation[0].date, validationEnd: validation.at(-1)!.date,
      trainingCount: train.length, validationCount: validation.length, baselineScore, candidateScore,
      improvement: baselineScore > 0 ? (baselineScore - candidateScore) / baselineScore : 0, effect })
  }
  return folds
}

export function validationSummary(folds: readonly RelationshipFold[]): { baseline: number; candidate: number; improvement: number; winRate: number; directionConsistency: number; effectConsistency: number } | null {
  if (!folds.length) return null
  const total = folds.reduce((sum, fold) => sum + fold.validationCount, 0)
  const baseline = folds.reduce((sum, fold) => sum + fold.baselineScore * fold.validationCount, 0) / total
  const candidate = folds.reduce((sum, fold) => sum + fold.candidateScore * fold.validationCount, 0) / total
  const signs = folds.map((fold) => Math.sign(fold.effect)).filter(Boolean)
  const positive = signs.filter((sign) => sign > 0).length
  const negative = signs.length - positive
  const magnitudes = folds.map((fold) => Math.abs(fold.effect))
  const meanMagnitude = average(magnitudes)
  return { baseline, candidate, improvement: baseline > 0 ? (baseline - candidate) / baseline : 0,
    winRate: folds.filter((fold) => fold.improvement > 0).length / folds.length,
    directionConsistency: signs.length ? Math.max(positive, negative) / signs.length : 0,
    effectConsistency: meanMagnitude > 0 ? Math.max(0, 1 - Math.sqrt(average(magnitudes.map((value) => (value - meanMagnitude) ** 2))) / meanMagnitude) : 0 }
}
