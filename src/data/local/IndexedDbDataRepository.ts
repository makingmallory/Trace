import {
  repositoryCollections,
  type DataRepository,
  type RepositoryCollection,
  type RepositoryCollectionMap,
} from '../repository/DataRepository.ts'
import { bucketForHour } from '../../domain/events/eventTiming.ts'

export const TRACE_DATABASE_NAME = 'trace-local-data'
export const TRACE_DATABASE_VERSION = 2

type Migration = (database: IDBDatabase, transaction: IDBTransaction) => void

function localParts(timestamp: string, timezone: string | null | undefined): { date: string; hour: number } {
  const date = new Date(timestamp)
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date)
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
    return { date: `${value('year')}-${value('month')}-${value('day')}`, hour: Number(value('hour')) }
  } catch {
    return { date: timestamp.slice(0, 10), hour: date.getHours() }
  }
}

const migrations: Readonly<Record<number, Migration>> = {
  1: (database) => {
    for (const collection of repositoryCollections) {
      if (!database.objectStoreNames.contains(collection)) database.createObjectStore(collection, { keyPath: 'id' })
    }
  },
  2: (_database, transaction) => {
    const definitionRequest = transaction.objectStore('eventDefinitions').getAll()
    definitionRequest.addEventListener('success', () => {
      const timingModes = new Map((definitionRequest.result as Array<{ id: string; timingMode: string }>).map((item) => [item.id, item.timingMode]))
      const request = transaction.objectStore('logRecords').openCursor()
      request.addEventListener('success', () => {
        const cursor = request.result
        if (!cursor) return
        const legacy = cursor.value as Record<string, unknown>
        if ('timePrecision' in legacy && !('startTimePrecision' in legacy)) {
          const precision = String(legacy.timePrecision)
          const startTimestamp = typeof legacy.startTime === 'string' ? legacy.startTime : null
          const endTimestamp = typeof legacy.endTime === 'string' ? legacy.endTime : null
          const timezone = typeof legacy.timezone === 'string' ? legacy.timezone : null
          const startParts = startTimestamp ? localParts(startTimestamp, timezone) : null
          const endParts = endTimestamp ? localParts(endTimestamp, timezone) : null
          const approximate = precision === 'approximate'
          const { timePrecision: _removed, ...rest } = legacy
          cursor.update({
            ...rest,
            eventTimingKind: legacy.recordKind === 'event'
              ? (endTimestamp || timingModes.get(String(legacy.eventDefinitionId)) === 'duration' ? 'duration' : 'point')
              : undefined,
            startTimePrecision: approximate ? 'timeOfDay' : precision,
            startTime: approximate ? null : startTimestamp,
            startTimeOfDay: approximate && startParts ? bucketForHour(startParts.hour) : null,
            endLocalDate: endParts?.date ?? null,
            endTimePrecision: endTimestamp ? (approximate ? 'timeOfDay' : precision) : null,
            endTime: approximate ? null : endTimestamp,
            endTimeOfDay: approximate && endParts ? bucketForHour(endParts.hour) : null,
            ongoing: false,
          })
        }
        cursor.continue()
      })
    })
  },
}

function migrate(database: IDBDatabase, transaction: IDBTransaction, oldVersion: number): void {
  for (let version = oldVersion + 1; version <= TRACE_DATABASE_VERSION; version += 1) migrations[version]?.(database, transaction)
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed.')), { once: true })
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.')), { once: true })
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')), { once: true })
  })
}

export class IndexedDbDataRepository implements DataRepository {
  private databasePromise: Promise<IDBDatabase> | null = null
  private readonly databaseName: string
  private readonly indexedDb: IDBFactory

  constructor(databaseName = TRACE_DATABASE_NAME, indexedDbFactory: IDBFactory = indexedDB) {
    this.databaseName = databaseName
    this.indexedDb = indexedDbFactory
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise

    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.indexedDb.open(this.databaseName, TRACE_DATABASE_VERSION)
      request.addEventListener('upgradeneeded', (event) => migrate(request.result, request.transaction!, event.oldVersion))
      request.addEventListener('success', () => resolve(request.result), { once: true })
      request.addEventListener('blocked', () => reject(new Error('Trace local database upgrade is blocked by another open tab.')), { once: true })
      request.addEventListener('error', () => reject(request.error ?? new Error('Could not open Trace local data.')), { once: true })
    })
    return this.databasePromise
  }

  async getById<K extends RepositoryCollection>(collection: K, id: string): Promise<RepositoryCollectionMap[K] | null> {
    const database = await this.open()
    const request = database.transaction(collection, 'readonly').objectStore(collection).get(id)
    return (await requestResult(request) as RepositoryCollectionMap[K] | undefined) ?? null
  }

  async getAll<K extends RepositoryCollection>(collection: K): Promise<readonly RepositoryCollectionMap[K][]> {
    const database = await this.open()
    const request = database.transaction(collection, 'readonly').objectStore(collection).getAll()
    return await requestResult(request) as RepositoryCollectionMap[K][]
  }

  async save<K extends RepositoryCollection>(collection: K, entity: RepositoryCollectionMap[K]): Promise<void> {
    await this.saveMany(collection, [entity])
  }

  async saveMany<K extends RepositoryCollection>(collection: K, entities: readonly RepositoryCollectionMap[K][]): Promise<void> {
    if (entities.length === 0) return
    const database = await this.open()
    const transaction = database.transaction(collection, 'readwrite')
    const store = transaction.objectStore(collection)
    for (const entity of entities) store.put(entity)
    await transactionDone(transaction)
  }

  close(): void {
    void this.databasePromise?.then((database) => database.close())
    this.databasePromise = null
  }
}
