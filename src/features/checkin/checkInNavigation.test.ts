import { describe, expect, it } from 'vitest'
import { shouldReturnHomeAfterCompletion } from './checkInNavigation.ts'

describe('Check-In completion navigation', () => {
  it('returns home only after a new current-day Check-In completes', () => {
    expect(shouldReturnHomeAfterCompletion(false, false, true)).toBe(true)
    expect(shouldReturnHomeAfterCompletion(false, false, false)).toBe(false)
    expect(shouldReturnHomeAfterCompletion(false, true, true)).toBe(false)
    expect(shouldReturnHomeAfterCompletion(true, false, true)).toBe(false)
  })
})
