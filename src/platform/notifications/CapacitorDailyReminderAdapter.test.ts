import type { LocalNotificationsPlugin } from '@capacitor/local-notifications'
import { describe, expect, it, vi } from 'vitest'
import { CapacitorDailyReminderAdapter, DAILY_CHECK_IN_NOTIFICATION_ID } from './CapacitorDailyReminderAdapter.ts'

describe('CapacitorDailyReminderAdapter', () => {
  it('replaces the stable pending notification and verifies Android retained it', async () => {
    const cancel = vi.fn(async () => undefined)
    const schedule = vi.fn(async () => ({ notifications: [{ id: DAILY_CHECK_IN_NOTIFICATION_ID }] }))
    const plugin = {
      cancel,
      schedule,
      getPending: vi.fn(async () => ({ notifications: [{ id: DAILY_CHECK_IN_NOTIFICATION_ID, title: 'Daily Check-In', body: 'Reminder' }] })),
    } as unknown as LocalNotificationsPlugin

    await new CapacitorDailyReminderAdapter(plugin).replaceDailyReminder('21:05')

    expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: DAILY_CHECK_IN_NOTIFICATION_ID }] })
    expect(schedule).toHaveBeenCalledWith({ notifications: [expect.objectContaining({
      id: DAILY_CHECK_IN_NOTIFICATION_ID,
      schedule: { on: { hour: 21, minute: 5 }, allowWhileIdle: true },
    })] })
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(schedule.mock.invocationCallOrder[0])
  })

  it('fails closed when Android does not report the new reminder as pending', async () => {
    const plugin = {
      cancel: vi.fn(async () => undefined),
      schedule: vi.fn(async () => ({ notifications: [{ id: DAILY_CHECK_IN_NOTIFICATION_ID }] })),
      getPending: vi.fn(async () => ({ notifications: [] })),
    } as unknown as LocalNotificationsPlugin

    await expect(new CapacitorDailyReminderAdapter(plugin).replaceDailyReminder('21:00')).rejects.toThrow('did not keep')
  })
})
