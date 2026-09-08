import { describe, expect, it } from 'vitest'
import { InMemoryDataRepository } from '../../data/local/InMemoryDataRepository.ts'
import type { HistoryData, HistorySearchResult } from './HistoryEngine.ts'
import {
  HistoryEngine, buildCalendarSummaries, buildDayDetail, buildWeekAgenda, calendarDates, compareHistoryEvents,
  buildHistorySearchIndex, calendarMetricOptions, eventCoveredDates, eventMetricChoices, formatCheckInAgendaSummary, groupHistoryResults, historySearchSuggestions,
  metricChoices, observedRangeLevel, parseHistoryQuery, projectCalendarMetric, projectEventCalendar, projectMetricCalendar, searchHistory, formatHistoryAnswer,
  normalizeHistorySearchText, shiftLocalDate, shiftMonth, sliceHistoryGroup, weekDates,
} from './HistoryEngine.ts'
import type { LogRecord, Observation } from '../models/index.ts'

const createdAt = '2026-08-01T12:00:00.000Z'
const sync = { createdAt, updatedAt: createdAt, deletedAt: null, revision: 1 }

function record(id: string, localDate: string, kind: 'routine' | 'event', extras: Partial<LogRecord> = {}): LogRecord {
  return {
    id, recordKind: kind, localDate, startTimePrecision: 'day', startTime: null, startTimeOfDay: null,
    endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false,
    timezone: null, status: kind === 'routine' ? 'draft' : 'completed', source: 'app', ...sync, ...extras,
  }
}

function fixture(): HistoryData {
  const routine = record('routine-1', '2026-08-10', 'routine', { routineId: 'nightly', status: 'completed' })
  const migraineMorning = record('event-1', '2026-08-10', 'event', { eventDefinitionId: 'migraine', eventTimingKind: 'point', startTimePrecision: 'timeOfDay', startTimeOfDay: 'morning' })
  const migraineExact = record('event-2', '2026-08-10', 'event', { eventDefinitionId: 'migraine', eventTimingKind: 'point', startTimePrecision: 'exact', startTime: new Date(2026, 7, 10, 9, 17).toISOString() })
  const travel = record('event-3', '2026-08-01', 'event', { eventDefinitionId: 'travel', eventTimingKind: 'duration', endLocalDate: '2026-08-03', endTimePrecision: 'day' })
  const mood: Observation = { id: 'obs-mood', logRecordId: routine.id, trackableId: 'mood', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'scale', value: 0 } }, trendValue: 'Better', ...sync }
  const acne: Observation = { id: 'obs-acne', logRecordId: routine.id, trackableId: 'acne', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'boolean', value: false } }, ...sync }
  const note: Observation = { id: 'obs-note', logRecordId: migraineMorning.id, trackableId: 'notes', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'text', value: 'After travel' } }, ...sync }
  return {
    categories: [
      { id: 'health', name: 'General Health', sortOrder: 0, active: true, ...sync },
      { id: 'skin', name: 'Skin', sortOrder: 1, active: true, ...sync },
      { id: 'mental', name: 'Mood & Mental', sortOrder: 2, active: true, ...sync },
    ],
    eventDefinitions: [
      { id: 'migraine', name: 'Migraine', categoryId: 'health', timingMode: 'either', dataRole: 'symptom', active: true, nightlyReminderDefault: 'never', treatmentFollowUpEnabled: false, ...sync },
      { id: 'travel', name: 'Travel', categoryId: 'health', timingMode: 'duration', dataRole: 'context', active: true, nightlyReminderDefault: 'never', treatmentFollowUpEnabled: false, ...sync },
    ],
    logRecords: [routine, migraineMorning, migraineExact, travel], observations: [mood, acne, note], observationSelections: [],
    routines: [{ id: 'nightly', name: 'Nightly Check-In', active: true, scheduleType: 'daily', ...sync }],
    routineItems: [
      { id: 'item-acne', routineId: 'nightly', target: { kind: 'trackable', trackableId: 'acne' }, sortOrder: 0, enabled: true, frequency: 'every_day', completionBehavior: 'optional', trendTrackingMode: 'none', eventReminderBehavior: 'never', ...sync },
      { id: 'item-mood', routineId: 'nightly', target: { kind: 'trackable', trackableId: 'mood' }, sortOrder: 1, enabled: true, frequency: 'every_day', completionBehavior: 'optional', trendTrackingMode: 'better_same_worse', eventReminderBehavior: 'never', ...sync },
      { id: 'item-notes', routineId: 'nightly', target: { kind: 'trackable', trackableId: 'notes' }, sortOrder: 2, enabled: true, frequency: 'every_day', conditionalRule: { sourceTrackableId: 'acne', operator: 'equals', expectedValue: true }, completionBehavior: 'optional', trendTrackingMode: 'none', eventReminderBehavior: 'never', ...sync },
    ], settings: [],
    trackables: [
      { id: 'mood', categoryId: 'mental', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'outcome', ...sync },
      { id: 'acne', categoryId: 'skin', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'symptom', ...sync },
      { id: 'notes', categoryId: 'health', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'other', ...sync },
    ],
    trackableOptions: [],
    trackableVersions: [
      { id: 'mood-v1', trackableId: 'mood', version: 1, name: 'Mood', inputType: 'scale', scaleMin: 0, scaleMax: 5, scaleStep: 1, valueDirection: 'better', configuration: {}, retiredAt: null, ...sync },
      { id: 'acne-v1', trackableId: 'acne', version: 1, name: 'Acne', inputType: 'boolean', valueDirection: 'worse', configuration: {}, retiredAt: null, ...sync },
      { id: 'notes-v1', trackableId: 'notes', version: 1, name: 'Notes', inputType: 'text', valueDirection: 'neutral', configuration: {}, retiredAt: null, ...sync },
    ],
  }
}

