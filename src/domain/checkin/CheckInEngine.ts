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
  TrendTrackingMode,
} from '../models/index.ts'
import { buildRuleAnswers, evaluateConditionalRule } from './conditionalRules.ts'

export interface RoutineQuestion {
  item: RoutineItem
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
}

export interface SavedAnswer {
  answer: ObservationAnswer
  selectedOptionIds?: readonly string[]
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
    const [categories, trackables, versions, options] = await Promise.all([
      this.repository.getAll('categories'), this.repository.getAll('trackables'),
      this.repository.getAll('trackableVersions'), this.repository.getAll('trackableOptions'),
    ])
    return trackables.filter((trackable) => !trackable.deletedAt).flatMap((trackable): RoutineQuestion[] => {
      const version = versions.find((item) => item.trackableId === trackable.id && item.version === trackable.currentVersion)
      const category = categories.find((item) => item.id === trackable.categoryId)
      if (!version || !category) return []
      const placeholderItem = {} as RoutineItem
      return [{
        item: placeholderItem, trackable, version, category,
        options: options.filter((item) => item.trackableId === trackable.id && item.trackableVersion === version.version && item.active && !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder),
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
    const observations = (await this.repository.getAll('observations')).filter((item) => item.logRecordId === record.id && !item.deletedAt)
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
    const answers = buildRuleAnswers(observations, selections)
    const [versions, options] = await Promise.all([
      this.repository.getAll('trackableVersions'), this.repository.getAll('trackableOptions'),
    ])
    const historicallyAccurateQuestions = recordQuestions.map((question) => {
      const observation = observations.find((item) => item.trackableId === question.trackable.id)
      if (!observation || observation.trackableVersion === question.version.version) return question
      const version = versions.find((item) => item.trackableId === question.trackable.id && item.version === observation.trackableVersion)
      if (!version) return question
      return {
        ...question,
        version,
        options: options.filter((item) => item.trackableId === question.trackable.id && item.trackableVersion === version.version && !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder),
      }
    })
    const scheduled = historicallyAccurateQuestions.filter((question) => isScheduled(question.item, record.localDate))
    return { routine, record, questions: scheduled, visibleQuestions: scheduled.filter((question) => evaluateConditionalRule(question.item.conditionalRule, answers)), observations, selections }
  }

  async saveAnswer(recordId: string, trackableId: string, saved: SavedAnswer): Promise<CheckInSnapshot> {
    const record = await this.repository.getById('logRecords', recordId)
    if (!record || record.recordKind !== 'routine' || !record.routineId || record.deletedAt) throw new Error('Check-In was not found.')
    const trackable = await this.repository.getById('trackables', trackableId)
    if (!trackable) throw new Error('Trackable was not found.')
    const observations = await this.repository.getAll('observations')
    const existing = observations.find((item) => item.logRecordId === recordId && item.trackableId === trackableId && !item.deletedAt)
    const timestamp = this.timestamp()
    const observation: Observation = existing ? {
      ...existing, answer: saved.answer, trendValue: saved.trendValue, updatedAt: timestamp, revision: existing.revision + 1,
    } : {
      id: this.createId(), logRecordId: recordId, trackableId, trackableVersion: trackable.currentVersion,
      answer: saved.answer, trendValue: saved.trendValue, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1,
    }
    await this.repository.save('observations', observation)

    const currentSelections = (await this.repository.getAll('observationSelections')).filter((item) => item.observationId === observation.id && !item.deletedAt)
    const wanted = new Set(saved.answer.state === 'answered' && saved.answer.value.kind === 'choice' ? saved.selectedOptionIds ?? [] : [])
    await this.repository.saveMany('observationSelections', currentSelections.filter((item) => !wanted.has(item.optionId)).map((item) => ({ ...item, deletedAt: timestamp, updatedAt: timestamp, revision: item.revision + 1 })))
    const allSelections = await this.repository.getAll('observationSelections')
    for (const optionId of wanted) {
      const previous = allSelections.find((item) => item.observationId === observation.id && item.optionId === optionId)
      await this.repository.save('observationSelections', previous
        ? { ...previous, deletedAt: null, updatedAt: timestamp, revision: previous.revision + 1 }
        : { id: this.createId(), observationId: observation.id, optionId, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 })
    }
    const updatedRecord = { ...record, updatedAt: timestamp, revision: record.revision + 1 }
    await this.repository.save('logRecords', updatedRecord)
    const configuration = await this.getConfiguration()
    return this.snapshot(configuration.routine!, updatedRecord, configuration.questions)
  }

  async complete(recordId: string, confirmExpected = false): Promise<CompletionResult> {
    const record = await this.repository.getById('logRecords', recordId)
    if (!record || !record.routineId) throw new Error('Check-In was not found.')
    const routine = await this.repository.getById('routines', record.routineId)
    if (!routine) throw new Error('Routine was not found.')
    const configuration = await this.getConfiguration()
    let snapshot = await this.snapshot(routine, record, configuration.questions)
    const answers = buildRuleAnswers(snapshot.observations, snapshot.selections)
    const expectedUnanswered = snapshot.visibleQuestions.filter((question) => {
      const answer = answers.get(question.trackable.id)
      return question.item.completionBehavior === 'expected' && answer?.observation.answer.state !== 'answered'
    })
    if (expectedUnanswered.length && !confirmExpected) return { completed: false, expectedUnanswered, snapshot }
    if (record.status !== 'completed') {
      const timestamp = this.timestamp()
      const completedRecord: LogRecord = { ...record, status: 'completed', updatedAt: timestamp, revision: record.revision + 1 }
      await this.repository.save('logRecords', completedRecord)
      snapshot = await this.snapshot(routine, completedRecord, configuration.questions)
    }
    return { completed: true, expectedUnanswered, snapshot }
  }
}
