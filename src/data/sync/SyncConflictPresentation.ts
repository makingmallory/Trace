import type { JsonValue, SyncConflictSnapshot, SyncRecordSnapshot } from '../../domain/models/index.ts'

export interface ConflictPresentation {
  title: string
  context: string
  explanation: string
  localLabel: string
  syncedLabel: string
}

const entityNames: Readonly<Record<string, string>> = {
  categories: 'Category', trackables: 'Trackable', trackableVersions: 'Trackable definition', trackableOptions: 'Trackable option',
  trackableFields: 'Additional field', trackableDailyAssertions: 'Daily answer', routines: 'Daily Check-In routine', routineItems: 'Daily Check-In question',
  eventDefinitions: 'Quick Log definition', eventFields: 'Quick Log field', logRecords: 'Tracking record', observations: 'Trackable answer',
  observationSelections: 'Selected answer', eventDailyAssertions: 'Daily answer', relationships: 'Record relationship', relationshipAssessments: 'Relationship assessment', settings: 'App settings',
}

function object(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, JsonValue>> : null
}

function simple(value: JsonValue | undefined): string {
  if (value === null || value === undefined) return 'None'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return 'Updated details'
}

function answerLabel(value: JsonValue | undefined): string {
  const answer = object(value)
  if (!answer) return 'Answer updated'
  if (answer.state !== 'answered') return typeof answer.state === 'string' ? answer.state.replaceAll('_', ' ') : 'Unanswered'
  const observation = object(answer.value)
  if (!observation) return 'Answered'
  if (observation.kind === 'boolean') return observation.value === true ? 'Yes' : 'No'
  const formatted = simple(observation.value)
  return typeof observation.unit === 'string' ? `${formatted} ${observation.unit}` : formatted
}

function dateContext(record: SyncRecordSnapshot): string {
  const localDate = record.payload.localDate ?? record.payload.date
  if (typeof localDate === 'string') {
    const time = record.payload.startTimeOfDay ?? record.payload.startTime
    return typeof time === 'string' && time ? `${localDate} · ${time}` : localDate
  }
  const recordedAt = record.payload.recordedAt
  return typeof recordedAt === 'string' ? new Date(recordedAt).toLocaleString() : `Updated ${new Date(record.updatedAt).toLocaleString()}`
}

function recordValue(record: SyncRecordSnapshot): string {
  if (record.deletedAt) return 'Deleted'
  const payload = record.payload
  switch (record.entityType) {
    case 'categories': return `${simple(payload.name)} · ${payload.active === false ? 'Hidden' : 'Visible'}`
    case 'trackableVersions': return `${simple(payload.name)} · ${simple(payload.inputType).replaceAll('_', ' ')}`
    case 'trackableOptions': return simple(payload.label)
    case 'eventDefinitions': return simple(payload.name)
    case 'observations': return answerLabel(payload.answer)
    case 'trackableDailyAssertions':
    case 'eventDailyAssertions': return simple(payload.status)
    case 'logRecords': return `${simple(payload.status)} · ${dateContext(record)}`
    case 'settings': return 'App preferences changed'
    default: return `${entityNames[record.entityType] ?? 'Record'} updated`
  }
}

function titleFor(conflict: SyncConflictSnapshot, trackableNames: ReadonlyMap<string, string>): string {
  const record = conflict.local
  const payload = record.payload
  if (record.entityType === 'observations') {
    const key = `${String(payload.trackableId)}:${String(payload.trackableVersion)}`
    return `${trackableNames.get(key) ?? 'Trackable'} answer`
  }
  const name = payload.name ?? payload.label
  return typeof name === 'string' ? name : entityNames[record.entityType] ?? 'Trace record'
}

export function presentSyncConflict(conflict: SyncConflictSnapshot, trackableNames: ReadonlyMap<string, string> = new Map()): ConflictPresentation {
  const explanation = conflict.kind === 'delete-vs-edit'
    ? 'One copy deleted this record while the other changed it. Choose whether the record should remain or stay deleted.'
    : conflict.kind === 'identity-collision'
      ? 'Two different records have the same stable identity. Trace kept both snapshots for review.'
      : 'This record changed differently on this device and in the synced copy. Neither version was overwritten.'
  return {
    title: titleFor(conflict, trackableNames),
    context: dateContext(conflict.local),
    explanation,
    localLabel: recordValue(conflict.local),
    syncedLabel: recordValue(conflict.remote),
  }
}
