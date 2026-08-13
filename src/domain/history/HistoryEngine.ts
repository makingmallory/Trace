import type { DataRepository } from '../../data/repository/DataRepository.ts'
import { buildRuleAnswers, evaluateConditionalRule } from '../checkin/conditionalRules.ts'
import { formatEventTiming, timeOfDayDefinitions } from '../events/eventTiming.ts'
import type {
  Category, EventDefinition, IconReference, LogRecord, Observation, ObservationOptionSelection, Routine, RoutineItem, Settings,
  Trackable, TrackableOption, TrackableVersion,
} from '../models/index.ts'
import { isOccurrenceTrackable } from '../trackables/trackableSemantics.ts'

export interface HistoryData {
  categories: readonly Category[]
  eventDefinitions: readonly EventDefinition[]
  logRecords: readonly LogRecord[]
  observations: readonly Observation[]
  observationSelections: readonly ObservationOptionSelection[]
  routines: readonly Routine[]
  routineItems: readonly RoutineItem[]
  settings: readonly Settings[]
  trackables: readonly Trackable[]
  trackableOptions: readonly TrackableOption[]
  trackableVersions: readonly TrackableVersion[]
}

export interface CalendarDaySummary {
  localDate: string
  checkInStatus: 'draft' | 'completed' | null
  eventCount: number
  eventIcons: readonly IconReference[]
}

export interface HistoryAnswer {
  observationId: string
  name: string
  value: string
  state: Observation['answer']['state']
  trendValue?: string
}

export interface HistoryAnswerGroup {
  category: string
  answers: readonly HistoryAnswer[]
}

export interface HistoryEventDetail {
  record: LogRecord
  definition: EventDefinition
  timing: string
  fields: readonly HistoryAnswer[]
}

export interface HistoryDayDetail {
  localDate: string
  checkIn: { record: LogRecord; groups: readonly HistoryAnswerGroup[] } | null
  events: readonly HistoryEventDetail[]
}

export interface HistorySearchResult {
  recordId: string
  localDate: string
  kind: 'event' | 'check-in'
  identity: string
  context: string
  timing: string
  daysAgo: number
}

export interface HistorySearchResponse {
  isLastOccurrence: boolean
  normalizedQuery: string
  totalMatches: number
  results: readonly HistorySearchResult[]
}

export interface HistorySearchSuggestion {
  label: string
}

export interface HistoryResultGroups {
  recent: readonly HistorySearchResult[]
  earlier: readonly HistorySearchResult[]
}

export interface HistorySearchFilters {
  from?: string
  to?: string
  recordType?: 'all' | 'event' | 'check-in'
}

export interface MetricChoice {
  trackableId: string
  name: string
  inputType: 'boolean' | 'scale' | 'number' | 'single_choice'
}

export interface MetricDayValue {
  localDate: string
  display: string
  level: number
}

export interface EventMetricChoice {
  eventDefinitionId: string
  name: string
}

export type CalendarMetricIdentity = `trackable:${string}` | `event:${string}`

export interface CalendarMetricOption {
  identity: CalendarMetricIdentity
  name: string
  kind: 'Daily Value' | 'Occurrence'
}

export type HistoryAgendaRecord =
  | { kind: 'check-in'; recordId: string; status: 'draft' | 'completed'; answeredCount: number; applicableCount: number; summary: string }
  | { kind: 'event'; recordId: string; name: string; timing: string; icon?: IconReference }

export interface HistoryAgendaDay {
  localDate: string
  records: readonly HistoryAgendaRecord[]
}

const missingLabels: Readonly<Record<Exclude<Observation['answer']['state'], 'answered'>, string>> = {
  skipped: 'Skipped', unanswered: 'Unanswered', not_presented: 'Not presented', unavailable: 'Unavailable', unknown: 'Unknown',
}

