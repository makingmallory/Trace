import { LocalNotifications, type LocalNotificationsPlugin } from '@capacitor/local-notifications'
import { DAILY_CHECK_IN_REMINDER_COPY } from '../../domain/reminders/ReminderEngine.ts'
import type { DailyReminderNotificationAdapter, NotificationPermissionState } from '../../features/reminders/DailyReminderCoordinator.ts'
import { isNativeAndroid } from '../nativeRuntime.ts'

export const DAILY_CHECK_IN_NOTIFICATION_ID = 24_081_301

function permissionState(value: Awaited<ReturnType<LocalNotificationsPlugin['checkPermissions']>>['display']): NotificationPermissionState {
  return value
}

export class CapacitorDailyReminderAdapter implements DailyReminderNotificationAdapter {
  private readonly plugin: LocalNotificationsPlugin

  constructor(plugin: LocalNotificationsPlugin = LocalNotifications) { this.plugin = plugin }

  isSupported(): boolean { return isNativeAndroid() }

  async checkPermission(): Promise<NotificationPermissionState> {
    return permissionState((await this.plugin.checkPermissions()).display)
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    return permissionState((await this.plugin.requestPermissions()).display)
  }

  async replaceDailyReminder(time: string): Promise<void> {
    const [hour, minute] = time.split(':').map(Number)
    await this.cancelDailyReminder()
    await this.plugin.schedule({ notifications: [{
      id: DAILY_CHECK_IN_NOTIFICATION_ID,
      ...DAILY_CHECK_IN_REMINDER_COPY,
      schedule: { on: { hour, minute }, allowWhileIdle: true },
      autoCancel: true,
      extra: { path: '/check-in', reminderId: 'daily-check-in' },
    }] })
    const pending = await this.plugin.getPending()
    if (!pending.notifications.some(({ id }) => id === DAILY_CHECK_IN_NOTIFICATION_ID)) {
      throw new Error('Android did not keep the Daily Check-In reminder scheduled.')
    }
  }

  async cancelDailyReminder(): Promise<void> {
    await this.plugin.cancel({ notifications: [{ id: DAILY_CHECK_IN_NOTIFICATION_ID }] })
  }
}
