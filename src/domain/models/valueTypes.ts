import type { EntityId, JsonValue } from './common.ts'

export type InputType =
  | 'scale'
  | 'boolean'
  | 'single_choice'
  | 'multi_select'
  | 'number'
  | 'duration'
  | 'time'
  | 'text'

export type DataRole =
  | 'symptom'
  | 'treatment'
  | 'behavior'
  | 'exposure'
  | 'context'
  | 'measurement'
  | 'outcome'
  | 'other'

export type ValueDirection = 'better' | 'worse' | 'neutral'
export type EventTimingMode = 'point' | 'duration' | 'either' | 'dayOnly'
export type TimePrecision = 'exact' | 'approximate' | 'day' | 'unknown'
export type RecordKind = 'routine' | 'event' | 'momentary'
export type RecordStatus = 'draft' | 'completed'
export type RecordSource =
  | 'app'
  | 'nightly_backfill'
  | 'manual_history'
  | 'legacy_import'
  | 'google_restore'

export type RoutineScheduleType = 'daily' | 'selected_weekdays'
export type RoutineFrequency = 'every_day' | 'selected_weekdays'
export type CompletionBehavior = 'optional' | 'expected'
export type TrendTrackingMode =
  | 'none'
  | 'better_same_worse'
  | 'new_improving_same_worsening'
export type EventReminderBehavior = 'always' | 'if_not_logged' | 'never'

export type RuleOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'lessThan'
  | 'contains'
  | 'anyOf'
  | 'containsAny'
  | 'isAnswered'

export interface ConditionalRule {
  sourceTrackableId: EntityId
  operator: RuleOperator
  expectedValue?: JsonValue
}

export type EventAssertionStatus = 'occurred' | 'did_not_occur' | 'unknown'
export type RelationshipType =
  | 'treated_by'
  | 'triggered_by'
  | 'associated_with'
  | 'followed_by'
  | 'caused_by_user_claim'
  | 'part_of'
export type RelationshipProvenance =
  | 'manual'
  | 'user_confirmed_suggestion'
  | 'system_inferred'
  | 'imported'

export type ObservationValue =
  | { kind: 'scale'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'choice'; value: null }
  | { kind: 'number'; value: number; unit?: string }
  | { kind: 'duration'; value: number; unit: 'minutes' }
  | { kind: 'time'; value: string }
  | { kind: 'text'; value: string }

export type MissingObservationState =
  | 'skipped'
  | 'unanswered'
  | 'not_presented'
  | 'unavailable'
  | 'unknown'

export type ObservationAnswer =
  | { state: 'answered'; value: ObservationValue }
  | { state: MissingObservationState; value?: never }

export function isAnsweredObservation(
  answer: ObservationAnswer,
): answer is Extract<ObservationAnswer, { state: 'answered' }> {
  return answer.state === 'answered'
}
