import { describe, expect, it } from 'vitest'
import { categoricalTriggerRule, conditionIsComplete, operatorOptionsFor } from './conditionEditorModel.ts'

describe('condition editor model', () => {
  it('uses human-readable, input-aware operator options', () => {
    expect(operatorOptionsFor('boolean').map((item) => item.label)).toEqual(['Is', 'Is answered'])
    expect(operatorOptionsFor('number').map((item) => item.label)).toEqual(['Equals', 'Greater than', 'Less than', 'Is answered'])
    expect(operatorOptionsFor('single_choice').map((item) => item.label)).toEqual(['Is', 'Is not', 'Is any of', 'Is answered'])
    expect(operatorOptionsFor('multi_select').map((item) => item.label)).toEqual(['Contains', 'Contains any of', 'Is answered'])
    expect(operatorOptionsFor('number').map((item) => item.value)).not.toContain('notEquals')
  })

  it('requires at least one accepted value for multi-value conditions', () => {
    expect(conditionIsComplete({ sourceTrackableId: 'source', operator: 'anyOf', expectedValue: [] })).toBe(false)
    expect(conditionIsComplete({ sourceTrackableId: 'source', operator: 'anyOf', expectedValue: ['option-a'] })).toBe(true)
    expect(conditionIsComplete({ sourceTrackableId: 'source', operator: 'isAnswered' })).toBe(true)
  })

  it('serializes miniature answer selections to generic categorical rules without hidden defaults', () => {
    expect(categoricalTriggerRule('source', 'single_choice', ['clear', 'white'])).toEqual({ sourceTrackableId: 'source', operator: 'anyOf', expectedValue: ['clear', 'white'] })
    expect(categoricalTriggerRule('source', 'multi_select', ['left', 'right'])).toEqual({ sourceTrackableId: 'source', operator: 'containsAny', expectedValue: ['left', 'right'] })
    expect(categoricalTriggerRule('source', 'boolean', ['false'])).toEqual({ sourceTrackableId: 'source', operator: 'equals', expectedValue: false })
    expect(categoricalTriggerRule('source', 'single_choice', []).expectedValue).toEqual([])
  })
})
