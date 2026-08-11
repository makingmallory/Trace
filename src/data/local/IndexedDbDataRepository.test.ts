import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import type { Category } from '../../domain/models/index.ts'
import { IndexedDbDataRepository } from './IndexedDbDataRepository.ts'

describe('IndexedDbDataRepository', () => {
  it('round-trips local data through a fresh repository instance', async () => {
    const factory = new IDBFactory()
    const databaseName = 'trace-roundtrip-test'
    const first = new IndexedDbDataRepository(databaseName, factory)
    const category: Category = {
      id: 'category-test', name: 'Persisted category', sortOrder: 0, active: true,
      createdAt: '2026-08-10T12:00:00.000Z', updatedAt: '2026-08-10T12:00:00.000Z', deletedAt: null, revision: 1,
    }
    await first.save('categories', category)
    first.close()

    const reopened = new IndexedDbDataRepository(databaseName, factory)
    await expect(reopened.getById('categories', category.id)).resolves.toEqual(category)
    reopened.close()
  })
})
