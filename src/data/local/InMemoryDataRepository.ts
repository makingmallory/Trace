import type {
  DataRepository,
  RepositoryCollection,
  RepositoryCollectionMap,
  RepositoryWrite,
} from '../repository/DataRepository.ts'
import { repositoryCollections } from '../repository/DataRepository.ts'

type RepositoryStores = {
  [K in RepositoryCollection]: Map<string, RepositoryCollectionMap[K]>
}

function createStores(): RepositoryStores {
  return Object.fromEntries(
    repositoryCollections.map((collection) => [collection, new Map()]),
  ) as RepositoryStores
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

export class InMemoryDataRepository implements DataRepository {
  private readonly stores = createStores()

  async getById<K extends RepositoryCollection>(
    collection: K,
    id: string,
  ): Promise<RepositoryCollectionMap[K] | null> {
    const entity = this.stores[collection].get(id)
    return entity ? clone(entity) : null
  }

  async getAll<K extends RepositoryCollection>(
    collection: K,
  ): Promise<readonly RepositoryCollectionMap[K][]> {
    return Array.from(this.stores[collection].values(), clone)
  }

  async save<K extends RepositoryCollection>(
    collection: K,
    entity: RepositoryCollectionMap[K],
  ): Promise<void> {
    this.stores[collection].set(entity.id, clone(entity))
  }

  async saveMany<K extends RepositoryCollection>(
    collection: K,
    entities: readonly RepositoryCollectionMap[K][],
  ): Promise<void> {
    for (const entity of entities) {
      await this.save(collection, entity)
    }
  }

  async saveTransaction(writes: readonly RepositoryWrite[]): Promise<void> {
    const snapshots = new Map<RepositoryCollection, Map<string, unknown>>()
    for (const collection of repositoryCollections) snapshots.set(collection, new Map(this.stores[collection] as Map<string, unknown>))
    try {
      for (const write of writes) {
        const store = this.stores[write.collection] as Map<string, { id: string }>
        for (const entity of write.entities) store.set(entity.id, clone(entity))
      }
    } catch (error) {
      for (const collection of repositoryCollections) {
        const store = this.stores[collection] as Map<string, unknown>
        store.clear()
        for (const [id, entity] of snapshots.get(collection)!) store.set(id, entity)
      }
      throw error
    }
  }
}
