import type {
  Entity,
  EntityId,
  IANATimeZone,
  IconReference,
  ISODate,
  ISODateTime,
  JsonValue,
  SyncableEntity,
} from './common.ts'
import type {
  CompletionBehavior,
  ConditionalRule,
  DataRole,
  EventAssertionStatus,
  EventReminderBehavior,
  EventTimingMode,
  InputType,
  ObservationAnswer,
  RecordKind,
  RecordSource,
  RecordStatus,
  RelationshipProvenance,
  RelationshipType,
  RoutineFrequency,
  RoutineScheduleType,
  TimePrecision,
  TrendTrackingMode,
  ValueDirection,
} from './valueTypes.ts'

export interface Category extends SyncableEntity {
  name: string
  sortOrder: number
  active: boolean
}

export interface Trackable extends SyncableEntity {
  categoryId: EntityId
  active: boolean
  archivedAt: ISODateTime | null
  currentVersion: number
  tags: readonly string[]
  dataRole: DataRole
  icon?: IconReference
  colorRef?: string
}

export interface TrackableVersion extends SyncableEntity {
  trackableId: EntityId
  version: number
  name: string
  description?: string
  inputType: InputType
  scaleMin?: number
  scaleMax?: number
  scaleStep?: number
  unit?: string
  valueDirection: ValueDirection
  configuration: Readonly<Record<string, JsonValue>>
  retiredAt: ISODateTime | null
}

export interface TrackableOption extends SyncableEntity {
  trackableId: EntityId
  trackableVersion: number
  storedValue: string
  label: string
  icon?: IconReference
  colorRef?: string
  sortOrder: number
  active: boolean
}

export interface Routine extends SyncableEntity {
  name: string
  icon?: IconReference
  active: boolean
  scheduleType: RoutineScheduleType
}

export type RoutineItemTarget =
  | { kind: 'trackable'; trackableId: EntityId }
  | { kind: 'event'; eventDefinitionId: EntityId }

export interface RoutineItem extends SyncableEntity {
  routineId: EntityId
  target: RoutineItemTarget
  sortOrder: number
  section?: string
  enabled: boolean
  frequency: RoutineFrequency
  weekdays?: readonly number[]
  conditionalRule?: ConditionalRule
  completionBehavior: CompletionBehavior
  trendTrackingMode: TrendTrackingMode
  eventReminderBehavior: EventReminderBehavior
}

export interface EventDefinition extends SyncableEntity {
  name: string
  description?: string
  categoryId: EntityId
  icon?: IconReference
  colorRef?: string
  timingMode: EventTimingMode
  dataRole: DataRole
  active: boolean
  nightlyReminderDefault: EventReminderBehavior
  treatmentFollowUpEnabled: boolean
}

export interface EventField extends SyncableEntity {
  eventDefinitionId: EntityId
  trackableId: EntityId
  trackableVersion: number
  sortOrder: number
  enabled: boolean
  conditionalRule?: ConditionalRule
  completionBehavior: CompletionBehavior
}

export interface LogRecord extends SyncableEntity {
  recordKind: RecordKind
  routineId?: EntityId
  eventDefinitionId?: EntityId
  localDate: ISODate
  timePrecision: TimePrecision
  startTime: ISODateTime | null
  endTime: ISODateTime | null
  timezone: IANATimeZone | null
  status: RecordStatus
  source: RecordSource
}

export interface Observation extends SyncableEntity {
  logRecordId: EntityId
  trackableId: EntityId
  trackableVersion: number
  answer: ObservationAnswer
  trendValue?: string
}

export interface ObservationOptionSelection extends SyncableEntity {
  observationId: EntityId
  optionId: EntityId
}

export interface EventDailyAssertion extends SyncableEntity {
  date: ISODate
  eventDefinitionId: EntityId
  status: EventAssertionStatus
  sourceRoutineId?: EntityId
  recordedAt: ISODateTime
}

export interface RecordRelationship extends SyncableEntity {
  sourceRecordId: EntityId
  targetRecordId: EntityId
  relationshipType: RelationshipType
  provenance: RelationshipProvenance
  confirmedByUser: boolean
  metadata: Readonly<Record<string, JsonValue>>
}

export interface RelationshipAssessment extends SyncableEntity {
  relationshipId: EntityId
  assessmentType: string
  trackableId?: EntityId
  value: JsonValue
  recordedAt: ISODateTime
}

export interface Settings extends SyncableEntity {
  schemaVersion: number
  themeId: string
  reducedMotion: boolean
  locale: string
  dateFormat: string
  timeFormat: '12-hour' | '24-hour'
  firstDayOfWeek: number
  units: Readonly<Record<string, string>>
}

export interface SyncMetadata extends Entity {
  schemaVersion: number
  deviceId: EntityId
  lastSuccessfulSyncAt: ISODateTime | null
  pendingChangeCount: number
  lastError: string | null
}
