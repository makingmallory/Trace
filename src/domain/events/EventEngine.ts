import type { DataRepository } from '../../data/repository/DataRepository.ts'
import { migrateLegacyEvents } from '../../data/migrations/unifyTrackables.ts'
import { categoryPresets } from '../../presets/trackablePresets.ts'
import { eventPresets } from '../../presets/eventPresets.ts'
import { isSupportedIcon } from '../../presets/iconLibrary.ts'
import type {
  Category, DataRole, EventDefinition, EventTimingMode, IANATimeZone, IconReference, TrackableField,
  LogRecord, Observation, ObservationAnswer, ObservationOptionSelection, RecordSource, TimeOfDayBucket, TimePrecision,
  Trackable, TrackableOption, TrackableVersion,
} from '../models/index.ts'
import { isQuickLogEligible } from '../trackables/trackableSemantics.ts'

export interface EventDefinitionDraft {
  name: string
  description?: string
  categoryId: string
  icon?: IconReference
  timingMode: EventTimingMode
  dataRole: DataRole
  trackableIds: readonly string[]
}

export interface EventQuestion {
  field: TrackableField
  trackable: Trackable
  version: TrackableVersion
  options: readonly TrackableOption[]
  category: Category
}

export interface EventDefinitionDetails {
  definition: EventDefinition
  fields: readonly EventQuestion[]
}

export interface EventLibrary {
  categories: readonly Category[]
  active: readonly EventDefinitionDetails[]
  archived: readonly EventDefinitionDetails[]
  availableTrackables: readonly { trackable: Trackable; version: TrackableVersion }[]
}

export interface EventEndpointDraft {
  localDate: string
  precision: TimePrecision
  localTime?: string
  timeOfDay?: TimeOfDayBucket
}

export interface EventTimingDraft {
  occurrence: 'point' | 'duration'
  start: EventEndpointDraft
  end?: EventEndpointDraft
  ongoing?: boolean
  timezone: IANATimeZone | null
}

export interface EventAnswerDraft {
  trackableId: string
  answer: ObservationAnswer
  selectedOptionIds?: readonly string[]
}

export interface LogEventDraft {
  eventDefinitionId: string
  timing: EventTimingDraft
  answers: readonly EventAnswerDraft[]
  source?: RecordSource
}

export interface LoggedEvent {
  record: LogRecord
  observations: readonly Observation[]
  selections: readonly ObservationOptionSelection[]
}

export class EventValidationError extends Error {
  readonly issues: readonly string[]
  constructor(issues: readonly string[]) {
    super(issues.join(' ')); this.name = 'EventValidationError'; this.issues = issues
  }
}

function localIso(localDate: string, localTime: string): string {
  const date = new Date(`${localDate}T${localTime}:00`)
  if (Number.isNaN(date.valueOf())) throw new EventValidationError(['Enter a valid date and time.'])
  return date.toISOString()
}

function validateEndpoint(label: string, endpoint: EventEndpointDraft, issues: string[]): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endpoint.localDate)) issues.push(`${label} date is required.`)
  if (endpoint.precision === 'exact' && !endpoint.localTime) issues.push(`${label} exact time is required.`)
  if (endpoint.precision === 'timeOfDay' && !endpoint.timeOfDay) issues.push(`${label} time of day is required.`)
  if (endpoint.precision !== 'exact' && endpoint.localTime) issues.push(`${label} clock time is only valid for Exact time.`)
  if (endpoint.precision !== 'timeOfDay' && endpoint.timeOfDay) issues.push(`${label} time-of-day bucket is only valid for Time of day.`)
}

