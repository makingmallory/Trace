import { describe, expect, it } from 'vitest'
import type { ConditionalRule, Observation, ObservationOptionSelection, ObservationValue } from '../models/index.ts'
import { buildRuleAnswers, evaluateConditionalRule } from './conditionalRules.ts'

function observation(value: ObservationValue): Observation {
  return { id: 'observation', logRecordId: 'record', trackableId: 'source', trackableVersion: 1, answer: { state: 'answered', value }, createdAt: '2026-08-10T12:00:00.000Z', updatedAt: '2026-08-10T12:00:00.000Z', deletedAt: null, revision: 1 }
}

function evaluate(rule: Omit<ConditionalRule, 'sourceTrackableId'>, value: ObservationValue, selections: readonly ObservationOptionSelection[] = []) {
  return evaluateConditionalRule({ sourceTrackableId: 'source', ...rule }, buildRuleAnswers([observation(value)], selections))
}

describe('conditional rules', () => {
  it('supports equality, inequality, numeric comparisons, and answered state without truthiness shortcuts', () => {
    expect(evaluate({ operator: 'equals', expectedValue: false }, { kind: 'boolean', value: false })).toBe(true)
    expect(evaluate({ operator: 'notEquals', expectedValue: 1 }, { kind: 'scale', value: 0 })).toBe(true)
    expect(evaluate({ operator: 'greaterThan', expectedValue: 0 }, { kind: 'number', value: 2 })).toBe(true)
    expect(evaluate({ operator: 'lessThan', expectedValue: 1 }, { kind: 'number', value: 0 })).toBe(true)
    expect(evaluate({ operator: 'isAnswered' }, { kind: 'number', value: 0 })).toBe(true)
  })

  it('supports contains for text and stable option selections', () => {
    expect(evaluate({ operator: 'contains', expectedValue: 'rain' }, { kind: 'text', value: 'light rain' })).toBe(true)
    const selection: ObservationOptionSelection = { id: 'selection', observationId: 'observation', optionId: 'option-a', createdAt: '2026-08-10T12:00:00.000Z', updatedAt: '2026-08-10T12:00:00.000Z', deletedAt: null, revision: 1 }
    expect(evaluate({ operator: 'contains', expectedValue: 'option-a' }, { kind: 'choice', value: null }, [selection])).toBe(true)
    expect(evaluate({ operator: 'equals', expectedValue: 'option-a' }, { kind: 'choice', value: null }, [selection])).toBe(true)
  })

  it('matches any accepted categorical value without duplicated rules', () => {
    const selection: ObservationOptionSelection = { id: 'selection', observationId: 'observation', optionId: 'medium', createdAt: '2026-08-10T12:00:00.000Z', updatedAt: '2026-08-10T12:00:00.000Z', deletedAt: null, revision: 1 }
    expect(evaluate({ operator: 'anyOf', expectedValue: ['light', 'medium', 'heavy'] }, { kind: 'choice', value: null }, [selection])).toBe(true)
    expect(evaluate({ operator: 'containsAny', expectedValue: ['left', 'medium'] }, { kind: 'choice', value: null }, [selection])).toBe(true)
    expect(evaluate({ operator: 'containsAny', expectedValue: ['left', 'right'] }, { kind: 'choice', value: null }, [selection])).toBe(false)
  })

  it('keeps missing answers hidden, including notEquals rules', () => {
    const missing = observation({ kind: 'boolean', value: false })
    missing.answer = { state: 'unanswered' }
    const answers = buildRuleAnswers([missing], [])
    expect(evaluateConditionalRule({ sourceTrackableId: 'source', operator: 'isAnswered' }, answers)).toBe(false)
    expect(evaluateConditionalRule({ sourceTrackableId: 'source', operator: 'notEquals', expectedValue: true }, answers)).toBe(false)
  })
})
