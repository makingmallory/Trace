import type { DataRepository } from '../../data/repository/DataRepository.ts'
import type { DailyCheckInReminderConfig, Settings, Trackable, TrackableVersion } from '../models/index.ts'
import { isOccurrenceTrackable, isQuickLogEligible } from '../trackables/trackableSemantics.ts'

export const DAILY_CHECK_IN_REMINDER_ID = 'daily-check-in'
export const DAILY_CHECK_IN_REMINDER_COPY = {
  title: 'Daily Check-In',
  body: "You haven't completed your Daily Check-In yet.",
} as const

export type ReminderTarget =
  | { kind: 'daily-check-in'; path: '/check-in' }
  | { kind: 'quick-log'; path: string }
  | { kind: 'trackable'; path: string }

export interface DueReminder {
  id: string
  localDate: string
  title: string
  body: string
  target: ReminderTarget
}

export interface ReminderFiringState {
  wasHandled(reminderId: string, localDate: string): Promise<boolean>
  markHandled(reminderId: string, localDate: string): Promise<void>
}

export class InMemoryReminderFiringState implements ReminderFiringState {
  private readonly handled = new Set<string>()
  async wasHandled(reminderId: string, localDate: string): Promise<boolean> { return this.handled.has(`${reminderId}:${localDate}`) }
  async markHandled(reminderId: string, localDate: string): Promise<void> { this.handled.add(`${reminderId}:${localDate}`) }
}

export function localDateAt(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function localTimeAt(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export function isValidReminderTime(value: string): boolean { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) }

function dueAt(time: string, now: Date): boolean { return isValidReminderTime(time) && localTimeAt(now) >= time }
function weekdayAt(now: Date): number { return now.getDay() }

export function resolveTrackableReminderTarget(trackable: Trackable, isInRoutine: boolean): ReminderTarget {
  if (isQuickLogEligible(trackable)) return { kind: 'quick-log', path: `/quick-log/${trackable.id}` }
  if (isInRoutine) return { kind: 'daily-check-in', path: '/check-in' }
  return { kind: 'trackable', path: `/trackables/edit/${trackable.id}` }
}

export class ReminderEngine {
  private readonly repository: DataRepository
  private readonly firingState: ReminderFiringState

  constructor(repository: DataRepository, firingState: ReminderFiringState = new InMemoryReminderFiringState()) {
    this.repository = repository
    this.firingState = firingState
  }

  async due(now = new Date()): Promise<readonly DueReminder[]> {
    const localDate = localDateAt(now)
    const [settings, trackables, versions, records, observations, routineItems] = await Promise.all([
      this.repository.getAll('settings'), this.repository.getAll('trackables'), this.repository.getAll('trackableVersions'),
      this.repository.getAll('logRecords'), this.repository.getAll('observations'), this.repository.getAll('routineItems'),
    ])
    const due: DueReminder[] = []
    const setting = settings.find((item) => !item.deletedAt)
    if (await this.dailyCheckInIsDue(setting, records, now, localDate)) due.push({ id: DAILY_CHECK_IN_REMINDER_ID, localDate, ...DAILY_CHECK_IN_REMINDER_COPY, target: { kind: 'daily-check-in', path: '/check-in' } })
    for (const trackable of trackables) {
      const config = trackable.reminder
      if (!config || !trackable.active || trackable.deletedAt || !config.enabled || !config.weekdays.includes(weekdayAt(now)) || !dueAt(config.time, now) || await this.firingState.wasHandled(trackable.id, localDate)) continue
      const version = versions.find((item) => item.trackableId === trackable.id && item.version === trackable.currentVersion)
      if (!version) continue
      if (config.skipIfAlreadyLoggedToday && this.trackableIsSatisfied(trackable, version, records, observations, localDate)) continue
      const isInRoutine = routineItems.some((item) => item.target.kind === 'trackable' && item.target.trackableId === trackable.id && item.enabled && !item.deletedAt)
      due.push({ id: trackable.id, localDate, title: version.name, body: `Time to check in on ${version.name}.`, target: resolveTrackableReminderTarget(trackable, isInRoutine) })
    }
    return due
  }

  async markHandled(reminder: Pick<DueReminder, 'id' | 'localDate'>): Promise<void> { await this.firingState.markHandled(reminder.id, reminder.localDate) }

  private async dailyCheckInIsDue(setting: Settings | undefined, records: readonly { recordKind: string; localDate: string; status: string; deletedAt: string | null }[], now: Date, localDate: string): Promise<boolean> {
    const config: DailyCheckInReminderConfig | undefined = setting?.dailyCheckInReminder
    return Boolean(config?.enabled && dueAt(config.time, now) && !await this.firingState.wasHandled(DAILY_CHECK_IN_REMINDER_ID, localDate) && !records.some((record) => record.recordKind === 'routine' && record.localDate === localDate && record.status === 'completed' && !record.deletedAt))
  }

  private trackableIsSatisfied(trackable: Trackable, version: TrackableVersion, records: readonly { id: string; recordKind: string; trackableId?: string; localDate: string; deletedAt: string | null }[], observations: readonly { logRecordId: string; trackableId: string; answer: { state: string; value?: { kind: string; value: unknown } }; deletedAt: string | null }[], localDate: string): boolean {
    if (isOccurrenceTrackable(trackable)) return records.some((record) => record.recordKind === 'quick_log' && record.trackableId === trackable.id && record.localDate === localDate && !record.deletedAt)
    if (version.inputType !== 'boolean') return false
    const todayRecords = new Set(records.filter((record) => record.recordKind === 'routine' && record.localDate === localDate && !record.deletedAt).map((record) => record.id))
    return observations.some((observation) => todayRecords.has(observation.logRecordId) && observation.trackableId === trackable.id && !observation.deletedAt && observation.answer.state === 'answered' && observation.answer.value?.kind === 'boolean' && observation.answer.value.value === true)
  }
}

/** Adapter boundary for a later native local-notification integration. Browser V1 only evaluates these plans. */
export interface LocalNotificationAdapter {
  schedule(reminders: readonly DueReminder[]): Promise<void>
  cancel(reminderIds: readonly string[]): Promise<void>
}