function prepareEventTiming(details: EventDefinitionDetails, timing: EventTimingDraft) {
  const issues: string[] = []
  validateEndpoint('Start', timing.start, issues)
  if (details.definition.timingMode === 'dayOnly' && (timing.start.precision !== 'day' || timing.occurrence !== 'point')) issues.push('Day-only events use a known date without a clock time.')
  if (details.definition.timingMode === 'point' && timing.occurrence !== 'point') issues.push('This event type is point-in-time.')
  if (details.definition.timingMode === 'duration' && timing.occurrence !== 'duration') issues.push('This event type records a duration.')
  if (timing.occurrence === 'point' && (timing.end || timing.ongoing)) issues.push('Point events cannot have an end.')
  if (timing.occurrence === 'duration' && !timing.ongoing && !timing.end) issues.push('Choose an end or mark this event ongoing.')
  if (timing.occurrence === 'duration' && !timing.ongoing && timing.end) validateEndpoint('End', timing.end, issues)
  if (timing.end && timing.end.localDate < timing.start.localDate) issues.push('End date must be on or after start date.')
  if (issues.length) throw new EventValidationError(issues)
  const startTime = timing.start.precision === 'exact' ? localIso(timing.start.localDate, timing.start.localTime!) : null
  const ended = timing.occurrence === 'duration' && !timing.ongoing ? timing.end! : null
  const endTime = ended?.precision === 'exact' ? localIso(ended.localDate, ended.localTime!) : null
  if (startTime && endTime && endTime < startTime) throw new EventValidationError(['End time must be after start time.'])
  return {
    eventTimingKind: timing.occurrence,
    localDate: timing.start.localDate,
    startTimePrecision: timing.start.precision,
    startTime,
    startTimeOfDay: timing.start.precision === 'timeOfDay' ? timing.start.timeOfDay! : null,
    endLocalDate: ended?.localDate ?? null,
    endTimePrecision: ended?.precision ?? null,
    endTime,
    endTimeOfDay: ended?.precision === 'timeOfDay' ? ended.timeOfDay! : null,
    ongoing: timing.occurrence === 'duration' && Boolean(timing.ongoing),
    timezone: startTime || endTime ? timing.timezone : null,
  } as const
}

function validateEventAnswers(details: EventDefinitionDetails, answers: readonly EventAnswerDraft[]): void {
  const fieldIds = new Set(details.fields.map((item) => item.trackable.id))
  if (answers.some((item) => !fieldIds.has(item.trackableId))) throw new EventValidationError(['An answer does not belong to this event type.'])
}

export class EventEngine {
  private initialization: Promise<void> | null = null
  private readonly repository: DataRepository
  private readonly now: () => Date
  private readonly createId: () => string
  constructor(
    repository: DataRepository,
    now: () => Date = () => new Date(),
    createId: () => string = () => crypto.randomUUID(),
  ) { this.repository = repository; this.now = now; this.createId = createId }

  private timestamp(): string { return this.now().toISOString() }

  initialize(): Promise<void> {
    if (!this.initialization) this.initialization = this.seed()
    return this.initialization
  }

  private async seed(): Promise<void> {
    if ((await this.repository.getAll('categories')).length === 0) {
      const timestamp = this.timestamp()
      await this.repository.saveMany('categories', categoryPresets.map((preset) => ({
        id: preset.id, name: preset.name, sortOrder: preset.sortOrder, active: true,
        createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
      })))
    }
    await migrateLegacyEvents(this.repository)
    const existing = await this.repository.getAll('trackables')
    const timestamp = this.timestamp()
    const missing = eventPresets.filter((preset) => !existing.some((item) => item.id === preset.id))
    await this.repository.saveTransaction([
      { collection: 'trackables', entities: missing.map((preset) => ({
        id: preset.id, categoryId: preset.categoryId, active: true, archivedAt: null, currentVersion: 1,
        tags: [], dataRole: preset.dataRole, recordSemantics: 'occurrence' as const, quickLogEnabled: true, quickLogTimingMode: preset.timingMode,
        icon: preset.icon, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
      })) },
      { collection: 'trackableVersions', entities: missing.map((preset) => ({
        id: `${preset.id}:v1`, trackableId: preset.id, version: 1, name: preset.name, description: preset.description,
        inputType: 'boolean' as const, valueDirection: 'neutral' as const, configuration: {}, retiredAt: null,
        createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
      })) },
    ])
  }

