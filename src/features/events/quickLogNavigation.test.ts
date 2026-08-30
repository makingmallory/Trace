import { describe, expect, it } from 'vitest'
import { historyReturnPath, quickLogEditPath, quickLogPickerPath, quickLogPickerReturnPath, resolveQuickLogReturnTo } from './quickLogNavigation.ts'

describe('Quick Log edit navigation', () => {
  it('carries Home as the explicit editor return route', () => {
    expect(quickLogEditPath('record/with spaces', '/')).toBe('/history/quick-log/record%2Fwith%20spaces/edit?returnTo=%2F')
    expect(resolveQuickLogReturnTo('/', '2026-08-12')).toBe('/')
  })

  it('preserves History selected-date context', () => {
    const historyPath = historyReturnPath('2026-08-12')
    expect(historyPath).toBe('/history?date=2026-08-12')
    expect(resolveQuickLogReturnTo(historyPath, '2026-08-13')).toBe(historyPath)
  })

  it('preserves a historical day across both Back hops in the create flow', () => {
    expect(quickLogPickerReturnPath('2026-08-12')).toBe('/history?date=2026-08-12')
    expect(quickLogPickerPath('2026-08-12')).toBe('/quick-log?date=2026-08-12')
    expect(quickLogPickerReturnPath('not-a-date')).toBe('/')
    expect(quickLogPickerPath('not-a-date')).toBe('/quick-log')
  })

  it('falls back to the edited record’s History day when the origin is absent or invalid', () => {
    expect(resolveQuickLogReturnTo(null, '2026-08-12')).toBe('/history?date=2026-08-12')
    expect(resolveQuickLogReturnTo('https://example.com', '2026-08-12')).toBe('/history?date=2026-08-12')
    expect(resolveQuickLogReturnTo('/settings', '2026-08-12')).toBe('/history?date=2026-08-12')
  })
})
