import { describe, expect, it } from 'vitest'
import type { InputType } from '../../domain/models/index.ts'
import type { Observation } from '../../domain/models/index.ts'
import { answerFromInput, questionControlKind, scalarInputValue } from './questionInput.ts'

describe('dynamic question input mapping', () => {
  it('maps every Trackable input type to an appropriate control', () => {
    const types: readonly InputType[] = ['scale', 'boolean', 'single_choice', 'multi_select', 'number', 'duration', 'time', 'text']
    expect(types.map(questionControlKind)).toEqual(['buttons', 'buttons', 'buttons', 'buttons', 'number', 'number', 'time', 'text'])
  })

  it('preserves zero and empty as different answers', () => {
    expect(answerFromInput('number', '0')).toEqual({ state: 'answered', value: { kind: 'number', value: 0 } })
    expect(answerFromInput('number', '')).toEqual({ state: 'unanswered' })
    expect(answerFromInput('duration', '0')).toEqual({ state: 'answered', value: { kind: 'duration', value: 0, unit: 'minutes' } })
  })

  it('initializes an unanswered number as empty and an answered zero as zero', () => {
    const base: Omit<Observation, 'answer'> = { id: 'observation', logRecordId: 'record', trackableId: 'number', trackableVersion: 1, createdAt: '2026-08-10T12:00:00.000Z', updatedAt: '2026-08-10T12:00:00.000Z', deletedAt: null, revision: 1 }
    expect(scalarInputValue({ ...base, answer: { state: 'unanswered' } })).toBe('')
    expect(scalarInputValue({ ...base, answer: { state: 'answered', value: { kind: 'number', value: 0 } } })).toBe(0)
  })
})
