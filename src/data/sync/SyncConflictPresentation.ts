import type { JsonValue, SyncConflictSnapshot, SyncRecordSnapshot } from '../../domain/models/index.ts'
import { meaningfulPayloadDifferences } from './SyncConflicts.ts'
import { stableStringify, type SyncRecord } from './SyncProtocol.ts'

export interface ConflictDifference {
  field: string
  local: string
  synced: string
}

interface PresentationSideContext {
  records: ReadonlyMap<string, SyncRecordSnapshot>
}

export interface ConflictPresentationContext {
  local: PresentationSideContext
  synced: PresentationSideContext
}

export interface ConflictLocationComparison {
  local: string
  synced: string
}

export interface ConflictPresentation {
  title: string
  context: string
  explanation: string
  locations?: ConflictLocationComparison
  differences: readonly ConflictDifference[]
}

interface ResolvedIdentity {
  name: string
  category: string
}

const entityNames: Readonly<Record<string, string>> = {
  categories: 'Category',
  trackables: 'Trackable',
  trackableVersions: 'Trackable definition',
  trackableOptions: 'Trackable option',
  trackableFields: 'Structured field',
  trackableDailyAssertions: 'Daily answer',
  routines: 'Daily Check-In routine',
  routineItems: 'Daily Check-In question',
  eventDefinitions: 'Quick Log definition',
  eventFields: 'Quick Log field',
  logRecords: 'Tracking record',
  observations: 'Trackable answer',
  observationSelections: 'Selected answer',
  eventDailyAssertions: 'Daily answer',
  relationships: 'Record relationship',
  relationshipAssessments: 'Relationship assessment',
  settings: 'App settings',
}

const fieldLabels: Readonly<Record<string, string>> = {
  active: 'Visibility',
  archivedAt: 'Archive state',
  categoryId: 'Category',
  color: 'Color',
  colorRef: 'Color',
  configuration: 'Question settings',
  completionBehavior: 'Required or optional',
  customChoiceValue: 'Custom answer',
  dataRole: 'Tracking purpose',
  date: 'Date',
  deletedAt: 'Record status',
  description: 'Description',
  enabled: 'Included',
  eventDefinitionId: 'Quick Log',
  eventReminderBehavior: 'Reminder behavior',
  eventTimingKind: 'Timing',
  fieldTrackableId: 'Structured field',
  fieldTrackableVersion: 'Structured field definition',
  frequency: 'Frequency',
  icon: 'Icon',
  inputType: 'Answer style',
  label: 'Label',
  localDate: 'Date',
  logRecordId: 'Check-In record',
  name: 'Name',
  observationId: 'Answer link',
  optionId: 'Selected option',
  ownerTrackableId: 'Parent Trackable',
  ownerTrackableVersion: 'Parent definition',
  quickLogEnabled: 'Quick Log',
  quickLogTimingMode: 'Quick Log timing',
  recordSemantics: 'Tracking mode',
  relationshipId: 'Relationship',
  required: 'Required or optional',
  retiredAt: 'Definition state',
  routineId: 'Daily Check-In',
  scaleMax: 'Scale maximum',
  scaleMin: 'Scale minimum',
  scaleStep: 'Step',
  scheduleType: 'Schedule',
  section: 'Section',
  sortOrder: 'Order',
  sourceRecordId: 'Source record',
  sourceRoutineId: 'Daily Check-In',
  status: 'Status',
  tags: 'Tags',
  target: 'Question target',
  targetRecordId: 'Related record',
  timingMode: 'Timing style',
  trackableId: 'Trackable',
  trackableVersion: 'Trackable definition',
  trendTrackingMode: 'Trend tracking',
  trendValue: 'Trend',
  unit: 'Unit',
  value: 'Value',
  valueDirection: 'Direction',
  weekdays: 'Days',
  answer: 'Answer',
}

const inputTypeLabels: Readonly<Record<string, string>> = {
  scale: 'Scale', boolean: 'Yes / No', single_choice: 'Single choice', multi_select: 'Multiple choice', number: 'Number', duration: 'Duration', time: 'Time', text: 'Text',
}

const weekdayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function recordKey(record: Pick<SyncRecordSnapshot, 'entityType' | 'id'>): string {
  return `${record.entityType}:${record.id}`
}

function sideContext(records: readonly SyncRecordSnapshot[]): PresentationSideContext {
  return { records: new Map(records.map((record) => [recordKey(record), record])) }
}

export function buildConflictPresentationContext(
  repositoryRecords: readonly SyncRecordSnapshot[],
  conflicts: readonly SyncConflictSnapshot[],
): ConflictPresentationContext {
  const local = new Map(repositoryRecords.map((record) => [recordKey(record), record]))
  const synced = new Map(repositoryRecords.map((record) => [recordKey(record), record]))
  for (const conflict of conflicts) {
    local.set(recordKey(conflict.local), conflict.local)
    synced.set(recordKey(conflict.remote), conflict.remote)
  }
  return { local: sideContext([...local.values()]), synced: sideContext([...synced.values()]) }
}

function record(context: PresentationSideContext, entityType: string, id: JsonValue | undefined): SyncRecordSnapshot | undefined {
  return typeof id === 'string' ? context.records.get(`${entityType}:${id}`) : undefined
}

function recordsOfType(context: PresentationSideContext, entityType: string): readonly SyncRecordSnapshot[] {
  return [...context.records.values()].filter((candidate) => candidate.entityType === entityType)
}

function object(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, JsonValue>> : null
}

function titleCase(value: string): string {
  return value.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function fieldLabel(entityType: string, field: string): string {
  if (field === 'label' && entityType === 'trackableOptions') return 'Option label'
  if (field === 'sortOrder' && entityType === 'trackableOptions') return 'Option order'
  if (field === 'sortOrder' && (entityType === 'trackableFields' || entityType === 'eventFields')) return 'Field order'
  if (field === 'sortOrder' && entityType === 'routineItems') return 'Question order'
  if (field === 'currentVersion') return 'Current definition'
  return fieldLabels[field] ?? titleCase(field)
}

function missing(value: JsonValue | undefined): boolean {
  return value === null || value === undefined
}

function versionRecord(context: PresentationSideContext, trackableId: JsonValue | undefined, version?: JsonValue): SyncRecordSnapshot | undefined {
  if (typeof trackableId !== 'string') return undefined
  const versions = recordsOfType(context, 'trackableVersions').filter((candidate) => candidate.payload.trackableId === trackableId)
  if (typeof version === 'number') return versions.find((candidate) => candidate.payload.version === version)
  const trackable = record(context, 'trackables', trackableId)
  return versions.find((candidate) => candidate.payload.version === trackable?.payload.currentVersion)
    ?? versions.sort((left, right) => Number(right.payload.version) - Number(left.payload.version))[0]
}

function categoryName(context: PresentationSideContext, categoryId: JsonValue | undefined): string {
  const category = record(context, 'categories', categoryId)
  if (!category) return 'Category unavailable'
  const name = typeof category.payload.name === 'string' ? category.payload.name : 'Unnamed category'
  return category.deletedAt ? `${name} (deleted)` : name
}

function trackableIdentity(context: PresentationSideContext, trackableId: JsonValue | undefined, version?: JsonValue): ResolvedIdentity {
  const trackable = record(context, 'trackables', trackableId)
  const definition = versionRecord(context, trackableId, version)
  const name = typeof definition?.payload.name === 'string' ? definition.payload.name : trackable?.deletedAt ? 'Deleted Trackable' : 'Trackable unavailable'
  const category = trackable ? categoryName(context, trackable.payload.categoryId) : 'Category unavailable'
  return { name: trackable?.deletedAt && name !== 'Deleted Trackable' ? `${name} (deleted)` : name, category }
}

function singleStructuredParent(context: PresentationSideContext, fieldTrackableId: JsonValue | undefined, fieldVersion?: JsonValue): SyncRecordSnapshot | undefined {
  if (typeof fieldTrackableId !== 'string') return undefined
  const matches = recordsOfType(context, 'trackableFields').filter((candidate) => !candidate.deletedAt
    && candidate.payload.enabled !== false
    && candidate.payload.fieldTrackableId === fieldTrackableId
    && (typeof fieldVersion !== 'number' || candidate.payload.fieldTrackableVersion === fieldVersion))
  return matches.length === 1 ? matches[0] : undefined
}

function optionName(context: PresentationSideContext, optionId: JsonValue | undefined, trackableId?: JsonValue, trackableVersion?: JsonValue): string {
  const matching = recordsOfType(context, 'trackableOptions').filter((candidate) => candidate.payload.optionId === optionId)
  const option = matching.find((candidate) => candidate.payload.trackableId === trackableId && candidate.payload.trackableVersion === trackableVersion) ?? matching[0]
  return typeof option?.payload.label === 'string' ? option.payload.label : 'Option unavailable'
}

function parentObservation(snapshot: SyncRecordSnapshot, context: PresentationSideContext): SyncRecordSnapshot | undefined {
  if (snapshot.entityType === 'observations') return snapshot
  if (snapshot.entityType === 'observationSelections') return record(context, 'observations', snapshot.payload.observationId)
  return undefined
}

function answerDate(snapshot: SyncRecordSnapshot, context: PresentationSideContext): string | null {
  if (snapshot.entityType === 'trackableDailyAssertions' || snapshot.entityType === 'eventDailyAssertions') return typeof snapshot.payload.date === 'string' ? snapshot.payload.date : null
  const observation = parentObservation(snapshot, context)
  const parent = observation ? record(context, 'logRecords', observation.payload.logRecordId) : undefined
  return typeof parent?.payload.localDate === 'string' ? parent.payload.localDate : null
}

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number)
  if (!year || !month || !day) return localDate
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day, 12))
}

