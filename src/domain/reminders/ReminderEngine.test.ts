import { describe, expect, it } from 'vitest'
import { InMemoryDataRepository } from '../../data/local/InMemoryDataRepository.ts'
import { InMemoryReminderFiringState, ReminderEngine, resolveTrackableReminderTarget } from './ReminderEngine.ts'

const stamp = '2026-08-13T00:00:00.000Z'
const base = { createdAt: stamp, updatedAt: stamp, deletedAt: null, revision: 1 }
const mondayAtNine = new Date(2026, 7, 10, 21, 0)

async function setup() {
  const repository = new InMemoryDataRepository()
  const firing = new InMemoryReminderFiringState()
  await repository.save('settings', { ...base, id: 'settings', schemaVersion: 2, themeId: 'fantasy', reducedMotion: false, locale: 'en-US', dateFormat: 'local', timeFormat: '12-hour', firstDayOfWeek: 0, units: {}, dailyCheckInReminder: { enabled: true, time: '21:00' } })
  await repository.save('trackables', { ...base, id: 'pilates', categoryId: 'activity', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'behavior', recordSemantics: 'occurrence', quickLogEnabled: true, reminder: { enabled: true, time: '21:00', weekdays: [1], skipIfAlreadyLoggedToday: true } })
  await repository.save('trackableVersions', { ...base, id: 'pilates-v1', trackableId: 'pilates', version: 1, name: 'Pilates', inputType: 'boolean', valueDirection: 'neutral', configuration: {}, retiredAt: null })
  await repository.save('trackables', { ...base, id: 'medication', categoryId: 'health', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'treatment', recordSemantics: 'daily_value', quickLogEnabled: false, reminder: { enabled: true, time: '21:00', weekdays: [1], skipIfAlreadyLoggedToday: true } })
  await repository.save('trackableVersions', { ...base, id: 'medication-v1', trackableId: 'medication', version: 1, name: 'Medication', inputType: 'boolean', valueDirection: 'neutral', configuration: {}, retiredAt: null })
  await repository.save('trackables', { ...base, id: 'mood', categoryId: 'health', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'other', recordSemantics: 'daily_value', quickLogEnabled: false, reminder: { enabled: true, time: '21:00', weekdays: [1], skipIfAlreadyLoggedToday: true } })
  await repository.save('trackableVersions', { ...base, id: 'mood-v1', trackableId: 'mood', version: 1, name: 'Mood', inputType: 'scale', valueDirection: 'neutral', configuration: {}, retiredAt: null })
  return { repository, engine: new ReminderEngine(repository, firing), firing }
}

describe('ReminderEngine', () => {
  it('evaluates Daily Check-In timing, completion, drafts, and idempotency', async () => {
    const { repository, engine } = await setup()
    expect(await engine.due(new Date(2026, 7, 10, 20, 59))).toEqual([])
    expect((await engine.due(mondayAtNine)).map((item) => item.id)).toContain('daily-check-in')
    await repository.save('logRecords', { ...base, id: 'draft', recordKind: 'routine', routineId: 'routine', localDate: '2026-08-10', startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'draft', source: 'app' })
    expect((await engine.due(mondayAtNine)).map((item) => item.id)).toContain('daily-check-in')
    await repository.save('logRecords', { ...(await repository.getById('logRecords', 'draft'))!, status: 'completed' })
    expect((await engine.due(mondayAtNine)).map((item) => item.id)).not.toContain('daily-check-in')
    await repository.save('logRecords', { ...(await repository.getById('logRecords', 'draft'))!, deletedAt: stamp })
    const due = (await engine.due(mondayAtNine)).find((item) => item.id === 'daily-check-in')!
    await engine.markHandled(due)
    expect((await engine.due(mondayAtNine)).map((item) => item.id)).not.toContain('daily-check-in')
  })

  it('suppresses occurrences only when safely logged today and honors skip choice', async () => {
    const { repository, engine } = await setup()
    expect((await engine.due(mondayAtNine)).map((item) => item.id)).toContain('pilates')
    await repository.save('logRecords', { ...base, id: 'pilates-today', recordKind: 'quick_log', trackableId: 'pilates', eventTimingKind: 'point', localDate: '2026-08-10', startTimePrecision: 'day', startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed', source: 'app' })
    expect((await engine.due(mondayAtNine)).map((item) => item.id)).not.toContain('pilates')
    await repository.save('trackables', { ...(await repository.getById('trackables', 'pilates'))!, reminder: { enabled: true, time: '21:00', weekdays: [1], skipIfAlreadyLoggedToday: false } })
    expect((await engine.due(mondayAtNine)).map((item) => item.id)).toContain('pilates')
  })

  it('treats Yes as satisfied, No and missing as due, and never guesses scale completion', async () => {
    const { repository, engine } = await setup()
    const record = { ...base, id: 'routine-today', recordKind: 'routine' as const, routineId: 'routine', localDate: '2026-08-10', startTimePrecision: 'day' as const, startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'draft' as const, source: 'app' as const }
    await repository.save('logRecords', record)
    await repository.save('observations', { ...base, id: 'no', logRecordId: record.id, trackableId: 'medication', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'boolean', value: false } } })
    expect((await engine.due(mondayAtNine)).map((item) => item.id)).toContain('medication')
    await repository.save('observations', { ...(await repository.getById('observations', 'no'))!, answer: { state: 'answered', value: { kind: 'boolean', value: true } } })
    expect((await engine.due(mondayAtNine)).map((item) => item.id)).not.toContain('medication')
    await repository.save('observations', { ...base, id: 'scale', logRecordId: record.id, trackableId: 'mood', trackableVersion: 1, answer: { state: 'answered', value: { kind: 'scale', value: 5 } } })
    expect((await engine.due(mondayAtNine)).map((item) => item.id)).toContain('mood')
  })

  it('honors weekdays, archives, and resolves target routes', async () => {
    const { repository, engine } = await setup()
    expect((await engine.due(new Date(2026, 7, 11, 21, 0))).map((item) => item.id)).not.toContain('pilates')
    await repository.save('trackables', { ...(await repository.getById('trackables', 'pilates'))!, active: false, archivedAt: stamp })
    expect((await engine.due(mondayAtNine)).map((item) => item.id)).not.toContain('pilates')
    expect(resolveTrackableReminderTarget({ ...(await repository.getById('trackables', 'medication'))!, quickLogEnabled: false }, true)).toEqual({ kind: 'daily-check-in', path: '/check-in' })
    expect(resolveTrackableReminderTarget({ ...(await repository.getById('trackables', 'medication'))!, quickLogEnabled: false }, false)).toEqual({ kind: 'trackable', path: '/trackables/edit/medication' })
  })
})
