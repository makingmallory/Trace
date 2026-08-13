import type { DataRepository } from '../../data/repository/DataRepository.ts'
import type {
  Category,
  CompletionBehavior,
  ConditionalRule,
  IANATimeZone,
  LogRecord,
  Observation,
  ObservationAnswer,
  ObservationOptionSelection,
  Routine,
  RoutineItem,
  Trackable,
  TrackableOption,
  TrackableVersion,
  TrackableDailyAssertion,
  TrendTrackingMode,
  TrackableField,
} from '../models/index.ts'
import { buildEffectiveRuleAnswers, evaluateConditionalRule, type RuleAnswer } from './conditionalRules.ts'
import { isOccurrenceTrackable } from '../trackables/trackableSemantics.ts'
import { deduplicateObservationSelections } from '../../data/migrations/deduplicateObservationSelections.ts'

export interface RoutineQuestion {
  item: RoutineItem
  trackable: Trackable
  version: TrackableVersion
  options: readonly TrackableOption[]
  category: Category
  fields?: readonly RoutineQuestionField[]
}

export interface RoutineQuestionField {
  field: TrackableField
  trackable: Trackable
  version: TrackableVersion
  options: readonly TrackableOption[]
  category: Category
}

export interface RoutineConfiguration {
  routine: Routine | null
  questions: readonly RoutineQuestion[]
  availableTrackables: readonly RoutineQuestion[]
}

export interface CheckInSnapshot {
  routine: Routine
  record: LogRecord
  questions: readonly RoutineQuestion[]
  visibleQuestions: readonly RoutineQuestion[]
  observations: readonly Observation[]
  selections: readonly ObservationOptionSelection[]
  /** Presentation-only defaults. They are materialized only by successful completion. */
  defaultAnswers: Readonly<Record<string, SavedAnswer>>
  /** The values currently presented to the user, with persisted/derived answers taking precedence over defaults. */
  effectiveAnswers: ReadonlyMap<string, RuleAnswer>
  quickLogSummaries: Readonly<Record<string, number>>
  loggedToday: readonly { trackable: Trackable; version: TrackableVersion; count: number; timing: string | null; recordId: string }[]
}

export class OccurrenceConflictError extends Error {
  readonly trackableName: string
  readonly recordIds: readonly string[]
  constructor(trackableName: string, recordIds: readonly string[]) {
    super(`${trackableName} was already logged today.`)
    this.trackableName = trackableName
    this.recordIds = recordIds
  }
}

export interface SavedAnswer {
  answer: ObservationAnswer
  selectedOptionIds?: readonly string[]
  customChoiceValue?: string
  promoteCustomChoice?: boolean
  trendValue?: string
}

export interface CompletionResult {
  completed: boolean
  expectedUnanswered: readonly RoutineQuestion[]
  snapshot: CheckInSnapshot
}

export interface RoutineItemChanges {
  completionBehavior?: CompletionBehavior
  trendTrackingMode?: TrendTrackingMode
  conditionalRule?: ConditionalRule | null
}

