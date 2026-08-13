import type { Trackable, TrackableRecordSemantics } from '../models/index.ts'

export function recordSemanticsFor(trackable: Trackable): TrackableRecordSemantics {
  return trackable.recordSemantics ?? (trackable.behavior === 'quick_log' ? 'occurrence' : 'daily_value')
}

export function isOccurrenceTrackable(trackable: Trackable): boolean {
  return recordSemanticsFor(trackable) === 'occurrence'
}

export function isQuickLogEligible(trackable: Trackable): boolean {
  return isOccurrenceTrackable(trackable) && (trackable.quickLogEnabled ?? trackable.behavior === 'quick_log')
}
