import type { DataRepository } from '../../data/repository/DataRepository.ts'
import type { DailyCheckInReminderConfig } from '../../domain/models/index.ts'
import { isValidReminderTime } from '../../domain/reminders/ReminderEngine.ts'
import { loadReminderSettings, saveDailyCheckInReminder } from './reminderSettings.ts'

export type NotificationPermissionState = 'granted' | 'prompt' | 'prompt-with-rationale' | 'denied' | 'not-applicable'

export interface DailyReminderNotificationAdapter {
  isSupported(): boolean
  checkPermission(): Promise<NotificationPermissionState>
  requestPermission(): Promise<NotificationPermissionState>
  replaceDailyReminder(time: string, options?: { requestExactAlarmPermission?: boolean }): Promise<void>
  cancelDailyReminder(): Promise<void>
}

export type DailyReminderOutcome = 'enabled' | 'disabled' | 'permission-denied' | 'permission-blocked'

export interface DailyReminderResult {
  config: DailyCheckInReminderConfig
  permission: NotificationPermissionState
  outcome: DailyReminderOutcome
}

function deniedOutcome(permission: NotificationPermissionState): DailyReminderOutcome {
  return permission === 'denied' ? 'permission-blocked' : 'permission-denied'
}

export class DailyReminderCoordinator {
  private readonly repository: DataRepository
  private readonly notifications: DailyReminderNotificationAdapter

  constructor(
    repository: DataRepository,
    notifications: DailyReminderNotificationAdapter,
  ) {
    this.repository = repository
    this.notifications = notifications
  }

  async reconcile(): Promise<DailyReminderResult> {
    const settings = await loadReminderSettings(this.repository)
    const config = settings.dailyCheckInReminder ?? { enabled: false, time: '21:00' }
    if (!this.notifications.isSupported()) {
      return { config, permission: 'not-applicable', outcome: config.enabled ? 'enabled' : 'disabled' }
    }

    const permission = await this.notifications.checkPermission()
    if (!config.enabled) {
      await this.notifications.cancelDailyReminder()
      return { config, permission, outcome: 'disabled' }
    }
    if (permission !== 'granted') {
      await this.notifications.cancelDailyReminder().catch(() => undefined)
      const disabled = { ...config, enabled: false }
      await saveDailyCheckInReminder(this.repository, disabled)
      return { config: disabled, permission, outcome: deniedOutcome(permission) }
    }

    try {
      await this.notifications.replaceDailyReminder(config.time)
      return { config, permission, outcome: 'enabled' }
    } catch (error) {
      await this.notifications.cancelDailyReminder().catch(() => undefined)
      await saveDailyCheckInReminder(this.repository, { ...config, enabled: false })
      throw error
    }
  }

  async update(config: DailyCheckInReminderConfig): Promise<DailyReminderResult> {
    if (!isValidReminderTime(config.time)) throw new Error('Choose a valid reminder time.')
    if (!this.notifications.isSupported()) {
      await saveDailyCheckInReminder(this.repository, config)
      return { config, permission: 'not-applicable', outcome: config.enabled ? 'enabled' : 'disabled' }
    }

    if (!config.enabled) {
      await this.notifications.cancelDailyReminder()
      await saveDailyCheckInReminder(this.repository, config)
      return { config, permission: await this.notifications.checkPermission(), outcome: 'disabled' }
    }

    let permission = await this.notifications.checkPermission()
    if (permission === 'prompt' || permission === 'prompt-with-rationale') {
      permission = await this.notifications.requestPermission()
    }
    if (permission !== 'granted') {
      await this.notifications.cancelDailyReminder().catch(() => undefined)
      const disabled = { ...config, enabled: false }
      await saveDailyCheckInReminder(this.repository, disabled)
      return { config: disabled, permission, outcome: deniedOutcome(permission) }
    }

    try {
      await this.notifications.replaceDailyReminder(config.time, { requestExactAlarmPermission: true })
      await saveDailyCheckInReminder(this.repository, config)
      return { config, permission, outcome: 'enabled' }
    } catch (error) {
      await this.notifications.cancelDailyReminder().catch(() => undefined)
      await saveDailyCheckInReminder(this.repository, { ...config, enabled: false })
      throw error
    }
  }
}