export function localDateFor(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function currentTimeZone(): IANATimeZone | null {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || null
}

function weekdayFor(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

function isScheduled(item: RoutineItem, localDate: string): boolean {
  return item.frequency === 'every_day' || (item.weekdays ?? []).includes(weekdayFor(localDate))
}

export class CheckInEngine {
  private readonly repository: DataRepository
  private readonly now: () => Date
  private readonly createId: () => string
  private readonly dailyLoads = new Map<string, Promise<CheckInSnapshot>>()

  constructor(
    repository: DataRepository,
    now: () => Date = () => new Date(),
    createId: () => string = () => crypto.randomUUID(),
  ) {
    this.repository = repository
    this.now = now
    this.createId = createId
  }

  private timestamp(): string { return this.now().toISOString() }

  async getNightlyRoutine(): Promise<Routine | null> {
    return (await this.repository.getAll('routines')).find((routine) => routine.active && !routine.deletedAt) ?? null
  }

  async createNightlyRoutine(): Promise<Routine> {
    const existing = await this.getNightlyRoutine()
    if (existing) return existing
    const timestamp = this.timestamp()
    const routine: Routine = {
      id: this.createId(), name: 'Nightly Check-In', active: true, scheduleType: 'daily',
      createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
    }
    await this.repository.save('routines', routine)
    return routine
  }

  async getConfiguration(): Promise<RoutineConfiguration> {
    const routine = await this.getNightlyRoutine()
    const allQuestions = await this.loadQuestionDefinitions()
    if (!routine) return { routine: null, questions: [], availableTrackables: allQuestions.filter((question) => question.trackable.active) }
    const items = (await this.repository.getAll('routineItems'))
      .filter((item) => item.routineId === routine.id && item.target.kind === 'trackable' && item.enabled && !item.deletedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const questions = items.map((item) => {
      const targetId = item.target.kind === 'trackable' ? item.target.trackableId : ''
      const definition = allQuestions.find((candidate) => candidate.trackable.id === targetId)
      if (!definition) return null
      return { ...definition, item }
    }).filter((question): question is RoutineQuestion => Boolean(question))
    const included = new Set(questions.map((question) => question.trackable.id))
    return { routine, questions, availableTrackables: allQuestions.filter((question) => question.trackable.active && !included.has(question.trackable.id)) }
  }

  private async loadQuestionDefinitions(): Promise<readonly RoutineQuestion[]> {
    const [categories, trackables, versions, options, fields] = await Promise.all([
      this.repository.getAll('categories'), this.repository.getAll('trackables'),
      this.repository.getAll('trackableVersions'), this.repository.getAll('trackableOptions'), this.repository.getAll('trackableFields'),
    ])
    return trackables.filter((trackable) => !trackable.deletedAt).flatMap((trackable): RoutineQuestion[] => {
      const version = versions.find((item) => item.trackableId === trackable.id && item.version === trackable.currentVersion)
      const category = categories.find((item) => item.id === trackable.categoryId)
      if (!version || !category) return []
      const placeholderItem = {} as RoutineItem
      const linkedFields = fields.filter((field) => field.ownerTrackableId === trackable.id && field.enabled && !field.deletedAt && (field.ownerTrackableVersion === undefined || field.ownerTrackableVersion === version.version)).sort((a, b) => a.sortOrder - b.sortOrder).flatMap((field): RoutineQuestionField[] => {
        const fieldTrackable = trackables.find((item) => item.id === field.fieldTrackableId)
        const fieldVersion = versions.find((item) => item.trackableId === field.fieldTrackableId && item.version === field.fieldTrackableVersion)
        const fieldCategory = fieldTrackable ? categories.find((item) => item.id === fieldTrackable.categoryId) : undefined
        return fieldTrackable && fieldVersion && fieldCategory ? [{ field, trackable: fieldTrackable, version: fieldVersion, category: fieldCategory, options: options.filter((item) => item.trackableId === fieldTrackable.id && item.trackableVersion === fieldVersion.version && item.active && !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder) }] : []
      })
      return [{
        item: placeholderItem, trackable, version, category,
        options: options.filter((item) => item.trackableId === trackable.id && item.trackableVersion === version.version && item.active && !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder),
        fields: linkedFields,
      }]
    })
  }

  async addTrackable(trackableId: string): Promise<RoutineItem> {
    const routine = await this.createNightlyRoutine()
    const trackable = await this.repository.getById('trackables', trackableId)
    if (!trackable || !trackable.active || trackable.deletedAt) throw new Error('Choose an active Trackable.')
    const allItems = await this.repository.getAll('routineItems')
    const existing = allItems.find((item) => item.routineId === routine.id && item.target.kind === 'trackable' && item.target.trackableId === trackableId)
    const timestamp = this.timestamp()
    const activeCount = allItems.filter((item) => item.routineId === routine.id && item.enabled && !item.deletedAt).length
    const item: RoutineItem = existing ? {
      ...existing, enabled: true, deletedAt: null, sortOrder: activeCount, updatedAt: timestamp, revision: existing.revision + 1,
    } : {
      id: this.createId(), routineId: routine.id, target: { kind: 'trackable', trackableId }, sortOrder: activeCount,
      enabled: true, frequency: 'every_day', completionBehavior: 'optional', trendTrackingMode: 'none', eventReminderBehavior: 'never',
      createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
    }
    await this.repository.save('routineItems', item)
    return item
  }

  async removeTrackable(itemId: string): Promise<void> {
    const item = await this.requireItem(itemId)
    const timestamp = this.timestamp()
    await this.repository.save('routineItems', { ...item, enabled: false, deletedAt: timestamp, updatedAt: timestamp, revision: item.revision + 1 })
    await this.normalizeOrder(item.routineId)
  }

  async updateItem(itemId: string, changes: RoutineItemChanges): Promise<void> {
    const item = await this.requireItem(itemId)
    const timestamp = this.timestamp()
    await this.repository.save('routineItems', {
      ...item,
      ...(changes.completionBehavior ? { completionBehavior: changes.completionBehavior } : {}),
      ...(changes.trendTrackingMode ? { trendTrackingMode: changes.trendTrackingMode } : {}),
      ...(changes.conditionalRule === null ? { conditionalRule: undefined } : changes.conditionalRule ? { conditionalRule: changes.conditionalRule } : {}),
      updatedAt: timestamp, revision: item.revision + 1,
    })
  }

  async moveItem(itemId: string, direction: -1 | 1): Promise<void> {
    const item = await this.requireItem(itemId)
    const items = (await this.repository.getAll('routineItems')).filter((candidate) => candidate.routineId === item.routineId && candidate.enabled && !candidate.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)
    const index = items.findIndex((candidate) => candidate.id === itemId)
    const swapIndex = index + direction
    if (index < 0 || swapIndex < 0 || swapIndex >= items.length) return
    const timestamp = this.timestamp()
    await this.repository.saveMany('routineItems', [
      { ...items[index], sortOrder: items[swapIndex].sortOrder, updatedAt: timestamp, revision: items[index].revision + 1 },
      { ...items[swapIndex], sortOrder: items[index].sortOrder, updatedAt: timestamp, revision: items[swapIndex].revision + 1 },
    ])
  }

  private async normalizeOrder(routineId: string): Promise<void> {
    const items = (await this.repository.getAll('routineItems')).filter((item) => item.routineId === routineId && item.enabled && !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)
    const timestamp = this.timestamp()
    await this.repository.saveMany('routineItems', items.map((item, sortOrder) => ({ ...item, sortOrder, updatedAt: timestamp, revision: item.revision + 1 })))
  }

  private async requireItem(id: string): Promise<RoutineItem> {
    const item = await this.repository.getById('routineItems', id)
    if (!item || item.deletedAt) throw new Error('Routine item was not found.')
    return item
  }

  getOrCreateToday(localDate = localDateFor(this.now()), timezone = currentTimeZone()): Promise<CheckInSnapshot> {
    const existing = this.dailyLoads.get(localDate)
    if (existing) return existing
    const pending = this.openDailyCheckIn(localDate, timezone)
    this.dailyLoads.set(localDate, pending)
    const clear = () => { if (this.dailyLoads.get(localDate) === pending) this.dailyLoads.delete(localDate) }
    void pending.then(clear, clear)
    return pending
  }

  private async openDailyCheckIn(localDate: string, timezone: IANATimeZone | null): Promise<CheckInSnapshot> {
    await deduplicateObservationSelections(this.repository, this.timestamp())
    const configuration = await this.getConfiguration()
    if (!configuration.routine) throw new Error('Set up your Nightly Check-In first.')
    const records = await this.repository.getAll('logRecords')
    let record = records.find((item) => item.recordKind === 'routine' && item.routineId === configuration.routine!.id && item.localDate === localDate && !item.deletedAt)
    if (!record) {
      if (configuration.questions.length === 0) throw new Error('Set up your Nightly Check-In first.')
      const timestamp = this.timestamp()
      record = {
        id: this.createId(), recordKind: 'routine', routineId: configuration.routine.id, localDate,
        startTimePrecision: 'day', startTime: null, startTimeOfDay: null,
        endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false,
        timezone, status: 'draft', source: 'app',
        createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
      }
      await this.repository.save('logRecords', record)
    }
    return this.snapshot(configuration.routine, record, configuration.questions)
  }

  async getTodayState(localDate = localDateFor(this.now())): Promise<'not_started' | 'draft' | 'completed'> {
    const routine = await this.getNightlyRoutine()
    if (!routine) return 'not_started'
    const record = (await this.repository.getAll('logRecords')).find((item) => item.recordKind === 'routine' && item.routineId === routine.id && item.localDate === localDate && !item.deletedAt)
    return record?.status ?? 'not_started'
  }

  private async snapshot(routine: Routine, record: LogRecord, questions: readonly RoutineQuestion[]): Promise<CheckInSnapshot> {
    const storedObservations = (await this.repository.getAll('observations')).filter((item) => item.logRecordId === record.id && !item.deletedAt)
    const [allRecords, assertions] = await Promise.all([this.repository.getAll('logRecords'), this.repository.getAll('trackableDailyAssertions')])
    const quickRecords = allRecords.filter((item) => item.recordKind === 'quick_log' && item.localDate === record.localDate && !item.deletedAt && item.trackableId)
    const quickQuestions = questions.filter((question) => isOccurrenceTrackable(question.trackable))
    const synthesized = quickQuestions.flatMap((question): Observation[] => {
      const occurrences = quickRecords.filter((item) => item.trackableId === question.trackable.id)
      const assertion = assertions.find((item) => item.trackableId === question.trackable.id && item.date === record.localDate && !item.deletedAt)
      const value = occurrences.length > 0 || assertion?.status === 'occurred'
      if (!occurrences.length && assertion?.status === 'unknown') return []
      return [{ id: `occurrence-state:${record.id}:${question.trackable.id}`, logRecordId: record.id, trackableId: question.trackable.id,
        trackableVersion: question.trackable.currentVersion, answer: { state: 'answered', value: { kind: 'boolean', value } },
        createdAt: assertion?.createdAt ?? occurrences[0]?.createdAt ?? record.createdAt, updatedAt: assertion?.updatedAt ?? occurrences[0]?.updatedAt ?? record.updatedAt,
        deletedAt: null, revision: 1 }]
    })
    const quickIds = new Set(quickQuestions.map((item) => item.trackable.id))
    const observations = [...storedObservations.filter((item) => !quickIds.has(item.trackableId)), ...synthesized]
    const configuredIds = new Set(questions.map((question) => question.trackable.id))
    const recordedIds = new Set(observations.map((observation) => observation.trackableId))
    const [allDefinitions, routineItems] = await Promise.all([this.loadQuestionDefinitions(), this.repository.getAll('routineItems')])
    const historicalQuestions = allDefinitions.filter((question) => recordedIds.has(question.trackable.id) && !configuredIds.has(question.trackable.id)).flatMap((question): RoutineQuestion[] => {
      const item = routineItems.find((candidate) => candidate.routineId === routine.id && candidate.target.kind === 'trackable' && candidate.target.trackableId === question.trackable.id)
      return item ? [{ ...question, item }] : []
    })
    const recordQuestions = [...questions, ...historicalQuestions]
    const observationIds = new Set(observations.map((item) => item.id))
    const selections = (await this.repository.getAll('observationSelections')).filter((item) => observationIds.has(item.observationId) && !item.deletedAt)
    const [versions, options, fieldRows, allTrackables, categories] = await Promise.all([
      this.repository.getAll('trackableVersions'), this.repository.getAll('trackableOptions'), this.repository.getAll('trackableFields'), this.repository.getAll('trackables'), this.repository.getAll('categories'),
    ])
    const fieldsFor = (ownerTrackableId: string, ownerTrackableVersion: number): readonly RoutineQuestionField[] => fieldRows
      .filter((field) => field.ownerTrackableId === ownerTrackableId && field.enabled && !field.deletedAt && (field.ownerTrackableVersion === undefined || field.ownerTrackableVersion === ownerTrackableVersion))
      .sort((a, b) => a.sortOrder - b.sortOrder).flatMap((field): RoutineQuestionField[] => {
        const fieldTrackable = allTrackables.find((item) => item.id === field.fieldTrackableId)
        const fieldVersion = versions.find((item) => item.trackableId === field.fieldTrackableId && item.version === field.fieldTrackableVersion)
        const category = fieldTrackable ? categories.find((item) => item.id === fieldTrackable.categoryId) : undefined
        return fieldTrackable && fieldVersion && category ? [{ field, trackable: fieldTrackable, version: fieldVersion, category,
          options: options.filter((item) => item.trackableId === fieldTrackable.id && item.trackableVersion === fieldVersion.version && item.active && !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder) }] : []
      })
    const useLatestDefinition = record.localDate === localDateFor(this.now())
    const historicallyAccurateQuestions = recordQuestions.map((question) => {
      const observation = observations.find((item) => item.trackableId === question.trackable.id)
      if (useLatestDefinition) {
        const selectedIds = new Set(selections.filter((item) => item.observationId === observation?.id).map((item) => item.optionId))
        const offered = new Set(question.options.map((item) => item.optionId))
        const removedSelections = options.filter((item) => selectedIds.has(item.optionId) && !offered.has(item.optionId))
          .filter((item, index, all) => all.findIndex((candidate) => candidate.optionId === item.optionId) === index)
          .map((item) => ({ ...item, label: `${item.label} (Previously selected)`, active: false }))
        return { ...question, options: [...question.options, ...removedSelections], fields: fieldsFor(question.trackable.id, question.trackable.currentVersion) }
      }
      if (!observation || observation.trackableVersion === question.version.version) return question
      const version = versions.find((item) => item.trackableId === question.trackable.id && item.version === observation.trackableVersion)
      if (!version) return question
      return {
        ...question,
        version,
        fields: fieldsFor(question.trackable.id, version.version),
        options: options.filter((item) => item.trackableId === question.trackable.id && item.trackableVersion === version.version && !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder),
      }
    })
    const scheduled = historicallyAccurateQuestions.filter((question) => isScheduled(question.item, record.localDate))
    const routineIds = new Set(questions.map((question) => question.trackable.id))
    const grouped = new Map<string, LogRecord[]>()
    for (const item of quickRecords) grouped.set(item.trackableId!, [...(grouped.get(item.trackableId!) ?? []), item])
    const loggedToday = [...grouped].flatMap(([trackableId, entries]) => {
      if (routineIds.has(trackableId)) return []
      const question = allDefinitions.find((item) => item.trackable.id === trackableId)
      if (!question) return []
      const first = entries[0]
      const timing = entries.length === 1 && first.startTimePrecision === 'timeOfDay' ? first.startTimeOfDay?.replaceAll('_', ' ') ?? null : null
      return [{ trackable: question.trackable, version: question.version, count: entries.length, timing, recordId: first.id }]
    })
    const defaultAnswers = Object.fromEntries(scheduled.flatMap((question) => {
      if (isOccurrenceTrackable(question.trackable) || observations.some((item) => item.trackableId === question.trackable.id)) return []
      const configured = question.version.configuration.defaultAnswer as unknown as SavedAnswer | undefined
      if (!configured || configured.answer?.state !== 'answered') return []
      const selected = [...new Set(configured.selectedOptionIds ?? [])]
      if (configured.answer.value.kind === 'choice' && (selected.length === 0 || selected.some((id) => !question.options.some((option) => option.optionId === id)))) return []
      if (configured.answer.value.kind === 'scale' && (configured.answer.value.value < (question.version.scaleMin ?? configured.answer.value.value) || configured.answer.value.value > (question.version.scaleMax ?? configured.answer.value.value))) return []
      return [[question.trackable.id, { ...configured, selectedOptionIds: selected }]]
    }))
    const effectiveAnswers = buildEffectiveRuleAnswers(observations, selections, defaultAnswers)
    return { routine, record, questions: scheduled, visibleQuestions: scheduled.filter((question) => evaluateConditionalRule(question.item.conditionalRule, effectiveAnswers)), observations, selections, defaultAnswers, effectiveAnswers,
      quickLogSummaries: Object.fromEntries([...grouped].map(([id, entries]) => [id, entries.length])), loggedToday }
  }

  async saveAnswer(recordId: string, trackableId: string, saved: SavedAnswer): Promise<CheckInSnapshot> {
    const record = await this.repository.getById('logRecords', recordId)
    if (!record || record.recordKind !== 'routine' || !record.routineId || record.deletedAt) throw new Error('Check-In was not found.')
    const trackable = await this.repository.getById('trackables', trackableId)
    if (!trackable) throw new Error('Trackable was not found.')
    let configuration = await this.getConfiguration()
    const isParentRoutineQuestion = configuration.questions.some((question) => question.trackable.id === trackableId)
    if (isParentRoutineQuestion && isOccurrenceTrackable(trackable)) return this.saveOccurrenceAnswer(record, trackable, saved, false)
    if (saved.promoteCustomChoice && saved.customChoiceValue?.trim()) {
      saved = await this.promoteCustomChoice(trackable, saved)
      configuration = await this.getConfiguration()
    }
    const refreshedTrackable = await this.repository.getById('trackables', trackableId) ?? trackable
    const observations = await this.repository.getAll('observations')
    const existing = observations.find((item) => item.logRecordId === recordId && item.trackableId === trackableId && !item.deletedAt)
    const timestamp = this.timestamp()
    const customChoiceValue = saved.customChoiceValue?.trim() || undefined
    if (saved.answer.state === 'answered' && saved.answer.value.kind === 'choice' && saved.customChoiceValue !== undefined && !customChoiceValue) throw new Error('Enter a value for Other.')
    const observation: Observation = existing ? {
      ...existing, trackableVersion: record.localDate === localDateFor(this.now()) ? refreshedTrackable.currentVersion : existing.trackableVersion,
      answer: saved.answer, customChoiceValue, trendValue: saved.trendValue, updatedAt: timestamp, revision: existing.revision + 1,
    } : {
      id: this.createId(), logRecordId: recordId, trackableId, trackableVersion: refreshedTrackable.currentVersion,
      answer: saved.answer, customChoiceValue, trendValue: saved.trendValue, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
    }
    await this.repository.save('observations', observation)

    const currentSelections = (await this.repository.getAll('observationSelections')).filter((item) => item.observationId === observation.id && !item.deletedAt)
    const wanted = new Set(saved.answer.state === 'answered' && saved.answer.value.kind === 'choice' ? saved.selectedOptionIds ?? [] : [])
    const canonical = new Map<string, ObservationOptionSelection>()
    for (const selection of currentSelections) if (!canonical.has(selection.optionId)) canonical.set(selection.optionId, selection)
    await this.repository.saveMany('observationSelections', currentSelections.filter((item) => !wanted.has(item.optionId) || canonical.get(item.optionId)?.id !== item.id).map((item) => ({ ...item, deletedAt: timestamp, updatedAt: timestamp, revision: item.revision + 1 })))
    const allSelections = await this.repository.getAll('observationSelections')
    for (const optionId of wanted) {
      const previous = allSelections.find((item) => item.observationId === observation.id && item.optionId === optionId && !item.deletedAt)
        ?? allSelections.find((item) => item.observationId === observation.id && item.optionId === optionId)
      await this.repository.save('observationSelections', previous
        ? { ...previous, deletedAt: null, updatedAt: timestamp, revision: previous.revision + 1 }
        : { id: this.createId(), observationId: observation.id, optionId, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 })
    }
    const updatedRecord = { ...record, updatedAt: timestamp, revision: record.revision + 1 }
    await this.repository.save('logRecords', updatedRecord)
    return this.snapshot(configuration.routine!, updatedRecord, configuration.questions)
  }

  private async promoteCustomChoice(trackable: Trackable, saved: SavedAnswer): Promise<SavedAnswer> {
    const label = saved.customChoiceValue!.trim()
    const normalized = label.replace(/\s+/g, ' ').toLocaleLowerCase()
    const [versions, allOptions] = await Promise.all([this.repository.getAll('trackableVersions'), this.repository.getAll('trackableOptions')])
    const currentVersion = versions.find((item) => item.trackableId === trackable.id && item.version === trackable.currentVersion)
    if (!currentVersion) throw new Error('Trackable version was not found.')
    const currentOptions = allOptions.filter((item) => item.trackableId === trackable.id && item.trackableVersion === trackable.currentVersion && item.active && !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)
    const match = currentOptions.find((item) => item.label.trim().replace(/\s+/g, ' ').toLocaleLowerCase() === normalized)
    if (match) return { ...saved, selectedOptionIds: [...new Set([...(saved.selectedOptionIds ?? []), match.optionId])], customChoiceValue: undefined, promoteCustomChoice: false }
    const timestamp = this.timestamp()
    const nextNumber = trackable.currentVersion + 1
    const optionId = this.createId()
    const copiedOptions = currentOptions.map((item) => ({ ...item, id: `${item.optionId}:v${nextNumber}`, trackableVersion: nextNumber, createdAt: timestamp, updatedAt: timestamp, revision: 1 }))
    const promoted: TrackableOption = { id: `${optionId}:v${nextNumber}`, optionId, trackableId: trackable.id, trackableVersion: nextNumber,
      storedValue: normalized.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), label, sortOrder: copiedOptions.length, active: true,
      createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
    const nextVersion: TrackableVersion = { ...currentVersion, id: this.createId(), version: nextNumber, retiredAt: null, createdAt: timestamp, updatedAt: timestamp, revision: 1 }
    await this.repository.saveTransaction([
      { collection: 'trackables', entities: [{ ...trackable, currentVersion: nextNumber, updatedAt: timestamp, revision: trackable.revision + 1 }] },
      { collection: 'trackableVersions', entities: [{ ...currentVersion, retiredAt: timestamp, updatedAt: timestamp, revision: currentVersion.revision + 1 }, nextVersion] },
      { collection: 'trackableOptions', entities: [...copiedOptions, promoted] },
    ])
    return { ...saved, selectedOptionIds: [...new Set([...(saved.selectedOptionIds ?? []), optionId])], customChoiceValue: undefined, promoteCustomChoice: false }
  }

  async saveOccurrenceAnswer(record: LogRecord, trackable: Trackable, saved: SavedAnswer, removeExisting: boolean): Promise<CheckInSnapshot> {
    if (saved.answer.state !== 'answered' || saved.answer.value.kind !== 'boolean') throw new Error('Occurrence routine questions use Yes or No.')
    const timestamp = this.timestamp()
    const records = (await this.repository.getAll('logRecords')).filter((item) => item.recordKind === 'quick_log' && item.trackableId === trackable.id && item.localDate === record.localDate && !item.deletedAt)
    const assertions = await this.repository.getAll('trackableDailyAssertions')
    const existingAssertion = assertions.find((item) => item.trackableId === trackable.id && item.date === record.localDate)
    const writes: import('../../data/repository/DataRepository.ts').RepositoryWrite[] = []
    if (saved.answer.value.value) {
      if (records.length === 0) writes.push({ collection: 'logRecords', entities: [{
        id: this.createId(), recordKind: 'quick_log', trackableId: trackable.id, trackableVersion: trackable.currentVersion, eventTimingKind: 'point', localDate: record.localDate,
        startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null,
        endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'nightly_backfill',
        createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
      }] })
      if (existingAssertion && !existingAssertion.deletedAt) writes.push({ collection: 'trackableDailyAssertions', entities: [{ ...existingAssertion, deletedAt: timestamp, updatedAt: timestamp, revision: existingAssertion.revision + 1 }] })
    } else {
      if (records.length && !removeExisting) {
        const version = (await this.repository.getAll('trackableVersions')).find((item) => item.trackableId === trackable.id && item.version === trackable.currentVersion)
        throw new OccurrenceConflictError(version?.name ?? 'This item', records.map((item) => item.id))
      }
      if (records.length) writes.push({ collection: 'logRecords', entities: records.map((item) => ({ ...item, deletedAt: timestamp, updatedAt: timestamp, revision: item.revision + 1 })) })
      const shouldPersistNo = record.status === 'completed' || records.length > 0 || Boolean(existingAssertion && !existingAssertion.deletedAt)
      if (shouldPersistNo) {
        const assertion: TrackableDailyAssertion = existingAssertion ? { ...existingAssertion, status: 'did_not_occur', deletedAt: null, recordedAt: timestamp, updatedAt: timestamp, revision: existingAssertion.revision + 1 } : {
          id: this.createId(), date: record.localDate, trackableId: trackable.id, status: 'did_not_occur', sourceRoutineId: record.routineId,
          recordedAt: timestamp, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
        }
        writes.push({ collection: 'trackableDailyAssertions', entities: [assertion] })
      }
    }
    writes.push({ collection: 'logRecords', entities: [{ ...record, updatedAt: timestamp, revision: record.revision + 1 }] })
    await this.repository.saveTransaction(writes)
    const configuration = await this.getConfiguration()
    return this.snapshot(configuration.routine!, { ...record, updatedAt: timestamp, revision: record.revision + 1 }, configuration.questions)
  }

  async resolveQuickLogNo(recordId: string, trackableId: string): Promise<CheckInSnapshot> {
    const record = await this.repository.getById('logRecords', recordId)
    const trackable = await this.repository.getById('trackables', trackableId)
    if (!record || !trackable) throw new Error('Check-In question was not found.')
    return this.saveOccurrenceAnswer(record, trackable, { answer: { state: 'answered', value: { kind: 'boolean', value: false } } }, true)
  }

  async complete(recordId: string, confirmExpected = false): Promise<CompletionResult> {
    const record = await this.repository.getById('logRecords', recordId)
    if (!record || !record.routineId) throw new Error('Check-In was not found.')
    const routine = await this.repository.getById('routines', record.routineId)
    if (!routine) throw new Error('Routine was not found.')
    const configuration = await this.getConfiguration()
    let snapshot = await this.snapshot(routine, record, configuration.questions)
    const answers = snapshot.effectiveAnswers
    const expectedUnanswered = snapshot.visibleQuestions.filter((question) => {
      const answer = answers.get(question.trackable.id)
      return question.item.completionBehavior === 'expected' && answer?.answer.state !== 'answered'
    })
    const requiredFields = snapshot.visibleQuestions.flatMap((question) => {
      const parent = answers.get(question.trackable.id)
      if (parent?.answer.state !== 'answered') return []
      return (question.fields ?? []).filter(({ field }) => field.required && evaluateConditionalRule(field.conditionalRule, answers))
        .filter(({ trackable }) => answers.get(trackable.id)?.answer.state !== 'answered')
    })
    if (requiredFields.length) throw new Error(`Answer required field${requiredFields.length === 1 ? '' : 's'}: ${requiredFields.map((field) => field.version.name).join(', ')}.`)
    if (expectedUnanswered.length && !confirmExpected) return { completed: false, expectedUnanswered, snapshot }
    if (record.status !== 'completed') {
      const timestamp = this.timestamp()
      const completedRecord: LogRecord = { ...record, status: 'completed', updatedAt: timestamp, revision: record.revision + 1 }
      const [records, assertions] = await Promise.all([
        this.repository.getAll('logRecords'), this.repository.getAll('trackableDailyAssertions'),
      ])
      const defaultNoAssertions = snapshot.visibleQuestions.filter((question) => {
        if (!isOccurrenceTrackable(question.trackable)) return false
        const observation = snapshot.observations.find((item) => item.trackableId === question.trackable.id)
        const defaultsNo = observation?.answer.state === 'answered'
          && observation.answer.value.kind === 'boolean'
          && observation.answer.value.value === false
        const hasOccurrence = records.some((item) => item.recordKind === 'quick_log' && item.trackableId === question.trackable.id && item.localDate === record.localDate && !item.deletedAt)
        const hasAssertion = assertions.some((item) => item.trackableId === question.trackable.id && item.date === record.localDate && !item.deletedAt)
        return defaultsNo && !hasOccurrence && !hasAssertion
      }).map((question): TrackableDailyAssertion => ({
        id: this.createId(), date: record.localDate, trackableId: question.trackable.id, status: 'did_not_occur', sourceRoutineId: record.routineId,
        recordedAt: timestamp, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
      }))
      const defaultObservations: Observation[] = []
      const defaultSelections: ObservationOptionSelection[] = []
      for (const [trackableId, saved] of Object.entries(snapshot.defaultAnswers)) {
        const question = snapshot.visibleQuestions.find((item) => item.trackable.id === trackableId)
        if (!question) continue
        const observation: Observation = { id: this.createId(), logRecordId: record.id, trackableId, trackableVersion: question.version.version,
          answer: saved.answer, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
        defaultObservations.push(observation)
        for (const optionId of new Set(saved.selectedOptionIds ?? [])) defaultSelections.push({ id: this.createId(), observationId: observation.id, optionId, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 })
      }
      await this.repository.saveTransaction([
        { collection: 'trackableDailyAssertions', entities: defaultNoAssertions },
        { collection: 'observations', entities: defaultObservations },
        { collection: 'observationSelections', entities: defaultSelections },
        { collection: 'logRecords', entities: [completedRecord] },
      ])
      snapshot = await this.snapshot(routine, completedRecord, configuration.questions)
    }
    return { completed: true, expectedUnanswered, snapshot }
  }
}