function answerLocation(owner: ResolvedIdentity, snapshot: SyncRecordSnapshot, context: PresentationSideContext): ResolvedIdentity {
  const date = answerDate(snapshot, context)
  return { name: owner.name, category: [owner.category, 'Daily Check-In', date ? formatDate(date) : 'Date unavailable'].filter(Boolean).join(' · ') }
}

function resolvedIdentity(snapshot: SyncRecordSnapshot, context: PresentationSideContext): ResolvedIdentity {
  const payload = snapshot.payload
  if (snapshot.entityType === 'trackables') return trackableIdentity(context, snapshot.id, payload.currentVersion)
  if (snapshot.entityType === 'trackableVersions') {
    const owner = trackableIdentity(context, payload.trackableId, payload.version)
    return { ...owner, name: typeof payload.name === 'string' ? payload.name : owner.name }
  }
  if (snapshot.entityType === 'trackableFields') {
    const owner = trackableIdentity(context, payload.ownerTrackableId, payload.ownerTrackableVersion)
    const field = trackableIdentity(context, payload.fieldTrackableId, payload.fieldTrackableVersion)
    return { name: `${owner.name} → ${field.name}`, category: owner.category }
  }
  if (snapshot.entityType === 'trackableOptions') {
    const optionOwner = trackableIdentity(context, payload.trackableId, payload.trackableVersion)
    const structuredParent = singleStructuredParent(context, payload.trackableId, payload.trackableVersion)
    const parent = structuredParent ? trackableIdentity(context, structuredParent.payload.ownerTrackableId, structuredParent.payload.ownerTrackableVersion) : null
    const option = typeof payload.label === 'string' ? payload.label : 'Option label unavailable'
    return { name: `${parent ? `${parent.name} → ` : ''}${optionOwner.name} → ${option}`, category: parent?.category ?? optionOwner.category }
  }
  if (snapshot.entityType === 'observations') {
    const owner = trackableIdentity(context, payload.trackableId, payload.trackableVersion)
    return answerLocation(owner, snapshot, context)
  }
  if (snapshot.entityType === 'observationSelections') {
    const observation = record(context, 'observations', payload.observationId)
    const owner = trackableIdentity(context, observation?.payload.trackableId, observation?.payload.trackableVersion)
    return answerLocation(owner, snapshot, context)
  }
  if (snapshot.entityType === 'routineItems') {
    const routine = record(context, 'routines', payload.routineId)
    const routineName = typeof routine?.payload.name === 'string' ? routine.payload.name : 'Daily Check-In unavailable'
    const target = object(payload.target)
    if (target?.kind === 'trackable') {
      const owner = trackableIdentity(context, target.trackableId)
      return { name: `${routineName} → ${owner.name}`, category: owner.category }
    }
    const event = record(context, 'eventDefinitions', target?.eventDefinitionId)
    return { name: `${routineName} → ${typeof event?.payload.name === 'string' ? event.payload.name : 'Question unavailable'}`, category: '' }
  }
  if (snapshot.entityType === 'eventFields') {
    const event = record(context, 'eventDefinitions', payload.eventDefinitionId)
    const owner = trackableIdentity(context, payload.trackableId, payload.trackableVersion)
    return { name: `${typeof event?.payload.name === 'string' ? event.payload.name : 'Quick Log unavailable'} → ${owner.name}`, category: owner.category }
  }
  if (snapshot.entityType === 'trackableDailyAssertions') {
    const owner = trackableIdentity(context, payload.trackableId)
    return answerLocation(owner, snapshot, context)
  }
  const name = payload.name ?? payload.label
  return { name: typeof name === 'string' ? name : entityNames[snapshot.entityType] ?? 'Trace record', category: '' }
}

