import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryDataRepository } from '../../data/local/InMemoryDataRepository.ts'
import { IndexedDbDataRepository } from '../../data/local/IndexedDbDataRepository.ts'
import type { DataRepository } from '../../data/repository/DataRepository.ts'
import { TrackableEngine, type TrackableDraft } from '../trackables/TrackableEngine.ts'
import { EventEngine } from './EventEngine.ts'

const fixedNow = () => new Date('2026-08-11T15:30:00.000Z')
function ids(prefix: string): () => string { let value = 0; return () => `${prefix}-${++value}` }

async function setup(repository: DataRepository) {
  const trackables = new TrackableEngine(repository, fixedNow, ids('trackable'))
  await trackables.initialize()
  const events = new EventEngine(repository, fixedNow, ids('event'))
  await events.initialize()
  return { trackables, events }
}

function draft(name: string, inputType: TrackableDraft['inputType'] = 'number'): TrackableDraft {
  return { name, categoryId: 'category.custom-other', inputType, dataRole: 'measurement', valueDirection: 'neutral',
    icon: { type: 'library', value: 'sparkle' }, ...(inputType === 'scale' ? { scaleMin: 0, scaleMax: 5, scaleStep: 1 } : {}) }
}

describe('EventEngine definitions', () => {
  it('seeds the configured starter library', async () => {
    const { events } = await setup(new InMemoryDataRepository())
    const names = (await events.getLibrary()).active.map((item) => item.definition.name)
    expect(names).toEqual(expect.arrayContaining(['Headache', 'Migraine', 'Medication Taken', 'Iron Infusion', 'Procedures']))
  })

  it('creates, edits, orders fields, archives, and reactivates a definition', async () => {
    const repository = new InMemoryDataRepository(); const { trackables, events } = await setup(repository)
    const first = await trackables.createTrackable(draft('Intensity', 'scale'))
    const second = await trackables.createTrackable(draft('Notes', 'text'))
    const created = await events.createDefinition({ name: 'Custom event', categoryId: 'category.custom-other', timingMode: 'either', dataRole: 'other', icon: { type: 'library', value: 'sparkle' }, trackableIds: [first.trackable.id, second.trackable.id] })
    expect(created.fields.map((item) => item.version.name)).toEqual(['Intensity', 'Notes'])

    const updated = await events.updateDefinition(created.definition.id, { name: 'Renamed event', categoryId: 'category.custom-other', timingMode: 'duration', dataRole: 'behavior', icon: { type: 'library', value: 'clock' }, trackableIds: [second.trackable.id, first.trackable.id] })
    expect(updated.definition).toMatchObject({ name: 'Renamed event', timingMode: 'duration', revision: 2 })
    expect(updated.fields.map((item) => [item.version.name, item.field.sortOrder])).toEqual([['Notes', 0], ['Intensity', 1]])

    await events.setDefinitionActive(created.definition.id, false)
    expect((await events.getLibrary()).archived.some((item) => item.definition.id === created.definition.id)).toBe(true)
    await events.setDefinitionActive(created.definition.id, true)
    expect((await events.getLibrary()).active.some((item) => item.definition.id === created.definition.id)).toBe(true)
  })
})

