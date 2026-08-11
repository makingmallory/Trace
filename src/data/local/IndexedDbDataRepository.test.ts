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

  it('migrates pre-Milestone-3 approximate records to a bucket without retaining a synthetic timestamp', async () => {
    const factory = new IDBFactory()
    const databaseName = 'trace-timing-migration-test'
    const legacyDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(databaseName, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('eventDefinitions', { keyPath: 'id' })
        request.result.createObjectStore('logRecords', { keyPath: 'id' })
        for (const name of ['categories', 'trackables', 'trackableVersions', 'trackableOptions', 'routines', 'routineItems', 'eventFields', 'observations', 'observationSelections', 'eventDailyAssertions', 'relationships', 'relationshipAssessments', 'settings', 'syncMetadata']) request.result.createObjectStore(name, { keyPath: 'id' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = legacyDatabase.transaction(['eventDefinitions', 'logRecords'], 'readwrite')
      transaction.objectStore('eventDefinitions').put({ id: 'legacy-event', timingMode: 'point' })
      transaction.objectStore('logRecords').put({
        id: 'legacy-record', recordKind: 'event', eventDefinitionId: 'legacy-event', localDate: '2026-08-10',
        timePrecision: 'approximate', startTime: '2026-08-10T21:30:00.000Z', endTime: null,
        timezone: 'America/Chicago', status: 'completed', source: 'app', createdAt: '2026-08-10T21:30:00.000Z',
        updatedAt: '2026-08-10T21:30:00.000Z', deletedAt: null, revision: 1,
      })
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    legacyDatabase.close()

    const migrated = new IndexedDbDataRepository(databaseName, factory)
    await expect(migrated.getById('logRecords', 'legacy-record')).resolves.toMatchObject({
      eventTimingKind: 'point', startTimePrecision: 'timeOfDay', startTimeOfDay: 'late_afternoon', startTime: null,
      endLocalDate: null, endTimePrecision: null, ongoing: false,
    })
    migrated.close()
  })
})
