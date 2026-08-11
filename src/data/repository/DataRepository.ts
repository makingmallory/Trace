import type {
  Category,
  EventDailyAssertion,
  EventDefinition,
  EventField,
  LogRecord,
  Observation,
  ObservationOptionSelection,
  RecordRelationship,
  RelationshipAssessment,
  Routine,
  RoutineItem,
  Settings,
  SyncMetadata,
  Trackable,
  TrackableOption,
  TrackableVersion,
} from '../../domain/models/index.ts'

export interface RepositoryCollectionMap {
  categories: Category
  trackables: Trackable
  trackableVersions: TrackableVersion
  trackableOptions: TrackableOption
  routines: Routine
  routineItems: RoutineItem
  eventDefinitions: EventDefinition
  eventFields: EventField
  logRecords: LogRecord
  observations: Observation
  observationSelections: ObservationOptionSelection
  eventDailyAssertions: EventDailyAssertion
  relationships: RecordRelationship
  relationshipAssessments: RelationshipAssessment
  settings: Settings
  syncMetadata: SyncMetadata
}

export type RepositoryCollection = keyof RepositoryCollectionMap

export const repositoryCollections: readonly RepositoryCollection[] = [
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

export interface DataRepository {
  getById<K extends RepositoryCollection>(
    collection: K,
    id: string,
  ): Promise<RepositoryCollectionMap[K] | null>

  getAll<K extends RepositoryCollection>(
    collection: K,
  ): Promise<readonly RepositoryCollectionMap[K][]>

  save<K extends RepositoryCollection>(
    collection: K,
    entity: RepositoryCollectionMap[K],
  ): Promise<void>

  saveMany<K extends RepositoryCollection>(
    collection: K,
    entities: readonly RepositoryCollectionMap[K][],
  ): Promise<void>
}
