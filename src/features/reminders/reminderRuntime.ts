import { IndexedDbDataRepository } from '../../data/local/IndexedDbDataRepository.ts'
import { CapacitorDailyReminderAdapter } from '../../platform/notifications/CapacitorDailyReminderAdapter.ts'
import { DailyReminderCoordinator } from './DailyReminderCoordinator.ts'

let coordinator: DailyReminderCoordinator | undefined

export function createDailyReminderCoordinator(): DailyReminderCoordinator {
  coordinator ??= new DailyReminderCoordinator(new IndexedDbDataRepository(), new CapacitorDailyReminderAdapter())
  return coordinator
}