function localDateNumber(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function dateFromNumber(value: number): string {
  const date = new Date(value)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function currentLocalDate(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function daysBetween(localDate: string, today: string): number {
  return Math.max(0, Math.round((localDateNumber(today) - localDateNumber(localDate)) / 86_400_000))
}

export function monthKey(localDate: string): string { return localDate.slice(0, 7) }

export function shiftMonth(value: string, amount: number): string {
  const [year, month] = value.split('-').map(Number)
  const shifted = new Date(year, month - 1 + amount, 1)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`
}

export function calendarDates(month: string, firstDayOfWeek = 0): readonly string[] {
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(year, monthNumber - 1, 1)
  const leading = (first.getDay() - firstDayOfWeek + 7) % 7
  const start = new Date(year, monthNumber - 1, 1 - leading)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })
}

export function weekDates(selectedDate: string, firstDayOfWeek = 0): readonly string[] {
  const [year, month, day] = selectedDate.split('-').map(Number)
  const selected = new Date(year, month - 1, day)
  const leading = (selected.getDay() - firstDayOfWeek + 7) % 7
  const start = localDateNumber(selectedDate) - leading * 86_400_000
  return Array.from({ length: 7 }, (_, index) => dateFromNumber(start + index * 86_400_000))
}

export function shiftLocalDate(localDate: string, days: number): string {
  return dateFromNumber(localDateNumber(localDate) + days * 86_400_000)
}

export function eventCoveredDates(record: LogRecord, today = currentLocalDate()): readonly string[] {
  if (!isQuickLogRecord(record) || record.eventTimingKind !== 'duration') return [record.localDate]
  const end = record.ongoing ? today : record.endLocalDate ?? record.localDate
  if (end < record.localDate) return [record.localDate]
  const startValue = localDateNumber(record.localDate); const endValue = localDateNumber(end)
  return Array.from({ length: Math.floor((endValue - startValue) / 86_400_000) + 1 }, (_, index) => dateFromNumber(startValue + index * 86_400_000))
}

function isQuickLogRecord(record: LogRecord): boolean { return record.recordKind === 'quick_log' || record.recordKind === 'event' }

function quickLogDefinitions(data: HistoryData): Map<string, EventDefinition> {
  const definitions = new Map(data.eventDefinitions.map((item) => [item.id, item]))
  for (const trackable of data.trackables.filter(isOccurrenceTrackable)) {
    const version = data.trackableVersions.find((item) => item.trackableId === trackable.id && item.version === trackable.currentVersion)
    if (version) definitions.set(trackable.id, { ...trackable, name: version.name, description: version.description,
      timingMode: trackable.quickLogTimingMode ?? 'either', nightlyReminderDefault: 'never', treatmentFollowUpEnabled: false })
  }
  return definitions
}

function definitionForRecord(data: HistoryData, record: LogRecord, definitions = quickLogDefinitions(data)): EventDefinition | undefined {
  const definition = definitions.get(record.trackableId ?? record.eventDefinitionId ?? '')
  if (!definition || !record.trackableId || !record.trackableVersion) return definition
  const version = data.trackableVersions.find((item) => item.trackableId === record.trackableId && item.version === record.trackableVersion)
  return version ? { ...definition, name: version.name, description: version.description } : definition
}

function eventSortValue(record: LogRecord): number {
  if (record.startTimePrecision === 'exact' && record.startTime) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: record.timezone || undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(record.startTime))
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0)
    return value('hour') * 60 + value('minute')
  }
  if (record.startTimePrecision === 'timeOfDay' && record.startTimeOfDay) {
    const starts = [0, 300, 480, 720, 900, 1080, 1260]
    const index = timeOfDayDefinitions.findIndex((item) => item.value === record.startTimeOfDay)
    return starts[Math.max(index, 0)]
  }
  return 3_000
}

export function compareHistoryEvents(left: LogRecord, right: LogRecord): number {
  const order = eventSortValue(left) - eventSortValue(right)
  return order || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
}

function selectionsFor(data: HistoryData, observation: Observation): readonly TrackableOption[] {
  const ids = new Set(data.observationSelections.filter((item) => item.observationId === observation.id && !item.deletedAt).map((item) => item.optionId))
  return data.trackableOptions.filter((option) => ids.has(option.optionId) && !option.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function formatHistoryAnswer(data: HistoryData, observation: Observation): string {
  if (observation.answer.state !== 'answered') return missingLabels[observation.answer.state]
  const value = observation.answer.value
  if (value.kind === 'boolean') return value.value ? 'Yes' : 'No'
  if (value.kind === 'choice') return selectionsFor(data, observation).map((item) => item.label).join(', ') || 'No selection'
  if (value.kind === 'number') return `${value.value}${value.unit ? ` ${value.unit}` : ''}`
  if (value.kind === 'duration') return `${value.value} min`
  return String(value.value)
}

function answerDetail(data: HistoryData, observation: Observation): HistoryAnswer | null {
  const version = data.trackableVersions.find((item) => item.trackableId === observation.trackableId && item.version === observation.trackableVersion)
  if (!version) return null
  return { observationId: observation.id, name: version.name, value: formatHistoryAnswer(data, observation), state: observation.answer.state, trendValue: observation.trendValue }
}

function activeRecords(data: HistoryData): readonly LogRecord[] { return data.logRecords.filter((record) => !record.deletedAt) }

function weekdayFor(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

function itemWasActiveForRecord(item: RoutineItem, record: LogRecord): boolean {
  return item.createdAt <= record.createdAt && (!item.deletedAt || item.deletedAt > record.createdAt)
}

function scheduledForDate(item: RoutineItem, localDate: string): boolean {
  return item.frequency === 'every_day' || (item.weekdays ?? []).includes(weekdayFor(localDate))
}

function routineItemsForRecord(data: HistoryData, record: LogRecord): readonly RoutineItem[] {
  if (!record.routineId) return []
  return data.routineItems.filter((item) => item.routineId === record.routineId && item.target.kind === 'trackable' && itemWasActiveForRecord(item, record) && scheduledForDate(item, record.localDate)).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
}

function applicableRoutineItems(data: HistoryData, record: LogRecord): readonly RoutineItem[] {
  const observations = data.observations.filter((item) => item.logRecordId === record.id && !item.deletedAt)
  const observationIds = new Set(observations.map((item) => item.id))
  const answers = buildRuleAnswers(observations, data.observationSelections.filter((item) => observationIds.has(item.observationId) && !item.deletedAt))
  return routineItemsForRecord(data, record).filter((item) => evaluateConditionalRule(item.conditionalRule, answers))
}

export function formatCheckInAgendaSummary(status: 'draft' | 'completed', answeredCount: number, applicableCount: number): string {
  return status === 'completed' ? 'Completed' : `Draft · ${answeredCount}/${applicableCount} answered`
}

export function buildCalendarSummaries(data: HistoryData, today = currentLocalDate()): ReadonlyMap<string, CalendarDaySummary> {
  const summaries = new Map<string, CalendarDaySummary>()
  const definitions = quickLogDefinitions(data)
  for (const record of activeRecords(data)) {
    const coveredDates = isQuickLogRecord(record) ? eventCoveredDates(record, today) : [record.localDate]
    for (const localDate of coveredDates) {
      const current = summaries.get(localDate) ?? { localDate, checkInStatus: null, eventCount: 0, eventIcons: [] }
      if (record.recordKind === 'routine') current.checkInStatus = current.checkInStatus === 'completed' ? 'completed' : record.status
      if (isQuickLogRecord(record)) {
        current.eventCount += 1
        const icon = definitions.get(record.trackableId ?? record.eventDefinitionId ?? '')?.icon
        if (icon && current.eventIcons.length < 2) current.eventIcons = [...current.eventIcons, icon]
      }
      summaries.set(localDate, current)
    }
  }
  return summaries
}

export function buildDayDetail(data: HistoryData, localDate: string, today = currentLocalDate()): HistoryDayDetail {
  const records = activeRecords(data).filter((record) => isQuickLogRecord(record) ? eventCoveredDates(record, today).includes(localDate) : record.localDate === localDate)
  const routineRecord = records.filter((record) => record.recordKind === 'routine').sort((a, b) => Number(b.status === 'completed') - Number(a.status === 'completed') || b.updatedAt.localeCompare(a.updatedAt))[0]
  let checkIn: HistoryDayDetail['checkIn'] = null
  if (routineRecord) {
    const grouped = new Map<string, HistoryAnswer[]>()
    const orderedItems = routineItemsForRecord(data, routineRecord)
    const itemOrder = new Map(orderedItems.flatMap((item, index) => item.target.kind === 'trackable' ? [[item.target.trackableId, index] as const] : []))
    const observations = data.observations.filter((item) => item.logRecordId === routineRecord.id && !item.deletedAt).sort((a, b) => (itemOrder.get(a.trackableId) ?? Number.MAX_SAFE_INTEGER) - (itemOrder.get(b.trackableId) ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    for (const observation of observations) {
      const detail = answerDetail(data, observation)
      const trackable = data.trackables.find((item) => item.id === observation.trackableId)
      const category = trackable ? data.categories.find((item) => item.id === trackable.categoryId)?.name : undefined
      if (detail) grouped.set(category ?? 'Other', [...(grouped.get(category ?? 'Other') ?? []), detail])
    }
    checkIn = { record: routineRecord, groups: [...grouped].map(([category, answers]) => ({ category, answers })) }
  }
  const definitions = quickLogDefinitions(data)
  const events = records.filter(isQuickLogRecord).sort(compareHistoryEvents).flatMap((record): HistoryEventDetail[] => {
    const definition = definitionForRecord(data, record, definitions)
    if (!definition) return []
    const fields = data.observations.filter((item) => item.logRecordId === record.id && !item.deletedAt).flatMap((item) => answerDetail(data, item) ?? [])
    return [{ record, definition, timing: formatEventTiming(record), fields }]
  })
  return { localDate, checkIn, events }
}

export function buildWeekAgenda(data: HistoryData, dates: readonly string[], today = currentLocalDate()): readonly HistoryAgendaDay[] {
  return dates.map((localDate) => {
    const detail = buildDayDetail(data, localDate, today)
    const checkIn: HistoryAgendaRecord[] = detail.checkIn ? (() => {
      const applicableItems = applicableRoutineItems(data, detail.checkIn.record)
      const applicableIds = new Set(applicableItems.flatMap((item) => item.target.kind === 'trackable' ? [item.target.trackableId] : []))
      const answeredCount = data.observations.filter((item) => item.logRecordId === detail.checkIn!.record.id && !item.deletedAt && applicableIds.has(item.trackableId) && item.answer.state === 'answered').length
      return [{ kind: 'check-in', recordId: detail.checkIn.record.id, status: detail.checkIn.record.status, answeredCount, applicableCount: applicableItems.length, summary: formatCheckInAgendaSummary(detail.checkIn.record.status, answeredCount, applicableItems.length) }]
    })() : []
    const events: HistoryAgendaRecord[] = detail.events.map((event) => ({
      kind: 'event', recordId: event.record.id, name: event.definition.name, timing: event.timing, icon: event.definition.icon,
    }))
    return { localDate, records: [...checkIn, ...events] }
  })
}

function searchableRecord(data: HistoryData, record: LogRecord): { identity: string; terms: string; context: string; timing: string } | null {
  const observations = data.observations.filter((item) => item.logRecordId === record.id && !item.deletedAt)
  const contexts = observations.flatMap((observation) => {
    const trackable = data.trackables.find((item) => item.id === observation.trackableId)
    const version = data.trackableVersions.find((item) => item.trackableId === observation.trackableId && item.version === observation.trackableVersion)
    const category = trackable ? data.categories.find((item) => item.id === trackable.categoryId)?.name : undefined
    const value = formatHistoryAnswer(data, observation)
    return version ? [`${version.name}: ${value}`, ...(category ? [category] : []), ...(trackable?.tags ?? [])] : []
  })
  if (isQuickLogRecord(record)) {
    const definition = definitionForRecord(data, record)
    if (!definition) return null
    const category = data.categories.find((item) => item.id === definition.categoryId)?.name ?? ''
    return { identity: definition.name, terms: [definition.name, definition.description, category, ...contexts].filter(Boolean).join(' '), context: contexts[0] ?? formatEventTiming(record), timing: formatEventTiming(record) }
  }
  if (record.recordKind === 'routine') {
    const routine = data.routines.find((item) => item.id === record.routineId)
    return { identity: routine?.name ?? 'Nightly Check-In', terms: [routine?.name, 'nightly check-in', record.status, ...contexts].filter(Boolean).join(' '), context: contexts[0] ?? `${record.status} check-in`, timing: '' }
  }
  return null
}

export function parseHistoryQuery(query: string): { term: string; last: boolean } {
  const normalized = query.trim().toLowerCase().replace(/[?.!]+$/g, '').replace(/^when (?:was|did) (?:my |i )?/i, '')
  const last = /^(?:my )?last\s+/.test(normalized) || /^last occurrence (?:of )?/.test(normalized)
  const term = normalized.replace(/^(?:my )?last\s+/, '').replace(/^last occurrence (?:of )?/, '').trim()
  return { term, last }
}

export function searchHistory(data: HistoryData, query: string, today: string, filters: HistorySearchFilters = {}): HistorySearchResponse {
  const parsed = parseHistoryQuery(query)
  const hasFilters = Boolean(filters.from || filters.to || (filters.recordType && filters.recordType !== 'all'))
  if (!parsed.term && !hasFilters) return { isLastOccurrence: parsed.last, normalizedQuery: '', totalMatches: 0, results: [] }
  const orderedRecords = [...activeRecords(data)].sort((a, b) => b.localDate.localeCompare(a.localDate) || (isQuickLogRecord(a) && isQuickLogRecord(b) ? compareHistoryEvents(b, a) : b.updatedAt.localeCompare(a.updatedAt)))
  const results = orderedRecords.flatMap((record): HistorySearchResult[] => {
    const indexed = searchableRecord(data, record)
    const kind = isQuickLogRecord(record) ? 'event' : record.recordKind === 'routine' ? 'check-in' : null
    if (!indexed || !kind || (parsed.term && !indexed.terms.toLowerCase().includes(parsed.term))) return []
    if (filters.from && record.localDate < filters.from) return []
    if (filters.to && record.localDate > filters.to) return []
    if (filters.recordType && filters.recordType !== 'all' && kind !== filters.recordType) return []
    return [{ recordId: record.id, localDate: record.localDate, kind: isQuickLogRecord(record) ? 'event' : 'check-in', identity: indexed.identity, context: indexed.context, timing: indexed.timing, daysAgo: daysBetween(record.localDate, today) }]
  })
  return { isLastOccurrence: parsed.last, normalizedQuery: parsed.term, totalMatches: results.length, results: parsed.last ? results.slice(0, 1) : results }
}

export function historySearchSuggestions(data: HistoryData, query: string, limit = 6): readonly HistorySearchSuggestion[] {
  const term = query.trim().toLowerCase()
  if (!term) return []
  const labels = [
    ...[...quickLogDefinitions(data).values()].map((item) => item.name),
    ...data.trackableVersions.filter((item) => !item.deletedAt).map((item) => item.name),
    ...data.categories.filter((item) => !item.deletedAt).map((item) => item.name),
    ...data.trackables.filter((item) => !item.deletedAt).flatMap((item) => item.tags),
  ]
  const deduplicated = new Map<string, string>()
  for (const label of labels) {
    const trimmed = label.trim()
    if (trimmed && !deduplicated.has(trimmed.toLowerCase())) deduplicated.set(trimmed.toLowerCase(), trimmed)
  }
  return [...deduplicated.values()]
    .filter((label) => label.toLowerCase().includes(term))
    .sort((a, b) => Number(!a.toLowerCase().startsWith(term)) - Number(!b.toLowerCase().startsWith(term)) || a.localeCompare(b))
    .slice(0, limit)
    .map((label) => ({ label }))
}

export function groupHistoryResults(results: readonly HistorySearchResult[]): HistoryResultGroups {
  const ordered = [...results].sort((a, b) => b.localDate.localeCompare(a.localDate) || a.recordId.localeCompare(b.recordId))
  return {
    recent: ordered.filter((item) => item.daysAgo <= 30),
    earlier: ordered.filter((item) => item.daysAgo > 30),
  }
}

export function sliceHistoryGroup(results: readonly HistorySearchResult[], limit: number, expanded = false): { visible: readonly HistorySearchResult[]; hiddenCount: number } {
  const visible = expanded ? results : results.slice(0, limit)
  return { visible, hiddenCount: Math.max(0, results.length - visible.length) }
}

export function metricChoices(data: HistoryData): readonly MetricChoice[] {
  return data.trackables.filter((item) => item.active && !item.deletedAt).flatMap((trackable): MetricChoice[] => {
    const version = data.trackableVersions.find((item) => item.trackableId === trackable.id && item.version === trackable.currentVersion && !item.deletedAt)
    return version && ['boolean', 'scale', 'number', 'single_choice'].includes(version.inputType)
      ? [{ trackableId: trackable.id, name: version.name, inputType: version.inputType as MetricChoice['inputType'] }]
      : []
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export function eventMetricChoices(data: HistoryData): readonly EventMetricChoice[] {
  return [...quickLogDefinitions(data).values()].filter((definition) => definition.active && !definition.deletedAt)
    .map((definition) => ({ eventDefinitionId: definition.id, name: definition.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function calendarMetricOptions(data: HistoryData): readonly CalendarMetricOption[] {
  return [
    ...metricChoices(data).filter((choice) => !isOccurrenceTrackable(data.trackables.find((item) => item.id === choice.trackableId)!)).map((choice): CalendarMetricOption => ({ identity: `trackable:${choice.trackableId}`, name: choice.name, kind: 'Daily Value' })),
    ...eventMetricChoices(data).map((choice): CalendarMetricOption => ({ identity: `event:${choice.eventDefinitionId}`, name: choice.name, kind: 'Occurrence' })),
  ].sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind) || a.identity.localeCompare(b.identity))
}

export function observedRangeLevel(value: number, observedValues: readonly number[]): number {
  if (!observedValues.length) return 0
  const min = Math.min(...observedValues)
  const max = Math.max(...observedValues)
  if (min === max) return 0.55
  return 0.25 + ((value - min) / (max - min)) * 0.75
}

export function projectEventCalendar(data: HistoryData, eventDefinitionId: string, today = currentLocalDate(), heatmap = false): ReadonlyMap<string, MetricDayValue> {
  const counts = new Map<string, number>()
  for (const record of activeRecords(data)) {
    if (!isQuickLogRecord(record) || (record.trackableId ?? record.eventDefinitionId) !== eventDefinitionId) continue
    for (const localDate of eventCoveredDates(record, today)) counts.set(localDate, (counts.get(localDate) ?? 0) + 1)
  }
  const observedCounts = [...counts.values()]
  return new Map([...counts].map(([localDate, count]) => [localDate, {
    localDate,
    display: `${count} ${count === 1 ? 'entry' : 'entries'}`,
    level: heatmap ? observedRangeLevel(count, observedCounts) : 1,
  }]))
}

export function projectCalendarMetric(data: HistoryData, identity: CalendarMetricIdentity, today = currentLocalDate(), heatmap = false): ReadonlyMap<string, MetricDayValue> {
  return identity.startsWith('trackable:')
    ? projectMetricCalendar(data, identity.slice('trackable:'.length), heatmap)
    : projectEventCalendar(data, identity.slice('event:'.length), today, heatmap)
}

export function projectMetricCalendar(data: HistoryData, trackableId: string, heatmap = false): ReadonlyMap<string, MetricDayValue> {
  const routineDates = new Map(activeRecords(data).filter((item) => item.recordKind === 'routine').map((item) => [item.id, item.localDate]))
  const candidates = data.observations.filter((item) => item.trackableId === trackableId && !item.deletedAt && item.answer.state === 'answered' && routineDates.has(item.logRecordId))
  const numeric = candidates.flatMap((item): number[] => {
    if (item.answer.state !== 'answered') return []
    const value = item.answer.value
    return value.kind === 'number' || value.kind === 'scale' ? [value.value] : []
  })
  const min = Math.min(...numeric); const max = Math.max(...numeric)
  const result = new Map<string, MetricDayValue>()
  for (const observation of candidates) {
    if (observation.answer.state !== 'answered') continue
    const value = observation.answer.value
    let display = ''; let level = 0
    if (value.kind === 'boolean') { display = value.value ? 'Yes' : 'No'; level = value.value ? 1 : 0 }
    else if (value.kind === 'scale') {
      const version = data.trackableVersions.find((item) => item.trackableId === trackableId && item.version === observation.trackableVersion)
      display = String(value.value); level = heatmap ? observedRangeLevel(value.value, numeric) : (value.value - (version?.scaleMin ?? 0)) / Math.max(1, (version?.scaleMax ?? 5) - (version?.scaleMin ?? 0))
    } else if (value.kind === 'number') { display = `${value.value}${value.unit ? ` ${value.unit}` : ''}`; level = heatmap ? observedRangeLevel(value.value, numeric) : min === max ? 0.5 : (value.value - min) / (max - min) }
    else if (value.kind === 'choice') {
      const selected = selectionsFor(data, observation)[0]
      if (!selected) continue
      const options = data.trackableOptions.filter((item) => item.trackableId === trackableId && item.trackableVersion === observation.trackableVersion && !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)
      display = selected.label; level = options.length < 2 ? 0.5 : selected.sortOrder / (options.length - 1)
    } else continue
    result.set(routineDates.get(observation.logRecordId)!, { localDate: routineDates.get(observation.logRecordId)!, display, level: heatmap ? Math.min(1, Math.max(0, level)) : 1 })
  }
  return result
}

export class HistoryEngine {
  private readonly repository: DataRepository
  private readonly now: () => Date

  constructor(repository: DataRepository, now: () => Date = () => new Date()) {
    this.repository = repository
    this.now = now
  }

  async load(): Promise<HistoryData> {
    const [categories, eventDefinitions, logRecords, observations, observationSelections, routines, routineItems, settings, trackables, trackableOptions, trackableVersions] = await Promise.all([
      this.repository.getAll('categories'), this.repository.getAll('eventDefinitions'), this.repository.getAll('logRecords'),
      this.repository.getAll('observations'), this.repository.getAll('observationSelections'), this.repository.getAll('routines'), this.repository.getAll('routineItems'), this.repository.getAll('settings'),
      this.repository.getAll('trackables'), this.repository.getAll('trackableOptions'), this.repository.getAll('trackableVersions'),
    ])
    return { categories, eventDefinitions, logRecords, observations, observationSelections, routines, routineItems, settings, trackables, trackableOptions, trackableVersions }
  }

  async softDelete(recordId: string): Promise<LogRecord> {
    const record = await this.repository.getById('logRecords', recordId)
    if (!record || record.deletedAt) throw new Error('Historical record was not found.')
    const timestamp = this.now().toISOString()
    const deleted = { ...record, deletedAt: timestamp, updatedAt: timestamp, revision: record.revision + 1 }
    await this.repository.save('logRecords', deleted)
    return deleted
  }

  async restore(recordId: string): Promise<LogRecord> {
    const record = await this.repository.getById('logRecords', recordId)
    if (!record || !record.deletedAt) throw new Error('Deleted record was not found.')
    const timestamp = this.now().toISOString()
    const restored = { ...record, deletedAt: null, updatedAt: timestamp, revision: record.revision + 1 }
    await this.repository.save('logRecords', restored)
    return restored
  }
}
