import type { DailyReminderResult } from './DailyReminderCoordinator.ts'

/** A successful save means the requested state was persisted after scheduling. */
export function shouldShowReminderSaved(result: DailyReminderResult, requestedEnabled: boolean): boolean {
  return requestedEnabled ? result.outcome === 'enabled' : result.outcome === 'disabled'
}