function location(identity: ResolvedIdentity): string {
  return identity.category ? `${identity.name} · ${identity.category}` : identity.name
}

function primitiveLabel(value: JsonValue | undefined): string {
  if (missing(value)) return 'None'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.length ? value.map(primitiveLabel).join(', ') : 'None'
  return 'Configured'
}

function answerLabel(snapshot: SyncRecordSnapshot, value: JsonValue | undefined, context: PresentationSideContext): string {
  const answer = object(value)
  if (!answer || typeof answer.state !== 'string') return 'Unanswered'
  if (answer.state !== 'answered') return answer.state === 'unanswered' ? 'Unanswered' : titleCase(answer.state)
  const observation = object(answer.value)
  if (!observation) return 'Answered'
  if (observation.kind === 'boolean') return observation.value === true ? 'Yes' : 'No'
  if (observation.kind === 'choice') {
    const selections = recordsOfType(context, 'observationSelections').filter((candidate) => !candidate.deletedAt && candidate.payload.observationId === snapshot.id)
    const labels = selections.map((selection) => optionName(context, selection.payload.optionId, snapshot.payload.trackableId, snapshot.payload.trackableVersion))
    if (typeof snapshot.payload.customChoiceValue === 'string' && snapshot.payload.customChoiceValue.trim()) labels.push(snapshot.payload.customChoiceValue.trim())
    return labels.length ? labels.join(', ') : 'Selected answer label unavailable'
  }
  const valueLabel = primitiveLabel(observation.value)
  return typeof observation.unit === 'string' ? `${valueLabel} ${observation.unit}` : valueLabel
}

function iconLabel(value: JsonValue | undefined): string {
  const icon = object(value)
  if (!icon || typeof icon.value !== 'string') return primitiveLabel(value)
  return icon.type === 'emoji' ? `${icon.value} · Emoji` : `${titleCase(icon.value)} · Trace icon`
}

