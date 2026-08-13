import { describe, expect, it } from 'vitest'
import type { DataRepository } from '../repository/DataRepository.ts'
import type { ObservationOptionSelection } from '../../domain/models/index.ts'
import { deduplicateObservationSelections } from './deduplicateObservationSelections.ts'

describe('deduplicateObservationSelections', () => {
  it('repairs duplicate stable option rows and remains idempotent', async () => {
    const rows: ObservationOptionSelection[] = [
      { id: 'first', observationId: 'observation', optionId: 'left', createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z', deletedAt: null, revision: 1 },
      { id: 'duplicate', observationId: 'observation', optionId: 'left', createdAt: '2026-08-10T00:01:00.000Z', updatedAt: '2026-08-10T00:01:00.000Z', deletedAt: null, revision: 1 },
      { id: 'different', observationId: 'observation', optionId: 'right', createdAt: '2026-08-10T00:02:00.000Z', updatedAt: '2026-08-10T00:02:00.000Z', deletedAt: null, revision: 1 },
    ]
    const repository = {
      getAll: async () => rows,
      saveMany: async (_collection: string, entities: readonly ObservationOptionSelection[]) => {
        for (const entity of entities) rows[rows.findIndex((row) => row.id === entity.id)] = entity
      },
    } as unknown as DataRepository
    expect(await deduplicateObservationSelections(repository, '2026-08-11T00:00:00.000Z')).toBe(1)
    expect(rows.filter((row) => !row.deletedAt).map((row) => row.optionId)).toEqual(['left', 'right'])
    expect(await deduplicateObservationSelections(repository, '2026-08-12T00:00:00.000Z')).toBe(0)
  })
})
