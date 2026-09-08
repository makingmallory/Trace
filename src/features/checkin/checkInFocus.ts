import type { CheckInSnapshot } from '../../domain/checkin/CheckInEngine.ts'
import type { CheckInFocusTarget } from './checkInNavigation.ts'

/** Resolves only elements that are actually present in the loaded Check-In snapshot. */
export function checkInFocusTargetInSnapshot(snapshot: CheckInSnapshot, target: CheckInFocusTarget | null): CheckInFocusTarget | null {
  if (!target) return null
  for (const question of snapshot.visibleQuestions) {
    if (target === `trackable:${question.trackable.id}`) return target
    if ((question.fields ?? []).some(({ field }) => target === `field:${field.id}`)) return target
  }
  return null
}
