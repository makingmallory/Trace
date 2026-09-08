import { describe, expect, it } from 'vitest'
import { checkInRouteForDate, checkInRouteForToday, completionDestination, historyReturnPath, resolveCheckInFocusTarget, resolveCheckInReturnTo } from './checkInNavigation.ts'

describe('Check-In completion navigation', () => {
  it('carries Home and History origins through Check-In routes', () => {
    expect(checkInRouteForToday('/')).toBe('/check-in?returnTo=%2F')
    expect(checkInRouteForDate('2026-08-09', historyReturnPath('2026-08-18'))).toBe('/history/check-in/2026-08-09?returnTo=%2Fhistory%3Fdate%3D2026-08-18')
  })

  it('keeps a stable field focus target alongside the historical date and return context', () => {
    expect(checkInRouteForDate('2026-09-02', historyReturnPath('2026-09-02'), 'field:medication-type')).toBe('/history/check-in/2026-09-02?returnTo=%2Fhistory%3Fdate%3D2026-09-02&focus=field%3Amedication-type')
    expect(resolveCheckInFocusTarget('trackable:mood')).toBe('trackable:mood')
    expect(resolveCheckInFocusTarget('Medication Type')).toBeNull()
    expect(resolveCheckInFocusTarget('field:')).toBeNull()
  })

  it('accepts allowlisted origins and keeps a History date context', () => {
    expect(resolveCheckInReturnTo('/', '/history?date=2026-08-09')).toBe('/')
    expect(resolveCheckInReturnTo('/history?date=2026-08-18', '/')).toBe('/history?date=2026-08-18')
    expect(resolveCheckInReturnTo('/settings/nightly-check-in', '/')).toBe('/settings/nightly-check-in')
  })

  it('falls back safely when no valid origin is supplied', () => {
    expect(resolveCheckInReturnTo(null, '/')).toBe('/')
    expect(resolveCheckInReturnTo('https://example.com', '/history?date=2026-08-09')).toBe('/history?date=2026-08-09')
    expect(resolveCheckInReturnTo('/settings', '/')).toBe('/')
  })

  it('returns to the stored origin only after the selected Check-In saves', () => {
    expect(completionDestination('/history?date=2026-08-18', '/history?date=2026-08-09', true)).toBe('/history?date=2026-08-18')
    expect(completionDestination('/', '/history?date=2026-08-09', true)).toBe('/')
    expect(completionDestination('/history?date=2026-08-18', '/history?date=2026-08-09', false)).toBeNull()
  })

  it('does not let a focus target replace the original History return destination', () => {
    const route = checkInRouteForDate('2026-09-02', historyReturnPath('2026-09-02'), 'trackable:mood')
    const params = new URL(`https://trace.local${route}`).searchParams
    expect(completionDestination(params.get('returnTo'), '/history?date=2026-09-02', true)).toBe('/history?date=2026-09-02')
  })
})