describe('History calendar and detail', () => {
  it('resolves each stable selected option only from the observation-pinned version', () => {
    const base = fixture()
    const observation: Observation = { id: 'choice-observation', logRecordId: 'routine-1', trackableId: 'choice', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'choice', value: null } }, ...sync }
    const data: HistoryData = { ...base, observations: [...base.observations, observation], observationSelections: [{ id: 'selection', observationId: observation.id, optionId: 'stable-option', ...sync }],
      trackableOptions: [
        { id: 'stable-option:v1', optionId: 'stable-option', trackableId: 'choice', trackableVersion: 1, storedValue: 'cheeks', label: 'Cheeks', sortOrder: 0, active: true, ...sync },
        { id: 'stable-option:v2', optionId: 'stable-option', trackableId: 'choice', trackableVersion: 2, storedValue: 'cheeks', label: 'Cheeks', sortOrder: 0, active: true, ...sync },
      ] }
    expect(formatHistoryAnswer(data, observation)).toBe('Cheeks')
  })
  it('groups completion state and multiple same-day events by local date', () => {
    const base = fixture()
    const data = { ...base, logRecords: [...base.logRecords, record('routine-draft', '2026-08-09', 'routine', { routineId: 'nightly', status: 'draft' })] }
    const summaries = buildCalendarSummaries(data); const august10 = summaries.get('2026-08-10')
    expect(august10).toMatchObject({ checkInStatus: 'completed', eventCount: 2 })
    expect(august10?.activityCategoryIds).toEqual(['health'])
    expect(summaries.get('2026-08-09')?.checkInStatus).toBe('draft')
  })

  it('keeps exact, time-of-day, date-only, and duration display semantics', () => {
    const day = buildDayDetail(fixture(), '2026-08-10')
    expect(day.events).toHaveLength(2)
    expect(day.events.map((item) => item.timing).join(' ')).toContain('Morning')
    expect(day.events.map((item) => item.timing).join(' ')).toContain('9:17 AM')
    expect(buildDayDetail(fixture(), '2026-08-01').events[0].timing).toContain('Aug 1')
    expect(buildDayDetail(fixture(), '2026-08-01').events[0].timing).toContain('Aug 3')
    const base = fixture(); const data = { ...base, logRecords: [...base.logRecords, record('date-only', '2026-08-05', 'event', { eventDefinitionId: 'migraine', eventTimingKind: 'point' })] }
    expect(buildDayDetail(data, '2026-08-05').events[0].timing).toBe('Date only')
  })

  it('orders exact values before natural time-of-day buckets and date-only records without inventing times', () => {
    const data = fixture()
    const dateOnly = record('date-only', '2026-08-10', 'event')
    const sorted = [...data.logRecords.filter((item) => item.recordKind === 'event' && item.localDate === '2026-08-10'), dateOnly].sort(compareHistoryEvents)
    expect(sorted.map((item) => item.id)).toEqual(['event-1', 'event-2', 'date-only'])
    expect(dateOnly.startTime).toBeNull()
  })

  it('preserves zero and explicit No in historical detail', () => {
    const answers = buildDayDetail(fixture(), '2026-08-10').checkIn!.groups.flatMap((group) => group.answers)
    expect(answers.find((item) => item.name === 'Mood')?.value).toBe('0')
    expect(answers.find((item) => item.name === 'Acne')?.value).toBe('No')
    expect(answers.find((item) => item.name === 'Mood')?.focusTarget).toBe('trackable:mood')
  })

  it('preserves routine category and question order in historical detail', () => {
    const groups = buildDayDetail(fixture(), '2026-08-10').checkIn!.groups
    expect(groups.map((group) => group.category)).toEqual(['Skin', 'Mood & Mental'])
    expect(groups.flatMap((group) => group.answers.map((answer) => answer.name))).toEqual(['Acne', 'Mood'])
  })

  it('builds stable six-week month grids and navigates months', () => {
    expect(calendarDates('2026-08', 0)).toHaveLength(42)
    expect(calendarDates('2026-08', 0)[0]).toBe('2026-07-26')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('builds seven-day weeks respecting the configured first day', () => {
    expect(weekDates('2026-08-11', 0)).toEqual(['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15'])
    expect(weekDates('2026-08-11', 1)[0]).toBe('2026-08-10')
    expect(shiftLocalDate('2026-08-11', -7)).toBe('2026-08-04')
  })

  it('builds agenda days with Check-In before events and includes covered multi-day events', () => {
    const dates = ['2026-08-01', '2026-08-02', '2026-08-03']
    const agenda = buildWeekAgenda(fixture(), dates, '2026-08-11')
    expect(agenda).toHaveLength(3)
    expect(agenda.find((day) => day.localDate === '2026-08-01')?.records.map((item) => item.recordId)).toContain('event-3')
    expect(agenda.find((day) => day.localDate === '2026-08-02')?.records.map((item) => item.recordId)).toContain('event-3')
    expect(agenda.find((day) => day.localDate === '2026-08-03')?.records.map((item) => item.recordId)).toContain('event-3')
    const august10 = buildWeekAgenda(fixture(), weekDates('2026-08-10', 1), '2026-08-11').find((day) => day.localDate === '2026-08-10')!
    expect(august10.records.map((item) => item.kind)).toEqual(['check-in', 'event', 'event'])
  })

  it('formats completed Check-Ins without a count and draft progress from applicable routine questions', () => {
    expect(formatCheckInAgendaSummary('completed', 2, 2)).toBe('Completed')
    const base = fixture()
    const draftData = {
      ...base,
      logRecords: base.logRecords.map((item) => item.id === 'routine-1' ? { ...item, status: 'draft' as const } : item),
      observations: base.observations.filter((item) => item.id !== 'obs-acne'),
    }
    const checkIn = buildWeekAgenda(draftData, ['2026-08-10'], '2026-08-11')[0].records[0]
    expect(checkIn).toMatchObject({ kind: 'check-in', answeredCount: 1, applicableCount: 2, summary: 'Draft · 1/2 answered' })
  })
})