describe('EventEngine logging', () => {
  it('logs independent repeated point events', async () => {
    const repository = new InMemoryDataRepository(); const { events } = await setup(repository)
    const timing = { occurrence: 'point' as const, start: { localDate: '2026-08-11', precision: 'exact' as const, localTime: '10:14' }, timezone: 'America/Chicago' }
    const first = await events.logEvent({ eventDefinitionId: 'preset.event.medication-taken', timing, answers: [] })
    const second = await events.logEvent({ eventDefinitionId: 'preset.event.medication-taken', timing, answers: [] })
    expect(first.record.id).not.toBe(second.record.id)
    expect(first.record.startTime).not.toBeNull()
    expect((await repository.getAll('logRecords')).filter((item) => item.eventDefinitionId === 'preset.event.medication-taken')).toHaveLength(2)
  })

  it.each([
    ['exact', { localTime: '10:14' }, true],
    ['timeOfDay', { timeOfDay: 'late_afternoon' }, false],
    ['day', {}, false],
    ['unknown', {}, false],
  ] as const)('round-trips a point event with %s precision', async (precision, detail, hasTimestamp) => {
    const { events } = await setup(new InMemoryDataRepository())
    const logged = await events.logEvent({ eventDefinitionId: 'preset.event.headache', timing: { occurrence: 'point', start: { localDate: '2026-07-01', precision, ...detail }, timezone: 'America/Chicago' }, source: 'manual_history', answers: [] })
    expect(logged.record.startTimePrecision).toBe(precision)
    expect(Boolean(logged.record.startTime)).toBe(hasTimestamp)
    expect(logged.record.startTimeOfDay).toBe(precision === 'timeOfDay' ? 'late_afternoon' : null)
  })

  it.each(['overnight', 'early_morning', 'morning', 'early_afternoon', 'late_afternoon', 'evening', 'night'] as const)('round-trips the %s bucket without a synthetic timestamp', async (timeOfDay) => {
    const { events } = await setup(new InMemoryDataRepository())
    const logged = await events.logEvent({ eventDefinitionId: 'preset.event.headache', timing: { occurrence: 'point', start: { localDate: '2026-08-10', precision: 'timeOfDay', timeOfDay }, timezone: 'America/Chicago' }, answers: [] })
    expect(logged.record).toMatchObject({ startTimePrecision: 'timeOfDay', startTimeOfDay: timeOfDay, startTime: null, timezone: null })
  })

  it('supports exact-to-exact and mixed-precision durations', async () => {
    const { events } = await setup(new InMemoryDataRepository())
    const exact = await events.logEvent({ eventDefinitionId: 'preset.event.iron-infusion', timing: { occurrence: 'duration', start: { localDate: '2026-08-11', precision: 'exact', localTime: '09:00' }, end: { localDate: '2026-08-11', precision: 'exact', localTime: '11:30' }, timezone: 'America/Chicago' }, answers: [] })
    const mixed = await events.logEvent({ eventDefinitionId: 'preset.event.migraine', timing: { occurrence: 'duration', start: { localDate: '2026-08-10', precision: 'timeOfDay', timeOfDay: 'late_afternoon' }, end: { localDate: '2026-08-10', precision: 'exact', localTime: '21:17' }, timezone: 'America/Chicago' }, answers: [] })
    expect(exact.record).toMatchObject({ startTimePrecision: 'exact', endTimePrecision: 'exact', ongoing: false })
    expect(exact.record.startTime).not.toBeNull(); expect(exact.record.endTime).not.toBeNull()
    expect(mixed.record).toMatchObject({ startTimePrecision: 'timeOfDay', startTimeOfDay: 'late_afternoon', startTime: null, endTimePrecision: 'exact', endTimeOfDay: null })
    expect(mixed.record.endTime).not.toBeNull()
  })

  it('supports date-only and time-of-day duration endpoints independently', async () => {
    const { events } = await setup(new InMemoryDataRepository())
    const dateOnly = await events.logEvent({ eventDefinitionId: 'preset.event.travel', timing: { occurrence: 'duration', start: { localDate: '2026-08-01', precision: 'day' }, end: { localDate: '2026-08-03', precision: 'day' }, timezone: null }, answers: [] })
    const mixed = await events.logEvent({ eventDefinitionId: 'preset.event.migraine', timing: { occurrence: 'duration', start: { localDate: '2026-08-10', precision: 'timeOfDay', timeOfDay: 'morning' }, end: { localDate: '2026-08-10', precision: 'exact', localTime: '21:17' }, timezone: 'America/Chicago' }, answers: [] })
    expect(dateOnly.record).toMatchObject({ localDate: '2026-08-01', startTimePrecision: 'day', startTime: null, endLocalDate: '2026-08-03', endTimePrecision: 'day', endTime: null })
    expect(mixed.record).toMatchObject({ startTimePrecision: 'timeOfDay', startTimeOfDay: 'morning', endTimePrecision: 'exact' })
  })

  it('preserves an ongoing duration with no invented end', async () => {
    const { events } = await setup(new InMemoryDataRepository())
    const ongoing = await events.logEvent({ eventDefinitionId: 'preset.event.iron-infusion', timing: { occurrence: 'duration', start: { localDate: '2026-08-09', precision: 'timeOfDay', timeOfDay: 'morning' }, ongoing: true, timezone: null }, answers: [] })
    expect(ongoing.record).toMatchObject({ eventTimingKind: 'duration', ongoing: true, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null })
  })

  it('persists multi-select identity and distinguishes zero from unanswered', async () => {
    const repository = new InMemoryDataRepository(); const { trackables, events } = await setup(repository)
    const locations = await trackables.createTrackable({ ...draft('Locations', 'multi_select'), options: [{ label: 'Left' }, { label: 'Right' }] })
    const severity = await trackables.createTrackable(draft('Severity', 'scale'))
    const notes = await trackables.createTrackable(draft('Notes', 'text'))
    const definition = await events.createDefinition({ name: 'Detailed event', categoryId: 'category.custom-other', timingMode: 'point', dataRole: 'symptom', trackableIds: [locations.trackable.id, severity.trackable.id, notes.trackable.id] })
    const optionId = locations.options[1].optionId
    const logged = await events.logEvent({ eventDefinitionId: definition.definition.id, timing: { occurrence: 'point', start: { localDate: '2026-08-11', precision: 'day' }, timezone: null }, answers: [
      { trackableId: locations.trackable.id, answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: [optionId] },
      { trackableId: severity.trackable.id, answer: { state: 'answered', value: { kind: 'scale', value: 0 } } },
    ] })
    expect(logged.selections.map((item) => item.optionId)).toEqual([optionId])
    expect(logged.observations.find((item) => item.trackableId === severity.trackable.id)?.answer).toEqual({ state: 'answered', value: { kind: 'scale', value: 0 } })
    expect(logged.observations.find((item) => item.trackableId === notes.trackable.id)?.answer).toEqual({ state: 'unanswered' })
  })

  it('edits and moves a historical event without changing identity or creating a duplicate', async () => {
    const repository = new InMemoryDataRepository(); const { events } = await setup(repository)
    const logged = await events.logEvent({ eventDefinitionId: 'preset.event.travel', timing: { occurrence: 'duration', start: { localDate: '2026-08-01', precision: 'day' }, end: { localDate: '2026-08-03', precision: 'day' }, timezone: null }, answers: [] })
    const updated = await events.updateEvent(logged.record.id, { eventDefinitionId: 'preset.event.travel', timing: { occurrence: 'duration', start: { localDate: '2026-07-31', precision: 'timeOfDay', timeOfDay: 'evening' }, end: { localDate: '2026-08-02', precision: 'exact', localTime: '09:17' }, timezone: 'America/Chicago' }, answers: [] })
    expect(updated.record).toMatchObject({ id: logged.record.id, localDate: '2026-07-31', startTimePrecision: 'timeOfDay', startTimeOfDay: 'evening', endLocalDate: '2026-08-02', endTimePrecision: 'exact', revision: 2 })
    expect((await repository.getAll('logRecords')).filter((item) => item.recordKind === 'event')).toHaveLength(1)
  })
})

