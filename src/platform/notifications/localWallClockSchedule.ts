import { isValidReminderTime } from '../../domain/reminders/ReminderEngine.ts'

export interface LocalWallClockTime {
  hour: number
  minute: number
}

/**
 * Parses the durable HH:mm setting as a device-local wall-clock time. It must
 * never be passed through Date.parse/ISO parsing, which can introduce UTC
 * semantics before Android receives the calendar rule.
 */
export function parseLocalWallClockTime(time: string): LocalWallClockTime {
  if (!isValidReminderTime(time)) throw new Error('Choose a valid reminder time.')
  const [hour, minute] = time.split(':').map(Number)
  return { hour, minute }
}

/** Returns the next device-local occurrence for diagnostics and tests. */
export function nextLocalWallClockOccurrence(time: string, now = new Date()): Date {
  const { hour, minute } = parseLocalWallClockTime(time)
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next
}

/**
 * A calendar rule, not a fixed UTC timestamp. Capacitor's Android adapter
 * resolves this rule using the device's current local timezone on every day.
 */
export function dailyLocalWallClockSchedule(time: string) {
  const { hour, minute } = parseLocalWallClockTime(time)
  return { on: { hour, minute, second: 0 }, allowWhileIdle: true }
}