function namedReference(
  field: string,
  value: JsonValue | undefined,
  context: PresentationSideContext,
  side: 'local' | 'synced',
): string | null {
  if (field === 'categoryId') return record(context, 'categories', value) ? categoryName(context, value) : side === 'local' ? 'On-device category unavailable' : 'Synced category unavailable'
  if (field === 'trackableId' || field === 'ownerTrackableId' || field === 'fieldTrackableId' || field === 'sourceTrackableId') {
    return record(context, 'trackables', value) ? trackableIdentity(context, value).name : side === 'local' ? 'On-device Trackable unavailable' : 'Synced Trackable unavailable'
  }
  if (field === 'eventDefinitionId') return typeof record(context, 'eventDefinitions', value)?.payload.name === 'string' ? String(record(context, 'eventDefinitions', value)?.payload.name) : 'Quick Log unavailable'
  if (field === 'routineId' || field === 'sourceRoutineId') return typeof record(context, 'routines', value)?.payload.name === 'string' ? String(record(context, 'routines', value)?.payload.name) : 'Daily Check-In unavailable'
  if (field === 'optionId') {
    return optionName(context, value)
  }
  if (field.endsWith('Id')) return side === 'local' ? 'On-device linked record' : 'Synced linked record'
  return null
}

function formatFieldValue(
  snapshot: SyncRecordSnapshot,
  field: string,
  value: JsonValue | undefined,
  context: PresentationSideContext,
  side: 'local' | 'synced',
): string {
  if (field === 'fieldTrackableId') {
    const identity = trackableIdentity(context, value, snapshot.payload.fieldTrackableVersion)
    const definition = versionRecord(context, value, snapshot.payload.fieldTrackableVersion)
    const answerStyle = typeof definition?.payload.inputType === 'string' ? inputTypeLabels[definition.payload.inputType] ?? titleCase(definition.payload.inputType) : null
    return `${identity.name}${answerStyle ? ` · ${answerStyle}` : ''}`
  }
  if (field === 'optionId') {
    const observation = parentObservation(snapshot, context)
    return optionName(context, value, observation?.payload.trackableId, observation?.payload.trackableVersion)
  }
  const reference = namedReference(field, value, context, side)
  if (reference) return reference
  if (field === 'answer' || field === 'defaultAnswer') return answerLabel(snapshot, value, context)
  if (field === 'icon') return iconLabel(value)
  if (field === 'colorRef') return side === 'local' ? 'On-device color' : 'Synced color'
  if (field === 'active') return value === true ? 'Visible' : 'Hidden'
  if (field === 'enabled') return value === true ? 'Included' : 'Not included'
  if (field === 'required' || field === 'completionBehavior') return value === true || value === 'expected' ? 'Required' : 'Optional'
  if (field === 'archivedAt') return missing(value) ? 'Active' : 'Archived'
  if (field === 'retiredAt') return missing(value) ? 'Current' : 'Retired'
  if (field === 'quickLogEnabled') return value === true ? 'Available' : 'Not available'
  if (field === 'recordSemantics') return value === 'daily_value' ? 'Daily value' : value === 'occurrence' ? 'Occurrence' : primitiveLabel(value)
  if (field === 'inputType') return typeof value === 'string' ? inputTypeLabels[value] ?? titleCase(value) : primitiveLabel(value)
  if (field === 'status') return value === 'did_not_occur' ? 'No' : value === 'occurred' ? 'Yes' : titleCase(String(value ?? ''))
  if (field === 'sortOrder') return typeof value === 'number' ? String(value + 1) : primitiveLabel(value)
  if (field === 'currentVersion' || field === 'trackableVersion' || field === 'fieldTrackableVersion' || field === 'ownerTrackableVersion') {
    const trackableId = field === 'currentVersion' ? snapshot.id
      : field === 'fieldTrackableVersion' ? snapshot.payload.fieldTrackableId
        : field === 'ownerTrackableVersion' ? snapshot.payload.ownerTrackableId
          : snapshot.payload.trackableId
    const definition = versionRecord(context, trackableId, value)
    const name = typeof definition?.payload.name === 'string' ? definition.payload.name : null
    const answerStyle = typeof definition?.payload.inputType === 'string' ? inputTypeLabels[definition.payload.inputType] ?? titleCase(definition.payload.inputType) : null
    return typeof value === 'number' ? `${name ? `${name} · ` : ''}${answerStyle ? `${answerStyle} · ` : ''}Version ${value}` : primitiveLabel(value)
  }
  if (field === 'weekdays' && Array.isArray(value)) return value.map((day) => typeof day === 'number' ? weekdayLabels[day] ?? String(day) : String(day)).join(', ')
  if (field.endsWith('OptionIds') && Array.isArray(value)) {
    const labels = value.map((optionId) => namedReference('optionId', optionId, context, side) ?? 'Option unavailable')
    return labels.length ? labels.join(', ') : 'None'
  }
  if (typeof value === 'string' && (field.endsWith('Mode') || field.endsWith('Behavior') || field === 'dataRole' || field === 'frequency' || field === 'valueDirection')) return titleCase(value)
  return primitiveLabel(value)
}

