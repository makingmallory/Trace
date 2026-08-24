import { describe, expect, it } from 'vitest'
import { checkInRouteForDate, completionDestination, shouldReturnHomeAfterCompletion } from './checkInNavigation.ts'

describe('Check-In completion navigation', () => {
  it('returns home only after a new current-day Check-In completes', () => {
    expect(shouldReturnHomeAfterCompletion(false, false, true)).toBe(true)
    expect(shouldReturnHomeAfterCompletion(false, false, false)).toBe(false)
    expect(shouldReturnHomeAfterCompletion(false, true, true)).toBe(false)
    expect(shouldReturnHomeAfterCompletion(true, false, true)).toBe(false)
  })

  it('routes an explicitly selected date through the shared historical Check-In screen', () => {
    expect(checkInRouteForDate('2026-08-09')).toBe('/history/check-in/2026-08-09')
  })

  it('returns a newly completed historical Check-In to its selected History day', () => {
    expect(completionDestination(true, false, true, '2026-08-09')).toBe('/history?date=2026-08-09')
    expect(completionDestination(false, false, true, '2026-08-10')).toBe('/')
    expect(completionDestination(true, true, true, '2026-08-09')).toBeNull()
    expect(completionDestination(true, false, false, '2026-08-09')).toBeNull()
  })
})
