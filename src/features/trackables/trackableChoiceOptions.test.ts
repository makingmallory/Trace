import { describe, expect, it } from 'vitest'
import { addChoiceOption, choiceAnalysisConfiguration, choiceIsOrdered, moveChoiceOption, removeChoiceFromDefault, removeChoiceOption, updateChoiceOption } from './trackableChoiceOptions.ts'

const options = [{ optionId: 'low', label: 'Low' }, { optionId: 'medium', label: 'Medium' }, { optionId: 'high', label: 'High' }]

describe('structured Trackable choice editing', () => {
  it('preserves stable identities while labels and order change', () => {
    expect(updateChoiceOption(options, 'medium', 'Moderate')[1]).toEqual({ optionId: 'medium', label: 'Moderate' })
    expect(moveChoiceOption(options, 'high', -1).map((option) => option.optionId)).toEqual(['low', 'high', 'medium'])
    expect(addChoiceOption(options, 'very-high').at(-1)).toEqual({ optionId: 'very-high', label: '' })
    expect(removeChoiceOption(options, 'medium').map((option) => option.optionId)).toEqual(['low', 'high'])
  })

  it('stores explicit order without requiring numeric interval values', () => {
    const ordered = choiceAnalysisConfiguration({ inputType: 'single_choice', options, configuration: { custom: true } }, true)
    expect(ordered).toEqual({ custom: true, analysisMeasurementType: 'ordinal', orderedOptionIds: ['low', 'medium', 'high'] })
    expect(choiceIsOrdered(ordered)).toBe(true)
    expect(choiceAnalysisConfiguration({ inputType: 'single_choice', options, configuration: ordered }, false)).toEqual({ custom: true })
  })

  it('keeps multi-select presence semantics while publishing explicit option order', () => {
    expect(choiceAnalysisConfiguration({ inputType: 'multi_select', options, configuration: {} }, true)).toEqual({ orderedOptionIds: ['low', 'medium', 'high'] })
  })

  it('removes deleted options from presentation-only defaults', () => {
    const configured = { answer: { state: 'answered' as const, value: { kind: 'choice' as const, value: null } }, selectedOptionIds: ['low', 'high'] }
    expect(removeChoiceFromDefault(configured, 'low')?.selectedOptionIds).toEqual(['high'])
    expect(removeChoiceFromDefault(configured, 'high')?.selectedOptionIds).toEqual(['low'])
  })
})