  async getLibrary(): Promise<EventLibrary> {
    await this.initialize()
    const [categories, fields, trackables, versions, options] = await Promise.all([
      this.repository.getAll('categories'), this.repository.getAll('trackableFields'),
      this.repository.getAll('trackables'), this.repository.getAll('trackableVersions'), this.repository.getAll('trackableOptions'),
    ])
    const activeTrackables = trackables.filter((item) => item.active && !item.deletedAt).flatMap((trackable) => {
      const version = versions.find((item) => item.trackableId === trackable.id && item.version === trackable.currentVersion)
      return version ? [{ trackable, version }] : []
    })
    const details = trackables.filter((item) => isQuickLogEligible(item) && !item.deletedAt).flatMap((owner): EventDefinitionDetails[] => {
      const ownerVersion = versions.find((item) => item.trackableId === owner.id && item.version === owner.currentVersion)
      if (!ownerVersion) return []
      const definition: EventDefinition = { ...owner, name: ownerVersion.name, description: ownerVersion.description,
        timingMode: owner.quickLogTimingMode ?? 'either', nightlyReminderDefault: 'never', treatmentFollowUpEnabled: false }
      return [{ definition,
      fields: fields.filter((field) => field.ownerTrackableId === owner.id && field.enabled && !field.deletedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder).flatMap((field) => {
          const trackable = trackables.find((item) => item.id === field.fieldTrackableId)
          const version = versions.find((item) => item.trackableId === field.fieldTrackableId && item.version === field.fieldTrackableVersion)
          const category = trackable ? categories.find((item) => item.id === trackable.categoryId) : undefined
          return trackable && version && category ? [{ field, trackable, version, category,
            options: options.filter((item) => item.trackableId === trackable.id && item.trackableVersion === version.version && item.active && !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder) }] : []
        }),
      }]
    })
    return {
      categories: [...categories].filter((item) => !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder),
      active: details.filter((item) => item.definition.active),
      archived: details.filter((item) => !item.definition.active),
      availableTrackables: activeTrackables,
    }
  }

  async getDetails(id: string): Promise<EventDefinitionDetails> {
    const library = await this.getLibrary()
    const details = [...library.active, ...library.archived].find((item) => item.definition.id === id)
    if (!details) throw new EventValidationError(['Quick Log Trackable was not found.'])
    return details
  }

  private validateDraft(draft: EventDefinitionDraft, library: EventLibrary): void {
    const issues: string[] = []
    if (!draft.name.trim()) issues.push('Name is required.')
    if (!library.categories.some((item) => item.id === draft.categoryId)) issues.push('Choose a category.')
    if (!isSupportedIcon(draft.icon)) issues.push('Choose a built-in icon or a short emoji.')
    if (new Set(draft.trackableIds).size !== draft.trackableIds.length) issues.push('Each detail field may only be added once.')
    const available = new Set(library.availableTrackables.map((item) => item.trackable.id))
    if (draft.trackableIds.some((id) => !available.has(id))) issues.push('Detail fields must reference active Trackables.')
    if (issues.length) throw new EventValidationError(issues)
  }

