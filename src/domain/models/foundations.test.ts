import { describe, expect, it } from 'vitest'
import { isAnsweredObservation } from './valueTypes.ts'
import type { ObservationAnswer } from './valueTypes.ts'

describe('observation meaning', () => {
  it('keeps numeric zero separate from an unanswered observation', () => {
    const zero: ObservationAnswer = {
      state: 'answered',
      value: { kind: 'number', value: 0 },
    }
    const unanswered: ObservationAnswer = { state: 'unanswered' }

    expect(isAnsweredObservation(zero)).toBe(true)
    expect(isAnsweredObservation(unanswered)).toBe(false)

    if (isAnsweredObservation(zero)) {
      expect(zero.value.value).toBe(0)
    }
  })

  it('keeps explicit No separate from missing states', () => {
    const explicitNo: ObservationAnswer = {
      state: 'answered',
      value: { kind: 'boolean', value: false },
    }
    const unknown: ObservationAnswer = { state: 'unknown' }

    expect(isAnsweredObservation(explicitNo)).toBe(true)
    expect(isAnsweredObservation(unknown)).toBe(false)

    if (isAnsweredObservation(explicitNo)) {
      expect(explicitNo.value.value).toBe(false)
    }
  })
})
