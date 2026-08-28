import { describe, expect, it } from 'vitest'
import type { SyncConflictSnapshot } from '../../domain/models/index.ts'
import { presentSyncConflict } from './SyncConflictPresentation.ts'
import { serializeEntity } from './SyncProtocol.ts'

const entity = { id: 'observation-1', logRecordId: 'record-1', trackableId: 'mood', trackableVersion: 1, answer: { state: 'answered' as const, value: { kind: 'scale' as const, value: 4 } }, createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z', deletedAt: null, revision: 1 }

describe('sync conflict presentation', () => {
  it('shows user-facing Trackable context and values instead of record IDs or JSON', () => {
    const local = serializeEntity('observations', entity)
    const remote = serializeEntity('observations', { ...entity, answer: { state: 'answered', value: { kind: 'scale', value: 2 } } })
    const conflict: SyncConflictSnapshot = { id: 'observations:observation-1', kind: 'differing-values', detectedAt: entity.updatedAt, local, remote }
    expect(presentSyncConflict(conflict, new Map([['mood:1', 'Mood']]))).toMatchObject({ title: 'Mood answer', localLabel: '4', syncedLabel: '2' })
  })

  it('explains delete-vs-edit without silently choosing a side', () => {
    const local = serializeEntity('observations', entity)
    const remote = serializeEntity('observations', { ...entity, deletedAt: '2026-08-11T00:00:00.000Z' })
    const conflict: SyncConflictSnapshot = { id: 'observations:observation-1', kind: 'delete-vs-edit', detectedAt: entity.updatedAt, local, remote }
    expect(presentSyncConflict(conflict).explanation).toMatch(/deleted.*changed/i)
    expect(presentSyncConflict(conflict).syncedLabel).toBe('Deleted')
  })
})
