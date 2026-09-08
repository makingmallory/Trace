import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { CheckInSnapshot } from '../../domain/checkin/CheckInEngine.ts'
import { checkInFocusTargetInSnapshot } from './checkInFocus.ts'

function snapshot(): CheckInSnapshot {
  return {
    visibleQuestions: [
      { trackable: { id: 'mood' }, fields: [{ field: { id: 'medication-type' } }] },
    ],
  } as unknown as CheckInSnapshot
}

describe('Check-In focus targets', () => {
  it('resolves a stable parent or structured-field target once its questionnaire is loaded', () => {
    expect(checkInFocusTargetInSnapshot(snapshot(), 'trackable:mood')).toBe('trackable:mood')
    expect(checkInFocusTargetInSnapshot(snapshot(), 'field:medication-type')).toBe('field:medication-type')
  })

  it('leaves a stale or absent focus target at the normal position without throwing', () => {
    expect(checkInFocusTargetInSnapshot(snapshot(), 'field:removed')).toBeNull()
    expect(checkInFocusTargetInSnapshot(snapshot(), null)).toBeNull()
  })
})
