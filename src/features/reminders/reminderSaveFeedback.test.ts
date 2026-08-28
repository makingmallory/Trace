import { describe, expect, it } from 'vitest'
import { shouldShowReminderSaved } from './reminderSaveFeedback.ts'

describe('reminder save feedback', () => {
  it('shows success only after an enabled reminder has been scheduled', () => {
    expect(shouldShowReminderSaved({ config: { enabled: true, time: '21:00' }, permission: 'granted', outcome: 'enabled' }, true)).toBe(true)
    expect(shouldShowReminderSaved({ config: { enabled: false, time: '21:00' }, permission: 'denied', outcome: 'permission-blocked' }, true)).toBe(false)
  })

  it('confirms a disabled reminder only after cancellation/persistence completed', () => {
    expect(shouldShowReminderSaved({ config: { enabled: false, time: '21:00' }, permission: 'granted', outcome: 'disabled' }, false)).toBe(true)
  })
})
