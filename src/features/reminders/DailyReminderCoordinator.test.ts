import { describe, expect, it, vi } from 'vitest'
import { InMemoryDataRepository } from '../../data/local/InMemoryDataRepository.ts'
import type { DailyReminderNotificationAdapter, NotificationPermissionState } from './DailyReminderCoordinator.ts'
import { DailyReminderCoordinator } from './DailyReminderCoordinator.ts'

const stamp = '2026-08-24T12:00:00.000Z'

class FakeNotifications implements DailyReminderNotificationAdapter {
  permission: NotificationPermissionState = 'prompt'
  requestedPermission: NotificationPermissionState = 'granted'
  checkPermission = vi.fn(async () => this.permission)
  requestPermission = vi.fn(async () => this.requestedPermission)
  replaceDailyReminder = vi.fn(async (_time: string) => undefined)
  cancelDailyReminder = vi.fn(async () => undefined)
  isSupported(): boolean { return true }
}

async function setup(enabled = false) {
  const repository = new InMemoryDataRepository()
  await repository.save('settings', {
    id: 'settings', schemaVersion: 2, themeId: 'fantasy', reducedMotion: false, locale: 'en-US', dateFormat: 'local', timeFormat: '12-hour', firstDayOfWeek: 0, units: {},
    dailyCheckInReminder: { enabled, time: '21:00' }, createdAt: stamp, updatedAt: stamp, deletedAt: null, revision: 1,
  })
  const notifications = new FakeNotifications()
  return { repository, notifications, coordinator: new DailyReminderCoordinator(repository, notifications) }
}

describe('DailyReminderCoordinator', () => {
  it('requests Android permission and schedules only after it is granted', async () => {
    const { repository, notifications, coordinator } = await setup()
    const result = await coordinator.update({ enabled: true, time: '20:30' })

    expect(notifications.requestPermission).toHaveBeenCalledOnce()
    expect(notifications.replaceDailyReminder).toHaveBeenCalledWith('20:30')
    expect(result).toMatchObject({ config: { enabled: true, time: '20:30' }, permission: 'granted', outcome: 'enabled' })
    expect((await repository.getById('settings', 'settings'))?.dailyCheckInReminder?.enabled).toBe(true)
  })

  it('keeps the preference off and cancels pending work when permission is denied', async () => {
    const { repository, notifications, coordinator } = await setup()
    notifications.requestedPermission = 'denied'
    const result = await coordinator.update({ enabled: true, time: '21:00' })

    expect(result).toMatchObject({ config: { enabled: false }, outcome: 'permission-blocked' })
    expect(notifications.replaceDailyReminder).not.toHaveBeenCalled()
    expect(notifications.cancelDailyReminder).toHaveBeenCalledOnce()
    expect((await repository.getById('settings', 'settings'))?.dailyCheckInReminder?.enabled).toBe(false)
  })

  it('reconciles a stale enabled preference when Android permission is missing', async () => {
    const { repository, notifications, coordinator } = await setup(true)
    notifications.permission = 'denied'
    const result = await coordinator.reconcile()

    expect(result.config.enabled).toBe(false)
    expect(notifications.cancelDailyReminder).toHaveBeenCalledOnce()
    expect(notifications.replaceDailyReminder).not.toHaveBeenCalled()
    expect((await repository.getById('settings', 'settings'))?.dailyCheckInReminder?.enabled).toBe(false)
  })

  it('verifies scheduling again when an enabled granted reminder is reconciled', async () => {
    const { notifications, coordinator } = await setup(true)
    notifications.permission = 'granted'

    await coordinator.reconcile()
    expect(notifications.replaceDailyReminder).toHaveBeenCalledWith('21:00')
  })

  it('cancels the pending notification before persisting a disabled reminder', async () => {
    const { repository, notifications, coordinator } = await setup(true)
    notifications.permission = 'granted'

    const result = await coordinator.update({ enabled: false, time: '21:00' })
    expect(result.outcome).toBe('disabled')
    expect(notifications.cancelDailyReminder).toHaveBeenCalledOnce()
    expect((await repository.getById('settings', 'settings'))?.dailyCheckInReminder?.enabled).toBe(false)
  })
})
