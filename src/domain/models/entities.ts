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
  EventOccurrenceKind,
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
  TimeOfDayBucket,
  TrendTrackingMode,
  TrackableBehavior,
  TrackableRecordSemantics,
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
  /** Controls storage cardinality independently from where the Trackable can be entered. */
  recordSemantics?: TrackableRecordSemantics
  /** Occurrence Trackables may independently opt into the Quick Log entry surface. */
  quickLogEnabled?: boolean
  /** @deprecated Compatibility input for the original schema-v2 implementation; migration removes it. */
  behavior?: TrackableBehavior
  quickLogTimingMode?: EventTimingMode
  icon?: IconReference
  colorRef?: string
  /** Current scheduling preference; it does not alter historical answer meaning. */
  reminder?: TrackableReminderConfig
}

/** Local wall-clock time (`HH:mm`); weekdays use Sunday 0 through Saturday 6. */
export interface TrackableReminderConfig {
  enabled: boolean
  time: string
  weekdays: readonly number[]
  skipIfAlreadyLoggedToday: boolean
}

export interface DailyCheckInReminderConfig {
  enabled: boolean
  time: string
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
  /** Stable identity used by observations across Trackable versions. */
  optionId: EntityId
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
  /** Legacy restore input only. Schema migration rewrites this target. */
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

export interface TrackableField extends SyncableEntity {
  ownerTrackableId: EntityId
  /** Pins the field layout to the owner's semantic version. Missing only on legacy schema-v2 rows. */
  ownerTrackableVersion?: number
  fieldTrackableId: EntityId
  fieldTrackableVersion: number
  sortOrder: number
  enabled: boolean
  conditionalRule?: ConditionalRule
  completionBehavior: CompletionBehavior
  required?: boolean
}

export interface LogRecord extends SyncableEntity {
  recordKind: RecordKind
  routineId?: EntityId
  eventDefinitionId?: EntityId
  trackableId?: EntityId
  /** Owner definition version for a Quick Log occurrence. */
  trackableVersion?: number
  eventTimingKind?: EventOccurrenceKind
  localDate: ISODate
  startTimePrecision: TimePrecision
  startTime: ISODateTime | null
  startTimeOfDay: TimeOfDayBucket | null
  endLocalDate: ISODate | null
  endTimePrecision: TimePrecision | null
  endTime: ISODateTime | null
  endTimeOfDay: TimeOfDayBucket | null
  ongoing: boolean
  timezone: IANATimeZone | null
  status: RecordStatus
  source: RecordSource
}

export interface Observation extends SyncableEntity {
  logRecordId: EntityId
  trackableId: EntityId
  trackableVersion: number
  answer: ObservationAnswer
  /** Free-text choice value selected through Allow Other; never masquerades as an option ID. */
  customChoiceValue?: string
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

export interface TrackableDailyAssertion extends SyncableEntity {
  date: ISODate
  trackableId: EntityId
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
  dailyCheckInReminder?: DailyCheckInReminderConfig
}

export interface SyncMetadata extends Entity {
  schemaVersion: number
  deviceId: EntityId
  lastSuccessfulSyncAt: ISODateTime | null
  pendingChangeCount: number
  lastError: string | null
  remoteCheckpoint: number
  recordStates: Readonly<Record<string, {
    remoteRevision: number
    entityRevision: number
    fingerprint: string
  }>>
}