describe('duration calendar coverage', () => {
  it('projects a same-day duration once', () => {
    const sameDay = record('same-day', '2026-08-10', 'event', { eventTimingKind: 'duration', endLocalDate: '2026-08-10', endTimePrecision: 'day' })
    expect(eventCoveredDates(sameDay, '2026-08-11')).toEqual(['2026-08-10'])
  })

  it('projects every inclusive date of a multi-day duration', () => {
    const multiDay = record('multi-day', '2026-08-01', 'event', { eventTimingKind: 'duration', endLocalDate: '2026-08-03', endTimePrecision: 'day' })
    expect(eventCoveredDates(multiDay, '2026-08-11')).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
  })

  it('projects across a month boundary without duplicating the record', () => {
    const trip = record('trip', '2026-07-31', 'event', { eventDefinitionId: 'travel', eventTimingKind: 'duration', endLocalDate: '2026-08-02', endTimePrecision: 'day' })
    const base = fixture(); const data = { ...base, logRecords: [trip] }
    const summaries = buildCalendarSummaries(data, '2026-08-11')
    expect(['2026-07-31', '2026-08-01', '2026-08-02'].map((date) => summaries.get(date)?.eventCount)).toEqual([1, 1, 1])
    expect(buildDayDetail(data, '2026-08-02', '2026-08-11').events[0].record.id).toBe('trip')
    expect(data.logRecords).toHaveLength(1)
  })

  it('projects an ongoing duration through today without adding an end', () => {
    const ongoing = record('ongoing', '2026-08-09', 'event', { eventTimingKind: 'duration', ongoing: true })
    expect(eventCoveredDates(ongoing, '2026-08-11')).toEqual(['2026-08-09', '2026-08-10', '2026-08-11'])
    expect(ongoing.endLocalDate).toBeNull()
  })
})