  async createDefinition(draft: EventDefinitionDraft): Promise<EventDefinitionDetails> {
    const library = await this.getLibrary(); this.validateDraft(draft, library)
    const timestamp = this.timestamp(); const id = this.createId()
    const trackable: Trackable = {
      id, categoryId: draft.categoryId, active: true, archivedAt: null, currentVersion: 1, tags: [],
      icon: draft.icon, quickLogTimingMode: draft.timingMode, dataRole: draft.dataRole, recordSemantics: 'occurrence', quickLogEnabled: true,
      createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
    }
    const version: TrackableVersion = { id: this.createId(), trackableId: id, version: 1, name: draft.name.trim(),
      description: draft.description?.trim() || undefined, inputType: 'boolean', valueDirection: 'neutral', configuration: {}, retiredAt: null,
      createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
    await this.repository.saveTransaction([{ collection: 'trackables', entities: [trackable] }, { collection: 'trackableVersions', entities: [version] }])
    await this.saveFields(id, draft.trackableIds, timestamp)
    return this.getDetails(id)
  }

  async updateDefinition(id: string, draft: EventDefinitionDraft): Promise<EventDefinitionDetails> {
    const library = await this.getLibrary(); this.validateDraft(draft, library)
    const current = await this.repository.getById('trackables', id)
    if (!current || current.deletedAt || !isQuickLogEligible(current)) throw new EventValidationError(['Quick Log Trackable was not found.'])
    const currentVersion = (await this.repository.getAll('trackableVersions')).find((item) => item.trackableId === id && item.version === current.currentVersion)!
    const timestamp = this.timestamp()
    const nextVersion: TrackableVersion = { ...currentVersion, id: this.createId(), version: current.currentVersion + 1,
      name: draft.name.trim(), description: draft.description?.trim() || undefined, retiredAt: null,
      createdAt: timestamp, updatedAt: timestamp, revision: 1 }
    await this.repository.saveTransaction([
      { collection: 'trackables', entities: [{ ...current, categoryId: draft.categoryId, icon: draft.icon,
        quickLogTimingMode: draft.timingMode, dataRole: draft.dataRole, currentVersion: nextVersion.version,
        updatedAt: timestamp, revision: current.revision + 1 }] },
      { collection: 'trackableVersions', entities: [{ ...currentVersion, retiredAt: timestamp, updatedAt: timestamp, revision: currentVersion.revision + 1 }, nextVersion] },
    ])
    await this.saveFields(id, draft.trackableIds, timestamp)
    return this.getDetails(id)
  }

  private async saveFields(ownerTrackableId: string, trackableIds: readonly string[], timestamp: string): Promise<void> {
    const current = (await this.repository.getAll('trackableFields')).filter((item) => item.ownerTrackableId === ownerTrackableId && !item.deletedAt)
    const trackables = await this.repository.getAll('trackables')
    const wanted = new Set(trackableIds)
    await this.repository.saveMany('trackableFields', current.filter((item) => !wanted.has(item.fieldTrackableId)).map((item) => ({
      ...item, enabled: false, updatedAt: timestamp, revision: item.revision + 1,
    })))
    for (const [sortOrder, trackableId] of trackableIds.entries()) {
      const trackable = trackables.find((item) => item.id === trackableId)!
      const existing = current.find((item) => item.fieldTrackableId === trackableId)
      await this.repository.save('trackableFields', existing ? { ...existing, enabled: true, sortOrder, fieldTrackableVersion: trackable.currentVersion, updatedAt: timestamp, revision: existing.revision + 1 } : {
        id: this.createId(), ownerTrackableId, fieldTrackableId: trackableId, fieldTrackableVersion: trackable.currentVersion, sortOrder, enabled: true,
        completionBehavior: 'optional', createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
      })
    }
  }

  async setDefinitionActive(id: string, active: boolean): Promise<void> {
    const current = await this.repository.getById('trackables', id)
    if (!current || current.deletedAt || !isQuickLogEligible(current)) throw new EventValidationError(['Quick Log Trackable was not found.'])
    const timestamp = this.timestamp()
    await this.repository.save('trackables', { ...current, active, archivedAt: active ? null : timestamp, updatedAt: timestamp, revision: current.revision + 1 })
  }

  async logEvent(draft: LogEventDraft): Promise<LoggedEvent> {
    const details = await this.getDetails(draft.eventDefinitionId)
    if (!details.definition.active) throw new EventValidationError(['Archived Trackables cannot be logged.'])
    validateEventAnswers(details, draft.answers)
    const timingFields = prepareEventTiming(details, draft.timing)
    const timestamp = this.timestamp()
    const owner = await this.repository.getById('trackables', details.definition.id)
    const record: LogRecord = {
      id: this.createId(), recordKind: 'quick_log', trackableId: details.definition.id, trackableVersion: owner?.currentVersion ?? 1, ...timingFields,
      status: 'completed', source: draft.source ?? 'app', createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
    }
    const observations: Observation[] = []
    const selections: ObservationOptionSelection[] = []
    for (const field of details.fields) {
      const saved = draft.answers.find((item) => item.trackableId === field.trackable.id) ?? { trackableId: field.trackable.id, answer: { state: 'unanswered' as const } }
      const observation: Observation = { id: this.createId(), logRecordId: record.id, trackableId: field.trackable.id,
        trackableVersion: field.field.fieldTrackableVersion, answer: saved.answer, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
      observations.push(observation)
      if (saved.answer.state === 'answered' && saved.answer.value.kind === 'choice') {
        const validOptions = new Set(field.options.map((item) => item.optionId))
        for (const optionId of saved.selectedOptionIds ?? []) {
          if (!validOptions.has(optionId)) throw new EventValidationError(['A selected option does not belong to its Trackable version.'])
          selections.push({ id: this.createId(), observationId: observation.id, optionId, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 })
        }
      }
    }
    await this.repository.save('logRecords', record)
    await this.repository.saveMany('observations', observations)
    await this.repository.saveMany('observationSelections', selections)
    return { record, observations, selections }
  }

  async getLoggedEvent(recordId: string): Promise<LoggedEvent & { details: EventDefinitionDetails }> {
    const record = await this.repository.getById('logRecords', recordId)
    const ownerId = record?.trackableId ?? record?.eventDefinitionId
    if (!record || !['quick_log', 'event'].includes(record.recordKind) || !ownerId || record.deletedAt) throw new EventValidationError(['Quick Log entry was not found.'])
    const details = await this.getDetails(ownerId)
    const observations = (await this.repository.getAll('observations')).filter((item) => item.logRecordId === record.id && !item.deletedAt)
    const ids = new Set(observations.map((item) => item.id))
    const selections = (await this.repository.getAll('observationSelections')).filter((item) => ids.has(item.observationId) && !item.deletedAt)
    return { record, observations, selections, details }
  }

  async updateEvent(recordId: string, draft: LogEventDraft): Promise<LoggedEvent> {
    const existing = await this.getLoggedEvent(recordId)
    if ((existing.record.trackableId ?? existing.record.eventDefinitionId) !== draft.eventDefinitionId) throw new EventValidationError(['A Quick Log entry cannot change its Trackable.'])
    validateEventAnswers(existing.details, draft.answers)
    const timingFields = prepareEventTiming(existing.details, draft.timing)
    const timestamp = this.timestamp()
    const record: LogRecord = { ...existing.record, ...timingFields, source: draft.source ?? existing.record.source, updatedAt: timestamp, revision: existing.record.revision + 1 }
    await this.repository.save('logRecords', record)

    const observations: Observation[] = []
    const selections: ObservationOptionSelection[] = []
    const allSelections = await this.repository.getAll('observationSelections')
    for (const field of existing.details.fields) {
      const saved = draft.answers.find((item) => item.trackableId === field.trackable.id) ?? { trackableId: field.trackable.id, answer: { state: 'unanswered' as const } }
      const previous = existing.observations.find((item) => item.trackableId === field.trackable.id)
      const observation: Observation = previous
        ? { ...previous, answer: saved.answer, deletedAt: null, updatedAt: timestamp, revision: previous.revision + 1 }
        : { id: this.createId(), logRecordId: record.id, trackableId: field.trackable.id, trackableVersion: field.field.fieldTrackableVersion, answer: saved.answer, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
      observations.push(observation)
      await this.repository.save('observations', observation)
      const wanted = new Set(saved.answer.state === 'answered' && saved.answer.value.kind === 'choice' ? saved.selectedOptionIds ?? [] : [])
      const previousSelections = allSelections.filter((item) => item.observationId === observation.id)
      await this.repository.saveMany('observationSelections', previousSelections.filter((item) => !item.deletedAt && !wanted.has(item.optionId)).map((item) => ({ ...item, deletedAt: timestamp, updatedAt: timestamp, revision: item.revision + 1 })))
      for (const optionId of wanted) {
        const prior = previousSelections.find((item) => item.optionId === optionId)
        const selection = prior ? { ...prior, deletedAt: null, updatedAt: timestamp, revision: prior.revision + 1 } : { id: this.createId(), observationId: observation.id, optionId, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
        selections.push(selection)
        await this.repository.save('observationSelections', selection)
      }
    }
    return { record, observations, selections }
  }

  async getRecentDefinitions(limit = 4): Promise<readonly EventDefinitionDetails[]> {
    const library = await this.getLibrary()
    const records = (await this.repository.getAll('logRecords')).filter((item) => ['quick_log', 'event'].includes(item.recordKind) && !item.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const ids = [...new Set(records.map((item) => item.trackableId ?? item.eventDefinitionId).filter((id): id is string => Boolean(id)))]
    return ids.slice(0, limit).flatMap((id) => library.active.find((item) => item.definition.id === id) ?? [])
  }

  async getEventsForDate(localDate: string): Promise<readonly { record: LogRecord; definition: EventDefinition }[]> {
    const library = await this.getLibrary(); const definitions = new Map(library.active.concat(library.archived).map((item) => [item.definition.id, item.definition]))
    return (await this.repository.getAll('logRecords')).filter((item) => ['quick_log', 'event'].includes(item.recordKind) && item.localDate === localDate && !item.deletedAt)
      .flatMap((record) => { const definition = definitions.get(record.trackableId ?? record.eventDefinitionId ?? ''); return definition ? [{ record, definition }] : [] })
      .sort((a, b) => (a.record.startTime ?? '').localeCompare(b.record.startTime ?? ''))
  }
}
