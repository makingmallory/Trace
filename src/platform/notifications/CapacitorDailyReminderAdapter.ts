import { LocalNotifications, type LocalNotificationsPlugin } from '@capacitor/local-notifications'
import { DAILY_CHECK_IN_REMINDER_COPY } from '../../domain/reminders/ReminderEngine.ts'
import type { DailyReminderNotificationAdapter, NotificationPermissionState } from '../../features/reminders/DailyReminderCoordinator.ts'
import { isNativeAndroid } from '../nativeRuntime.ts'
import { dailyLocalWallClockSchedule, nextLocalWallClockOccurrence } from './localWallClockSchedule.ts'

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

  async replaceDailyReminder(time: string, options?: { requestExactAlarmPermission?: boolean }): Promise<void> {
    const schedule = dailyLocalWallClockSchedule(time)
    const nextLocalFire = nextLocalWallClockOccurrence(time)
    await this.ensureExactAlarmPermission(options?.requestExactAlarmPermission === true)
    await this.cancelDailyReminder()
    await this.plugin.schedule({ notifications: [{
      id: DAILY_CHECK_IN_NOTIFICATION_ID,
      ...DAILY_CHECK_IN_REMINDER_COPY,
      schedule,
      autoCancel: true,
      extra: { path: '/check-in', reminderId: 'daily-check-in' },
    }] })
    const pending = await this.plugin.getPending()
    const scheduled = pending.notifications.find(({ id }) => id === DAILY_CHECK_IN_NOTIFICATION_ID)
    if (!scheduled) {
      throw new Error('Android did not keep the Daily Check-In reminder scheduled.')
    }
    const nativeRule = scheduled.schedule?.on
    if (!nativeRule || nativeRule.hour !== schedule.on.hour || nativeRule.minute !== schedule.on.minute || nativeRule.second !== schedule.on.second) {
      throw new Error('Android did not retain the selected local Daily Check-In reminder time.')
    }
    if (import.meta.env.DEV) {
      console.debug('[Trace reminders] scheduled local Daily Check-In reminder', {
        selectedLocalTime: time,
        nextLocalFire: nextLocalFire.toString(),
        nativeCalendarRule: schedule.on,
      })
    }
  }

  async cancelDailyReminder(): Promise<void> {
    await this.plugin.cancel({ notifications: [{ id: DAILY_CHECK_IN_NOTIFICATION_ID }] })
  }

  private async ensureExactAlarmPermission(requestSettings: boolean): Promise<void> {
    const exact = await this.plugin.checkExactNotificationSetting()
    if (exact.exact_alarm === 'granted') return

    if (!requestSettings) throw new Error('Enable Alarms & reminders for Trace in Android Settings to keep this reminder at its selected time.')
    const updated = await this.plugin.changeExactNotificationSetting()
    if (updated.exact_alarm === 'granted') return
    throw new Error('Enable Alarms & reminders for Trace in Android Settings to schedule this reminder at its selected time.')
  }
}