function displayedDifference(field: string, local: string, synced: string): ConflictDifference {
  if (local !== synced) return { field, local, synced }
  return { field, local: `${local} (on-device record)`, synced: `${synced} (synced record)` }
}

function addNestedDifferences(
  differences: ConflictDifference[],
  localSnapshot: SyncRecordSnapshot,
  syncedSnapshot: SyncRecordSnapshot,
  prefix: string,
  localValue: JsonValue | undefined,
  syncedValue: JsonValue | undefined,
  context: ConflictPresentationContext,
  field: string,
): void {
  const localObject = object(localValue)
  const syncedObject = object(syncedValue)
  if (localObject || syncedObject) {
    const fields = new Set([...Object.keys(localObject ?? {}), ...Object.keys(syncedObject ?? {})])
    if (fields.size === 0) {
      differences.push(displayedDifference(prefix, localObject ? 'No settings' : 'None', syncedObject ? 'No settings' : 'None'))
      return
    }
    for (const nestedField of fields) {
      const localNested = localObject?.[nestedField]
      const syncedNested = syncedObject?.[nestedField]
      if (stableStringify(localNested) === stableStringify(syncedNested)) continue
      addNestedDifferences(differences, localSnapshot, syncedSnapshot, `${prefix} · ${fieldLabels[nestedField] ?? titleCase(nestedField)}`, localNested, syncedNested, context, nestedField)
    }
    return
  }
  differences.push(displayedDifference(
    prefix,
    formatFieldValue(localSnapshot, field, localValue, context.local, 'local'),
    formatFieldValue(syncedSnapshot, field, syncedValue, context.synced, 'synced'),
  ))
}

const answerInterpretationFields = ['name', 'inputType', 'unit', 'scaleMin', 'scaleMax', 'scaleStep', 'valueDirection', 'configuration'] as const

function addAnswerDefinitionDifferences(
  differences: ConflictDifference[],
  conflict: SyncConflictSnapshot,
  context: ConflictPresentationContext,
): void {
  const localDefinition = versionRecord(context.local, conflict.local.payload.trackableId, conflict.local.payload.trackableVersion)
  const syncedDefinition = versionRecord(context.synced, conflict.remote.payload.trackableId, conflict.remote.payload.trackableVersion)
  if (!localDefinition || !syncedDefinition) {
    if (localDefinition !== syncedDefinition) differences.push({
      field: 'Question definition',
      local: localDefinition ? 'Historical definition available' : 'Historical definition unavailable',
      synced: syncedDefinition ? 'Historical definition available' : 'Historical definition unavailable',
    })
    return
  }
  for (const field of answerInterpretationFields) {
    const localValue = localDefinition.payload[field]
    const syncedValue = syncedDefinition.payload[field]
    if (stableStringify(localValue) === stableStringify(syncedValue)) continue
    const label = `Question definition · ${fieldLabel('trackableVersions', field)}`
    if (field === 'configuration') addNestedDifferences(differences, localDefinition, syncedDefinition, label, localValue, syncedValue, context, field)
    else differences.push(displayedDifference(
      label,
      formatFieldValue(localDefinition, field, localValue, context.local, 'local'),
      formatFieldValue(syncedDefinition, field, syncedValue, context.synced, 'synced'),
    ))
  }
}

