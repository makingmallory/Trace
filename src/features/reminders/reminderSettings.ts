import type { DailyCheckInReminderConfig, Settings } from '../../domain/models/index.ts'
import type { DataRepository } from '../../data/repository/DataRepository.ts'

export const SETTINGS_ID = 'settings.primary'

export async function loadReminderSettings(repository: DataRepository): Promise<Settings> {
  const existing = (await repository.getAll('settings')).find((item) => !item.deletedAt)
  if (existing) return existing
  const now = new Date().toISOString()
  return { id: SETTINGS_ID, schemaVersion: 2, themeId: 'fantasy', reducedMotion: false, locale: navigator.language || 'en-US', dateFormat: 'local', timeFormat: '12-hour', firstDayOfWeek: 0, units: {}, createdAt: now, updatedAt: now, deletedAt: null, revision: 1 }
}

export async function saveDailyCheckInReminder(repository: DataRepository, config: DailyCheckInReminderConfig): Promise<Settings> {
  const current = await loadReminderSettings(repository)
  const next = { ...current, dailyCheckInReminder: config, updatedAt: new Date().toISOString(), revision: current.revision + 1 }
  await repository.save('settings', next)
  return next
}
