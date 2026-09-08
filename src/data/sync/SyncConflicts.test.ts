import { describe, expect, it } from 'vitest'
import type { Category, Observation } from '../../domain/models/index.ts'
import { serializeEntity, type SyncRecord } from './SyncProtocol.ts'
import { classifySyncConflict, trySafeConflictResolution } from './SyncConflicts.ts'

const stamp = '2026-08-10T00:00:00.000Z'
function category(name = 'Mood', sortOrder = 0, deletedAt: string | null = null): Category {
  return { id: 'category-1', name, sortOrder, active: true, createdAt: stamp, updatedAt: stamp, deletedAt, revision: 1 }
}
function record(entity = category(), remoteRevision = 1): SyncRecord {
  return { ...serializeEntity('categories', entity, remoteRevision), remoteRevision }
}

describe('safe sync conflict classification and merging', () => {
  it('normalizes metadata-only differences without losing payload data', () => {
    const local = record({ ...category(), revision: 2, updatedAt: '2026-08-11T01:00:00.000Z' })
    const remote = record({ ...category(), revision: 3, updatedAt: '2026-08-11T02:00:00.000Z' }, 3)
    expect(trySafeConflictResolution(local, remote, undefined, '2026-08-11T03:00:00.000Z')).toMatchObject({ reason: 'metadata-only', entity: { name: 'Mood' } })
  })

  it('auto-resolves timestamp-only identity collisions when the visible record is identical', () => {
    const local = record(category())
    const remote = record({ ...category(), createdAt: '2026-08-09T00:00:00.000Z', revision: 4, updatedAt: '2026-08-12T00:00:00.000Z' }, 4)
    expect(trySafeConflictResolution(local, remote, undefined, '2026-08-12T03:00:00.000Z')).toMatchObject({ reason: 'metadata-only', entity: { name: 'Mood' } })
  })

  it('treats null and omitted optional presentation fields as equivalent without collapsing answer states', () => {
    const local = record({ ...category(), icon: undefined })
    const remote = record({ ...category(), icon: undefined, color: undefined }, 2)
    delete local.payload.icon
    remote.payload.color = null
    expect(trySafeConflictResolution(local, remote, undefined, '2026-08-11T03:00:00.000Z')).toMatchObject({ reason: 'metadata-only' })
  })

  it('ignores derived option codes while retaining the stable option identity and label', () => {
    const local = { ...record(category()), entityType: 'trackableOptions' as const, payload: { optionId: 'option-1', trackableId: 'trackable-1', trackableVersion: 1, storedValue: 'left-cheek', label: 'Left cheek', sortOrder: 0, active: true } }
    const remote = { ...local, remoteRevision: 2, payload: { ...local.payload, storedValue: 'left_cheek' } }
    expect(trySafeConflictResolution(local, remote, undefined, '2026-08-11T03:00:00.000Z')).toMatchObject({ reason: 'metadata-only' })
  })

  it('does not collapse distinct missing-answer meanings into an empty value', () => {
    const answer = (state: 'unanswered' | 'unknown'): Observation => ({ id: 'answer-1', logRecordId: 'record-1', trackableId: 'mood', trackableVersion: 1, answer: { state }, createdAt: stamp, updatedAt: stamp, deletedAt: null, revision: 1 })
    const local = { ...serializeEntity('observations', answer('unanswered')), remoteRevision: 1 }
    const remote = { ...serializeEntity('observations', answer('unknown')), remoteRevision: 2 }
    expect(trySafeConflictResolution(local, remote, undefined, '2026-08-11T03:00:00.000Z')).toBeNull()
  })

  it('merges non-overlapping payload fields against a known base', () => {
    const base = record(category())
    const local = record({ ...category(), sortOrder: 2, revision: 2 })
    const remote = record({ ...category('Mental health'), revision: 2 }, 2)
    const result = trySafeConflictResolution(local, remote, base, '2026-08-11T03:00:00.000Z')
    expect(result).toMatchObject({ reason: 'non-overlapping-merge', entity: { name: 'Mental health', sortOrder: 2, revision: 3 } })
  })

  it('leaves competing user values unresolved', () => {
    const base = record(category())
    const local = record(category('Local mood'))
    const remote = record(category('Synced mood'), 2)
    expect(trySafeConflictResolution(local, remote, base, '2026-08-11T03:00:00.000Z')).toBeNull()
  })

  it('keeps identity collisions with a real user-facing difference unresolved', () => {
    const local = record(category('Mood'))
    const remote = record({ ...category('Mood'), active: false, createdAt: '2026-08-09T00:00:00.000Z' }, 2)
    expect(trySafeConflictResolution(local, remote, undefined, '2026-08-11T03:00:00.000Z')).toBeNull()
  })

  it('classifies delete-vs-edit and stable-ID collisions explicitly', () => {
    expect(classifySyncConflict(record(category('Edited')), record(category('Mood', 0, '2026-08-11T00:00:00.000Z')))).toBe('delete-vs-edit')
    expect(classifySyncConflict(record(category()), record({ ...category(), createdAt: '2026-08-09T00:00:00.000Z' }))).toBe('identity-collision')
  })
})