function differencesFor(conflict: SyncConflictSnapshot, context: ConflictPresentationContext): readonly ConflictDifference[] {
  const differences: ConflictDifference[] = []
  if (Boolean(conflict.local.deletedAt) !== Boolean(conflict.remote.deletedAt)) {
    differences.push({ field: 'Record status', local: conflict.local.deletedAt ? 'Deleted' : 'Present', synced: conflict.remote.deletedAt ? 'Deleted' : 'Present' })
  }
  for (const field of meaningfulPayloadDifferences(conflict.local as SyncRecord, conflict.remote as SyncRecord)) {
    if (conflict.local.entityType === 'observations' && field === 'trackableVersion') {
      addAnswerDefinitionDifferences(differences, conflict, context)
      continue
    }
    const label = fieldLabel(conflict.local.entityType, field)
    const localValue = conflict.local.payload[field]
    const syncedValue = conflict.remote.payload[field]
    if (['configuration', 'conditionalRule', 'reminder', 'target'].includes(field)) {
      addNestedDifferences(differences, conflict.local, conflict.remote, label, localValue, syncedValue, context, field)
    } else {
      differences.push(displayedDifference(
        label,
        formatFieldValue(conflict.local, field, localValue, context.local, 'local'),
        formatFieldValue(conflict.remote, field, syncedValue, context.synced, 'synced'),
      ))
    }
  }
  return differences
}

function dateContext(snapshot: SyncRecordSnapshot): string {
  const localDate = snapshot.payload.localDate ?? snapshot.payload.date
  return typeof localDate === 'string' ? localDate : ''
}

function isAnswerConflict(entityType: string): boolean {
  return entityType === 'observations' || entityType === 'observationSelections' || entityType === 'trackableDailyAssertions' || entityType === 'eventDailyAssertions'
}

function explanationFor(conflict: SyncConflictSnapshot, context: ConflictPresentationContext): string {
  if (isAnswerConflict(conflict.local.entityType)) {
    const localDate = answerDate(conflict.local, context.local)
    const syncedDate = answerDate(conflict.remote, context.synced)
    if (localDate && syncedDate && localDate !== syncedDate) return 'These saved answers belong to different Daily Check-In dates, shown above. Choose which copy to keep.'
    const date = localDate ?? syncedDate
    const dateText = date ? ` for ${formatDate(date)}` : ''
    if (conflict.kind === 'delete-vs-edit') return `One copy deleted this Daily Check-In answer while the other kept or changed it. Choose which answer state to keep${dateText}.`
    return `This Daily Check-In answer is different on this device and in your synced backup. Choose which answer to keep${dateText}.`
  }
  if (conflict.kind === 'delete-vs-edit') return 'One copy deleted this record while the other changed it. Choose whether it should remain or stay deleted.'
  if (conflict.kind === 'identity-collision') return `Both copies claim to be the same ${entityNames[conflict.local.entityType] ?? 'record'}. Trace kept both snapshots until you choose.`
  if (['trackables', 'trackableVersions', 'trackableOptions', 'trackableFields', 'routineItems'].includes(conflict.local.entityType)) return 'These settings differ on this device and in your synced backup.'
  return `This ${entityNames[conflict.local.entityType] ?? 'record'} differs on this device and in your synced backup.`
}

export function presentSyncConflict(conflict: SyncConflictSnapshot, context: ConflictPresentationContext): ConflictPresentation {
  const localIdentity = resolvedIdentity(conflict.local, context.local)
  const syncedIdentity = resolvedIdentity(conflict.remote, context.synced)
  const sameIdentity = location(localIdentity) === location(syncedIdentity)
  const sameName = localIdentity.name === syncedIdentity.name
  return {
    title: sameName ? localIdentity.name : `${entityNames[conflict.local.entityType] ?? 'Record'} conflict`,
    context: sameIdentity ? localIdentity.category || dateContext(conflict.local) : dateContext(conflict.local),
    explanation: explanationFor(conflict, context),
    ...(!sameIdentity ? { locations: { local: location(localIdentity), synced: location(syncedIdentity) } } : {}),
    differences: differencesFor(conflict, context),
  }
}