describe('event IndexedDB persistence', () => {
  const names: string[] = []
  afterEach(async () => { for (const name of names.splice(0)) await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(name); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) }) })

  it('round-trips event definitions, fields, records, observations, and selections', async () => {
    const name = `trace-event-${crypto.randomUUID()}`; names.push(name)
    const firstRepository = new IndexedDbDataRepository(name)
    const { trackables, events } = await setup(firstRepository)
    const choice = await trackables.createTrackable({ ...draft('Kind', 'multi_select'), options: [{ label: 'One' }, { label: 'Two' }] })
    const definition = await events.createDefinition({ name: 'Round trip', categoryId: 'category.custom-other', timingMode: 'point', dataRole: 'other', trackableIds: [choice.trackable.id] })
    const logged = await events.logEvent({ eventDefinitionId: definition.definition.id, timing: { occurrence: 'point', start: { localDate: '2026-08-11', precision: 'day' }, timezone: null }, answers: [{ trackableId: choice.trackable.id, answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: [choice.options[0].optionId] }] })
    firstRepository.close()

    const reopened = new IndexedDbDataRepository(name)
    expect(await reopened.getById('eventDefinitions', definition.definition.id)).toMatchObject({ name: 'Round trip' })
    expect((await reopened.getAll('eventFields')).some((item) => item.eventDefinitionId === definition.definition.id)).toBe(true)
    expect(await reopened.getById('logRecords', logged.record.id)).toMatchObject({ localDate: '2026-08-11', startTime: null })
    expect((await reopened.getAll('observations')).some((item) => item.logRecordId === logged.record.id)).toBe(true)
    expect((await reopened.getAll('observationSelections')).some((item) => item.optionId === choice.options[0].optionId)).toBe(true)
    reopened.close()
  })
})