describe('History search and metric projection', () => {
  function recordedValueFixture(): HistoryData {
    const base = fixture()
    const injection = record('injection-record', '2026-08-09', 'event', { trackableId: 'injection', trackableVersion: 1, eventTimingKind: 'point', startTimePrecision: 'timeOfDay', startTimeOfDay: 'evening' })
    const medicationAnswer: Observation = { id: 'obs-medication', logRecordId: injection.id, trackableId: 'medication-type', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'text', value: 'Humira' } }, ...sync }
    const journalAnswer: Observation = { id: 'obs-journal', logRecordId: 'routine-1', trackableId: 'journal', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'text', value: 'Felt rested' } }, ...sync }
    const choiceAnswer: Observation = { id: 'obs-choice', logRecordId: 'routine-1', trackableId: 'location', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'choice', value: null } }, ...sync }
    return {
      ...base,
      categories: [...base.categories, { id: 'medication', name: 'Medication & Treatment', sortOrder: 3, active: true, ...sync }],
      logRecords: [...base.logRecords, injection],
      observations: [...base.observations, medicationAnswer, journalAnswer, choiceAnswer],
      observationSelections: [...base.observationSelections, { id: 'selection-location', observationId: choiceAnswer.id, optionId: 'location-cheek', ...sync }],
      routineItems: [
        ...base.routineItems,
        { id: 'item-journal', routineId: 'nightly', target: { kind: 'trackable' as const, trackableId: 'journal' }, sortOrder: 3, enabled: true, frequency: 'every_day' as const, completionBehavior: 'optional' as const, trendTrackingMode: 'none' as const, eventReminderBehavior: 'never' as const, ...sync },
        { id: 'item-location', routineId: 'nightly', target: { kind: 'trackable' as const, trackableId: 'location' }, sortOrder: 4, enabled: true, frequency: 'every_day' as const, completionBehavior: 'optional' as const, trendTrackingMode: 'none' as const, eventReminderBehavior: 'never' as const, ...sync },
      ],
      trackables: [
        ...base.trackables,
        { id: 'injection', categoryId: 'medication', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'treatment', recordSemantics: 'occurrence', quickLogEnabled: true, ...sync },
        { id: 'medication-type', categoryId: 'medication', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'treatment', ...sync },
        { id: 'journal', categoryId: 'mental', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'context', ...sync },
        { id: 'location', categoryId: 'skin', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'symptom', ...sync },
      ],
      trackableVersions: [
        ...base.trackableVersions,
        { id: 'injection-v1', trackableId: 'injection', version: 1, name: 'Medication Taken', inputType: 'boolean', valueDirection: 'neutral', configuration: {}, retiredAt: null, ...sync },
        { id: 'medication-type-v1', trackableId: 'medication-type', version: 1, name: 'Medication Type', inputType: 'text', valueDirection: 'neutral', configuration: {}, retiredAt: null, ...sync },
        { id: 'journal-v1', trackableId: 'journal', version: 1, name: 'Daily note', inputType: 'text', valueDirection: 'neutral', configuration: {}, retiredAt: null, ...sync },
        { id: 'location-v1', trackableId: 'location', version: 1, name: 'Location', inputType: 'single_choice', valueDirection: 'neutral', configuration: {}, retiredAt: null, ...sync },
      ],
      trackableOptions: [...base.trackableOptions, { id: 'location-cheek-v1', optionId: 'location-cheek', trackableId: 'location', trackableVersion: 1, storedValue: 'internal-cheek-value', label: 'Left Cheek', sortOrder: 0, active: true, ...sync }],
      trackableFields: [{ id: 'field-medication-type', ownerTrackableId: 'injection', ownerTrackableVersion: 1, fieldTrackableId: 'medication-type', fieldTrackableVersion: 1, sortOrder: 0, enabled: true, completionBehavior: 'optional', ...sync }],
    }
  }

  it('searches event names and notes newest first', () => {
    expect(searchHistory(fixture(), 'migraine', '2026-08-11').results).toHaveLength(2)
    expect(searchHistory(fixture(), 'travel', '2026-08-11').totalMatches).toBe(2)
  })

  it('matches Trackable and category names through the normalized record index', () => {
    const data = recordedValueFixture()
    expect(searchHistory(data, 'Medication Taken', '2026-08-11').results.map((item) => item.recordId)).toEqual(['injection-record'])
    expect(searchHistory(data, 'Medication and Treatment', '2026-08-11').results.map((item) => item.recordId)).toEqual(['injection-record'])
  })

  it('matches free-text values from Quick Logs and Daily Check-Ins case-insensitively', () => {
    const data = recordedValueFixture()
    expect(searchHistory(data, 'HUMIRA', '2026-08-11').results[0]).toMatchObject({ recordId: 'injection-record', identity: 'Medication Taken' })
    expect(searchHistory(data, 'felt RESTED', '2026-08-11').results[0]).toMatchObject({ recordId: 'routine-1', identity: 'Daily Check-In' })
  })

  it('resolves selected option labels without indexing internal option identities', () => {
    const data = recordedValueFixture()
    expect(searchHistory(data, 'left cheek', '2026-08-11').results[0]).toMatchObject({ recordId: 'routine-1' })
    expect(searchHistory(data, 'location-cheek', '2026-08-11').results).toEqual([])
    expect(searchHistory(data, 'internal-cheek-value', '2026-08-11').results).toEqual([])
  })

  it('shows the matching nested field and value as result context', () => {
    const result = searchHistory(recordedValueFixture(), 'Humira', '2026-08-11').results[0]
    expect(result.context).toBe('Medication Taken · Medication Type: Humira · Medication & Treatment')
  })

  it('normalizes case, accents, punctuation, ampersands, and whitespace', () => {
    expect(normalizeHistorySearchText('  Mood & MÉNTAL — Notes!  ')).toBe('mood and mental notes')
  })

  it('indexes only exact recorded numeric values for numeric-only queries', () => {
    expect(searchHistory(fixture(), '0', '2026-08-11').results.map((item) => item.recordId)).toEqual(['routine-1'])
    expect(searchHistory(fixture(), 'Better', '2026-08-11').results.map((item) => item.recordId)).toEqual(['routine-1'])
  })

  it('includes recorded user-facing values in suggestions without exposing IDs', () => {
    const data = recordedValueFixture()
    expect(historySearchSuggestions(data, 'hum')).toEqual([{ label: 'Humira' }])
    expect(historySearchSuggestions(data, 'location-cheek')).toEqual([])
    expect(buildHistorySearchIndex(data).find((item) => item.recordId === 'injection-record')?.searchableTerms.join(' ')).not.toContain('field-medication-type')
  })

  it('uses Daily Check-In for user-facing search results even with legacy routine data', () => {
    expect(searchHistory(fixture(), 'daily check-in', '2026-08-11').results[0].identity).toBe('Daily Check-In')
    expect(searchHistory(fixture(), 'nightly check-in', '2026-08-11').results[0].identity).toBe('Daily Check-In')
  })

  it('parses and returns only the latest last-occurrence result', () => {
    expect(parseHistoryQuery('When was my last migraine?')).toEqual({ term: 'migraine', last: true })
    const result = searchHistory(fixture(), 'last migraine', '2026-08-11')
    expect(result.isLastOccurrence).toBe(true)
    expect(result.totalMatches).toBe(2)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].daysAgo).toBe(1)
  })

  it('applies inclusive From, To, combined, and record-type filters using local dates', () => {
    const data = fixture()
    expect(searchHistory(data, '', '2026-08-11', { from: '2026-08-10' }).totalMatches).toBe(3)
    expect(searchHistory(data, '', '2026-08-11', { to: '2026-08-01' }).results.map((item) => item.recordId)).toEqual(['event-3'])
    expect(searchHistory(data, '', '2026-08-11', { from: '2026-08-10', to: '2026-08-10' }).totalMatches).toBe(3)
    expect(searchHistory(data, 'migraine', '2026-08-11', { recordType: 'check-in' }).totalMatches).toBe(0)
    expect(searchHistory(data, '', '2026-08-11', { recordType: 'check-in' }).results.map((item) => item.recordId)).toEqual(['routine-1'])
    expect(searchHistory(data, '', '2026-08-11', {}).results).toEqual([])
  })

  it('ranks prefix suggestions before substring matches and deduplicates display labels', () => {
    const base = fixture()
    const data: HistoryData = {
      ...base,
      trackables: base.trackables.map((item) => item.id === 'mood' ? { ...item, tags: ['My migraine'] } : item),
      trackableVersions: [...base.trackableVersions, { id: 'duplicate-migraine-v1', trackableId: 'mood', version: 2, name: 'Migraine', inputType: 'scale', scaleMin: 1, scaleMax: 5, scaleStep: 1, valueDirection: 'worse', configuration: {}, retiredAt: null, ...sync }],
    }
    expect(historySearchSuggestions(data, 'MIG')).toEqual([{ label: 'Migraine' }, { label: 'My migraine' }])
    expect(historySearchSuggestions(data, 'mental')).toEqual([{ label: 'Mood & Mental' }])
    expect(historySearchSuggestions(data, '')).toEqual([])
  })

  it('groups the 30-day boundary as Recent and older matches as Earlier, newest first', () => {
    const result = (id: string, localDate: string, daysAgo: number): HistorySearchResult => ({ recordId: id, localDate, daysAgo, kind: 'event', identity: 'Test', context: '', timing: '' })
    const groups = groupHistoryResults([
      result('older', '2026-07-11', 31), result('today', '2026-08-11', 0), result('boundary', '2026-07-12', 30), result('oldest', '2026-06-01', 71),
    ])
    expect(groups.recent.map((item) => item.recordId)).toEqual(['today', 'boundary'])
    expect(groups.earlier.map((item) => item.recordId)).toEqual(['older', 'oldest'])
  })

  it('slices result groups for See more and reveals all when expanded', () => {
    const results = Array.from({ length: 7 }, (_, index): HistorySearchResult => ({ recordId: `result-${index}`, localDate: `2026-07-${String(31 - index).padStart(2, '0')}`, daysAgo: 31 + index, kind: 'event', identity: 'Test', context: '', timing: '' }))
    expect(sliceHistoryGroup(results, 5)).toMatchObject({ visible: results.slice(0, 5), hiddenCount: 2 })
    expect(sliceHistoryGroup(results, 5, true)).toMatchObject({ visible: results, hiddenCount: 0 })
  })

  it('offers only suitable metric types and projects accessible display values', () => {
    const data = fixture()
    expect(metricChoices(data).map((item) => item.name)).toEqual(['Acne', 'Mood'])
    expect(projectMetricCalendar(data, 'mood').get('2026-08-10')).toEqual({ localDate: '2026-08-10', display: '0', level: 1 })
    expect(projectMetricCalendar(data, 'acne').get('2026-08-10')?.display).toBe('No')
    expect(projectMetricCalendar(data, 'notes').size).toBe(0)
  })

  it('projects Event Definition occurrence counts separately from Trackable values', () => {
    const data = fixture()
    expect(eventMetricChoices(data).map((item) => item.name)).toEqual(['Migraine', 'Travel'])
    expect(projectEventCalendar(data, 'migraine', '2026-08-11').get('2026-08-10')).toEqual({ localDate: '2026-08-10', display: '2 entries', level: 1 })
    expect(['2026-08-01', '2026-08-02', '2026-08-03'].map((date) => projectEventCalendar(data, 'travel', '2026-08-11').get(date)?.display)).toEqual(['1 entry', '1 entry', '1 entry'])
    expect(projectEventCalendar(data, 'missing', '2026-08-11').size).toBe(0)
  })

  it('keeps duplicate Trackable and Event names isolated by typed stable identity', () => {
    const base = fixture()
    const migraineDailyValue: Observation = { id: 'migraine-daily-value', logRecordId: 'routine-1', trackableId: 'migraine-trackable', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'scale', value: 3 } }, ...sync }
    const data: HistoryData = {
      ...base,
      observations: [...base.observations, migraineDailyValue],
      trackables: [...base.trackables, { id: 'migraine-trackable', categoryId: 'health', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'symptom', ...sync }],
      trackableVersions: [...base.trackableVersions, { id: 'migraine-trackable-v1', trackableId: 'migraine-trackable', version: 1, name: 'Migraine', inputType: 'scale', scaleMin: 0, scaleMax: 5, scaleStep: 1, valueDirection: 'worse', configuration: {}, retiredAt: null, ...sync }],
    }
    expect(projectCalendarMetric(data, 'event:migraine', '2026-08-11').get('2026-08-10')?.display).toBe('2 entries')
    expect(projectCalendarMetric(data, 'trackable:migraine-trackable', '2026-08-11').get('2026-08-10')?.display).toBe('3')
    expect(projectCalendarMetric(data, 'event:travel', '2026-08-11').get('2026-08-02')?.display).toBe('1 entry')
    expect(projectCalendarMetric(data, 'event:migraine', '2026-08-11').get('2026-08-10')?.display).toBe('2 entries')
    expect(calendarMetricOptions(data).filter((option) => option.name === 'Migraine')).toEqual([
      { identity: 'trackable:migraine-trackable', name: 'Migraine', kind: 'Daily Value' },
      { identity: 'event:migraine', name: 'Migraine', kind: 'Occurrence' },
    ])
  })

  it('classifies a routine occurrence from its canonical Quick Log without a false Daily Value', () => {
    const base = fixture()
    const occurrence = { id: 'migraine-trackable', categoryId: 'health', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'symptom' as const, recordSemantics: 'occurrence' as const, quickLogEnabled: true, ...sync }
    const version = { id: 'migraine-trackable-v1', trackableId: occurrence.id, version: 1, name: 'Migraine', inputType: 'boolean' as const, valueDirection: 'worse' as const, configuration: {}, retiredAt: null, ...sync }
    const quickLog = record('migraine-quick-log', '2026-08-10', 'event', { recordKind: 'quick_log', trackableId: occurrence.id, trackableVersion: 1, eventTimingKind: 'point' })
    const routineItem = { id: 'item-migraine', routineId: 'nightly', target: { kind: 'trackable' as const, trackableId: occurrence.id }, sortOrder: 3, enabled: true, frequency: 'every_day' as const, completionBehavior: 'optional' as const, trendTrackingMode: 'none' as const, eventReminderBehavior: 'never' as const, ...sync }
    // Simulates a legacy/external phantom parent observation. It must not become a second logical record.
    const phantom: Observation = { id: 'phantom-migraine-daily-value', logRecordId: 'routine-1', trackableId: occurrence.id, trackableVersion: 1, answer: { state: 'answered', value: { kind: 'boolean', value: true } }, ...sync }
    const data: HistoryData = {
      ...base,
      eventDefinitions: [],
      logRecords: [base.logRecords[0], quickLog],
      observations: [...base.observations, phantom],
      routineItems: [...base.routineItems, routineItem],
      trackables: [...base.trackables, occurrence],
      trackableVersions: [...base.trackableVersions, version],
    }

    expect(data.logRecords.filter((item) => item.trackableId === occurrence.id)).toHaveLength(1)
    expect(searchHistory(data, 'migraine', '2026-08-11').results).toEqual([
      expect.objectContaining({ recordId: quickLog.id, kind: 'event', identity: 'Migraine' }),
    ])
    expect(buildDayDetail(data, '2026-08-10').checkIn?.groups.flatMap((group) => group.answers).some((answer) => answer.name === 'Migraine')).toBe(false)
    expect(calendarMetricOptions(data).filter((option) => option.name === 'Migraine')).toEqual([
      { identity: `event:${occurrence.id}`, name: 'Migraine', kind: 'Occurrence' },
    ])
    expect(buildCalendarSummaries(data).get('2026-08-10')).toMatchObject({ eventCount: 1, activityCategoryIds: ['health'] })
    expect(projectEventCalendar(data, occurrence.id, '2026-08-11').get('2026-08-10')?.display).toBe('1 entry')
  })

  it('normalizes Event heatmaps across the observed range without capping high frequencies', () => {
    const base = fixture()
    const additions = [
      ...Array.from({ length: 1 }, (_, index) => record(`low-${index}`, '2026-08-04', 'event', { eventDefinitionId: 'migraine', eventTimingKind: 'point' })),
      ...Array.from({ length: 4 }, (_, index) => record(`middle-${index}`, '2026-08-05', 'event', { eventDefinitionId: 'migraine', eventTimingKind: 'point' })),
      ...Array.from({ length: 8 }, (_, index) => record(`high-${index}`, '2026-08-06', 'event', { eventDefinitionId: 'migraine', eventTimingKind: 'point' })),
    ]
    const projection = projectEventCalendar({ ...base, logRecords: [...base.logRecords, ...additions] }, 'migraine', '2026-08-11', true)
    expect(projection.get('2026-08-04')?.level).toBe(0.25)
    expect(projection.get('2026-08-05')?.level).toBeCloseTo(0.5714, 4)
    expect(projection.get('2026-08-06')).toMatchObject({ display: '8 entries', level: 1 })
  })

  it('handles equal, empty, and single-occurrence Event heatmap ranges sensibly', () => {
    const data = fixture()
    expect([...projectEventCalendar(data, 'travel', '2026-08-11', true).values()].map((value) => value.level)).toEqual([0.55, 0.55, 0.55])
    expect(projectEventCalendar(data, 'missing', '2026-08-11', true).size).toBe(0)
    const one = { ...data, logRecords: [record('only', '2026-08-07', 'event', { eventDefinitionId: 'migraine', eventTimingKind: 'point' })] }
    expect(projectEventCalendar(one, 'migraine', '2026-08-11', true).get('2026-08-07')?.level).toBe(0.55)
    expect(observedRangeLevel(0, [0, 1])).toBe(0.25)
    expect(observedRangeLevel(1, [0, 1])).toBe(1)
  })

  it('uses observed numeric Trackable values only when heatmap mode is enabled', () => {
    const base = fixture()
    const earlierRoutine = record('routine-2', '2026-08-09', 'routine', { routineId: 'nightly', status: 'completed' })
    const highMood: Observation = { id: 'obs-mood-high', logRecordId: earlierRoutine.id, trackableId: 'mood', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'scale', value: 5 } }, ...sync }
    const data = { ...base, logRecords: [...base.logRecords, earlierRoutine], observations: [...base.observations, highMood] }
    expect(projectMetricCalendar(data, 'mood').get('2026-08-10')?.level).toBe(1)
    expect(projectMetricCalendar(data, 'mood', true).get('2026-08-10')?.level).toBe(0.25)
    expect(projectMetricCalendar(data, 'mood', true).get('2026-08-09')?.level).toBe(1)
  })
})

describe('History soft deletion', () => {
  it('tombstones and restores the same record identity with revisions', async () => {
    const repository = new InMemoryDataRepository(); const original = fixture().logRecords[0]
    await repository.save('logRecords', original)
    const engine = new HistoryEngine(repository, () => new Date('2026-08-11T12:00:00.000Z'))
    const deleted = await engine.softDelete(original.id)
    expect(deleted).toMatchObject({ id: original.id, revision: 2, deletedAt: '2026-08-11T12:00:00.000Z' })
    const restored = await engine.restore(original.id)
    expect(restored).toMatchObject({ id: original.id, revision: 3, deletedAt: null })
  })
})
