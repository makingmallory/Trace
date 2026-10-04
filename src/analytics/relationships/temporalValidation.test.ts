import { describe, expect, it } from 'vitest'
import { defaultRelationshipPolicy } from './relationshipDiscovery.ts'
import { pearson, spearman, validationSummary, walkForward, type AlignedPoint } from './temporalValidation.ts'

const date = (index: number): string => new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)
const points = (count: number, outcome: (index: number, x: number) => number): AlignedPoint[] => Array.from({ length: count }, (_, index) => {
  const x = Math.sin(index * 1.7) * 4 + Math.cos(index * .31)
  return { date: date(index), x, y: outcome(index, x), mapped: false }
})

describe('walk-forward relationship validation', () => {
  it('uses expanding chronological training windows and several later validation blocks', () => {
    const folds = walkForward(points(90, (_, x) => x * 3), 'numeric', defaultRelationshipPolicy)
    expect(folds.length).toBeGreaterThanOrEqual(3)
    expect(folds.every((fold) => fold.trainEnd < fold.validationStart && fold.validationStart <= fold.validationEnd)).toBe(true)
    expect(folds.slice(1).every((fold, index) => fold.trainEnd > folds[index].trainEnd && fold.validationStart > folds[index].validationEnd)).toBe(true)
    expect(validationSummary(folds)!.improvement).toBeGreaterThan(.5)
  })

  it('keeps a future target change out of earlier fold fitting and declines too few folds', () => {
    const early = points(42, (_, x) => x)
    const changed = [...early, ...points(18, (_, x) => -x).map((point, index) => ({ ...point, date: date(42 + index) }))]
    const original = walkForward(early, 'numeric', defaultRelationshipPolicy)
    const later = walkForward(changed, 'numeric', defaultRelationshipPolicy)
    expect(later[0].trainEnd).toBe(original[0].trainEnd)
    expect(later[0].effect).toBeCloseTo(original[0].effect)
    expect(walkForward(points(28, (_, x) => x), 'numeric', defaultRelationshipPolicy)).toEqual([])
    expect(validationSummary(later)!.directionConsistency).toBeLessThanOrEqual(1)
  })

  it('uses rank robustness and binary Brier losses', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 100])).toBe(1)
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
    const folds = walkForward(points(90, (_, x) => Number(x > 0)), 'binary', defaultRelationshipPolicy)
    expect(folds.every((fold) => fold.candidateScore >= 0 && fold.candidateScore <= 1)).toBe(true)
    expect(validationSummary(folds)!.candidate).toBeLessThan(validationSummary(folds)!.baseline)
  })
})
