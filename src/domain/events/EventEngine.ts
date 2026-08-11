import type { DataRepository } from '../../data/repository/DataRepository.ts'
import { categoryPresets } from '../../presets/trackablePresets.ts'
import { eventPresets } from '../../presets/eventPresets.ts'
import { isSupportedIcon } from '../../presets/iconLibrary.ts'
import type {
  Category, DataRole, EventDefinition, EventField, EventTimingMode, IANATimeZone, IconReference,
  LogRecord, Observation, ObservationAnswer, ObservationOptionSelection, RecordSource, TimeOfDayBucket, TimePrecision,
  Trackable, TrackableOption, TrackableVersion,
} from '../models/index.ts'

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
  field: EventField
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
    if ((await this.repository.getAll('eventDefinitions')).length > 0) return
    const timestamp = this.timestamp()
    await this.repository.saveMany('eventDefinitions', eventPresets.map((preset) => ({
      id: preset.id, name: preset.name, description: preset.description, categoryId: preset.categoryId,
      icon: preset.icon, timingMode: preset.timingMode, dataRole: preset.dataRole, active: true,
      nightlyReminderDefault: 'never', treatmentFollowUpEnabled: false,
      createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
    })))
  }

  async getLibrary(): Promise<EventLibrary> {
    await this.initialize()
    const [categories, definitions, fields, trackables, versions, options] = await Promise.all([
      this.repository.getAll('categories'), this.repository.getAll('eventDefinitions'), this.repository.getAll('eventFields'),
      this.repository.getAll('trackables'), this.repository.getAll('trackableVersions'), this.repository.getAll('trackableOptions'),
    ])
    const activeTrackables = trackables.filter((item) => item.active && !item.deletedAt).flatMap((trackable) => {
      const version = versions.find((item) => item.trackableId === trackable.id && item.version === trackable.currentVersion)
      return version ? [{ trackable, version }] : []
    })
    const details = definitions.filter((item) => !item.deletedAt).map((definition) => ({
      definition,
      fields: fields.filter((field) => field.eventDefinitionId === definition.id && field.enabled && !field.deletedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder).flatMap((field) => {
          const trackable = trackables.find((item) => item.id === field.trackableId)
          const version = versions.find((item) => item.trackableId === field.trackableId && item.version === field.trackableVersion)
          const category = trackable ? categories.find((item) => item.id === trackable.categoryId) : undefined
          return trackable && version && category ? [{ field, trackable, version, category,
            options: options.filter((item) => item.trackableId === trackable.id && item.trackableVersion === version.version && item.active && !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder) }] : []
        }),
    }))
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
    if (!details) throw new EventValidationError(['Event type was not found.'])
    return details
  }

  private validateDraft(draft: EventDefinitionDraft, library: EventLibrary): void {
    const issues: string[] = []
    if (!draft.name.trim()) issues.push('Name is required.')
    if (!library.categories.some((item) => item.id === draft.categoryId)) issues.push('Choose a category.')
    if (!isSupportedIcon(draft.icon)) issues.push('Choose a built-in icon or a short emoji.')
    if (new Set(draft.trackableIds).size !== draft.trackableIds.length) issues.push('Each Event Field may only be added once.')
    const available = new Set(library.availableTrackables.map((item) => item.trackable.id))
    if (draft.trackableIds.some((id) => !available.has(id))) issues.push('Event Fields must reference active Trackables.')
    if (issues.length) throw new EventValidationError(issues)
  }

  async createDefinition(draft: EventDefinitionDraft): Promise<EventDefinitionDetails> {
    const library = await this.getLibrary(); this.validateDraft(draft, library)
    const timestamp = this.timestamp(); const id = this.createId()
    const definition: EventDefinition = {
      id, name: draft.name.trim(), description: draft.description?.trim() || undefined, categoryId: draft.categoryId,
      icon: draft.icon, timingMode: draft.timingMode, dataRole: draft.dataRole, active: true,
      nightlyReminderDefault: 'never', treatmentFollowUpEnabled: false,
      createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
    }
    await this.repository.save('eventDefinitions', definition)
    await this.saveFields(id, draft.trackableIds, timestamp)
    return this.getDetails(id)
  }

  async updateDefinition(id: string, draft: EventDefinitionDraft): Promise<EventDefinitionDetails> {
    const library = await this.getLibrary(); this.validateDraft(draft, library)
    const current = await this.repository.getById('eventDefinitions', id)
    if (!current || current.deletedAt) throw new EventValidationError(['Event type was not found.'])
    const timestamp = this.timestamp()
    await this.repository.save('eventDefinitions', { ...current, name: draft.name.trim(), description: draft.description?.trim() || undefined,
      categoryId: draft.categoryId, icon: draft.icon, timingMode: draft.timingMode, dataRole: draft.dataRole,
      updatedAt: timestamp, revision: current.revision + 1 })
    await this.saveFields(id, draft.trackableIds, timestamp)
    return this.getDetails(id)
  }

  private async saveFields(eventDefinitionId: string, trackableIds: readonly string[], timestamp: string): Promise<void> {
    const current = (await this.repository.getAll('eventFields')).filter((item) => item.eventDefinitionId === eventDefinitionId && !item.deletedAt)
    const trackables = await this.repository.getAll('trackables')
    const wanted = new Set(trackableIds)
    await this.repository.saveMany('eventFields', current.filter((item) => !wanted.has(item.trackableId)).map((item) => ({
      ...item, enabled: false, updatedAt: timestamp, revision: item.revision + 1,
    })))
    for (const [sortOrder, trackableId] of trackableIds.entries()) {
      const trackable = trackables.find((item) => item.id === trackableId)!
      const existing = current.find((item) => item.trackableId === trackableId)
      await this.repository.save('eventFields', existing ? { ...existing, enabled: true, sortOrder, trackableVersion: trackable.currentVersion, updatedAt: timestamp, revision: existing.revision + 1 } : {
        id: this.createId(), eventDefinitionId, trackableId, trackableVersion: trackable.currentVersion, sortOrder, enabled: true,
        completionBehavior: 'optional', createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
      })
    }
  }

  async setDefinitionActive(id: string, active: boolean): Promise<void> {
    const current = await this.repository.getById('eventDefinitions', id)
    if (!current || current.deletedAt) throw new EventValidationError(['Event type was not found.'])
    await this.repository.save('eventDefinitions', { ...current, active, updatedAt: this.timestamp(), revision: current.revision + 1 })
  }

  async logEvent(draft: LogEventDraft): Promise<LoggedEvent> {
    const details = await this.getDetails(draft.eventDefinitionId)
    if (!details.definition.active) throw new EventValidationError(['Archived event types cannot be logged.'])
    const { timing } = draft
    const issues: string[] = []
    validateEndpoint('Start', timing.start, issues)
    if (details.definition.timingMode === 'dayOnly' && (timing.start.precision !== 'day' || timing.occurrence !== 'point')) issues.push('Day-only events use a known date without a clock time.')
    if (details.definition.timingMode === 'point' && timing.occurrence !== 'point') issues.push('This event type is point-in-time.')
    if (details.definition.timingMode === 'duration' && timing.occurrence !== 'duration') issues.push('This event type records a duration.')
    if (timing.occurrence === 'point' && (timing.end || timing.ongoing)) issues.push('Point events cannot have an end.')
    if (timing.occurrence === 'duration' && !timing.ongoing && !timing.end) issues.push('Choose an end or mark this event ongoing.')
    if (timing.occurrence === 'duration' && !timing.ongoing && timing.end) validateEndpoint('End', timing.end, issues)
    if (timing.end && timing.end.localDate < timing.start.localDate) issues.push('End date must be on or after start date.')
    const fieldIds = new Set(details.fields.map((item) => item.trackable.id))
    if (draft.answers.some((item) => !fieldIds.has(item.trackableId))) issues.push('An answer does not belong to this event type.')
    if (issues.length) throw new EventValidationError(issues)

    const timestamp = this.timestamp()
    const startTime = timing.start.precision === 'exact' ? localIso(timing.start.localDate, timing.start.localTime!) : null
    const ended = timing.occurrence === 'duration' && !timing.ongoing ? timing.end! : null
    const endTime = ended?.precision === 'exact' ? localIso(ended.localDate, ended.localTime!) : null
    if (startTime && endTime && endTime < startTime) throw new EventValidationError(['End time must be after start time.'])
    const record: LogRecord = {
      id: this.createId(), recordKind: 'event', eventDefinitionId: details.definition.id, eventTimingKind: timing.occurrence,
      localDate: timing.start.localDate, startTimePrecision: timing.start.precision, startTime,
      startTimeOfDay: timing.start.precision === 'timeOfDay' ? timing.start.timeOfDay! : null,
      endLocalDate: ended?.localDate ?? null, endTimePrecision: ended?.precision ?? null, endTime,
      endTimeOfDay: ended?.precision === 'timeOfDay' ? ended.timeOfDay! : null,
      ongoing: timing.occurrence === 'duration' && Boolean(timing.ongoing),
      timezone: startTime || endTime ? timing.timezone : null,
      status: 'completed', source: draft.source ?? 'app', createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
    }
    const observations: Observation[] = []
    const selections: ObservationOptionSelection[] = []
    for (const field of details.fields) {
      const saved = draft.answers.find((item) => item.trackableId === field.trackable.id) ?? { trackableId: field.trackable.id, answer: { state: 'unanswered' as const } }
      const observation: Observation = { id: this.createId(), logRecordId: record.id, trackableId: field.trackable.id,
        trackableVersion: field.field.trackableVersion, answer: saved.answer, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
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

  async getRecentDefinitions(limit = 4): Promise<readonly EventDefinitionDetails[]> {
    const library = await this.getLibrary()
    const records = (await this.repository.getAll('logRecords')).filter((item) => item.recordKind === 'event' && !item.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const ids = [...new Set(records.map((item) => item.eventDefinitionId).filter((id): id is string => Boolean(id)))]
    return ids.slice(0, limit).flatMap((id) => library.active.find((item) => item.definition.id === id) ?? [])
  }

  async getEventsForDate(localDate: string): Promise<readonly { record: LogRecord; definition: EventDefinition }[]> {
    const library = await this.getLibrary(); const definitions = new Map(library.active.concat(library.archived).map((item) => [item.definition.id, item.definition]))
    return (await this.repository.getAll('logRecords')).filter((item) => item.recordKind === 'event' && item.localDate === localDate && !item.deletedAt)
      .flatMap((record) => { const definition = record.eventDefinitionId ? definitions.get(record.eventDefinitionId) : undefined; return definition ? [{ record, definition }] : [] })
      .sort((a, b) => (a.record.startTime ?? '').localeCompare(b.record.startTime ?? ''))
  }
}
