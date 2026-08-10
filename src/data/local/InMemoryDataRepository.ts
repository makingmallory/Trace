import type {
  DataRepository,
  RepositoryCollection,
  RepositoryCollectionMap,
} from '../repository/DataRepository.ts'

type RepositoryStores = {
  [K in RepositoryCollection]: Map<string, RepositoryCollectionMap[K]>
}

const collectionNames: readonly RepositoryCollection[] = [
  'categories',
  'trackables',
  'trackableVersions',
  'trackableOptions',
  'routines',
  'routineItems',
  'eventDefinitions',
  'eventFields',
  'logRecords',
  'observations',
  'observationSelections',
  'eventDailyAssertions',
  'relationships',
  'relationshipAssessments',
  'settings',
  'syncMetadata',
]

function createStores(): RepositoryStores {
  return Object.fromEntries(
    collectionNames.map((collection) => [collection, new Map()]),
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
}
