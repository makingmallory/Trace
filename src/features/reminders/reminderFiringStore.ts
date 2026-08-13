import type { ReminderFiringState } from '../../domain/reminders/ReminderEngine.ts'

const key = 'trace.reminders.fired.v1'

export class BrowserReminderFiringStore implements ReminderFiringState {
  private read(): Record<string, string> { try { return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string> } catch { return {} } }
  async wasHandled(reminderId: string, localDate: string): Promise<boolean> { return this.read()[reminderId] === localDate }
  async markHandled(reminderId: string, localDate: string): Promise<void> { localStorage.setItem(key, JSON.stringify({ ...this.read(), [reminderId]: localDate })) }
}
