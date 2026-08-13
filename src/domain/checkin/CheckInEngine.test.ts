import { describe, expect, it } from 'vitest'
import { InMemoryDataRepository } from '../../data/local/InMemoryDataRepository.ts'
import type { Category, InputType, TrackableOption, TrackableRecordSemantics, TrackableVersion } from '../models/index.ts'
import { CheckInEngine, OccurrenceConflictError } from './CheckInEngine.ts'

const timestamp = '2026-08-10T21:00:00.000Z'

async function setup() {
  let id = 0
  let now = new Date(timestamp)
  const repository = new InMemoryDataRepository()
  const engine = new CheckInEngine(repository, () => now, () => `id-${++id}`)
  const category: Category = { id: 'category', name: 'Custom', sortOrder: 0, active: true, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
  await repository.save('categories', category)

  async function addTrackable(trackableId: string, name: string, inputType: InputType, options: readonly string[] = [], recordSemantics: TrackableRecordSemantics = 'daily_value', quickLogEnabled = false) {
    const trackable = { id: trackableId, categoryId: category.id, active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'other' as const, recordSemantics, quickLogEnabled, ...(quickLogEnabled ? { quickLogTimingMode: 'either' as const } : {}), createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
    const version: TrackableVersion = { id: `${trackableId}:v1`, trackableId, version: 1, name, inputType, ...(inputType === 'scale' ? { scaleMin: 0, scaleMax: 5, scaleStep: 1 } : {}), valueDirection: 'neutral', configuration: {}, retiredAt: null, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
    const savedOptions: TrackableOption[] = options.map((label, sortOrder) => ({ id: `${trackableId}:option-${sortOrder}:v1`, optionId: `${trackableId}:option-${sortOrder}`, trackableId, trackableVersion: 1, storedValue: label.toLowerCase(), label, sortOrder, active: true, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }))
    await repository.save('trackables', trackable); await repository.save('trackableVersions', version); await repository.saveMany('trackableOptions', savedOptions)
  }

  await addTrackable('score', 'Score', 'scale')
  await addTrackable('symptom', 'Symptom present', 'boolean')
  await addTrackable('locations', 'Locations', 'multi_select', ['Left', 'Right'])
  await addTrackable('choice', 'Choice source', 'single_choice', ['First', 'Second', 'Third'])
  await addTrackable('acne', 'Acne', 'boolean')
  await addTrackable('pilates', 'Pilates', 'boolean', [], 'occurrence', true)
  await addTrackable('migraine', 'Migraine', 'boolean', [], 'occurrence', true)
  return { engine, repository, setNow(value: string) { now = new Date(value) } }
}

describe('CheckInEngine routine configuration', () => {
  it('creates a routine, adds only selected Trackables, reorders, configures, and removes without archiving', async () => {
    const { engine, repository } = await setup()
    expect((await engine.getConfiguration()).routine).toBeNull()
    await engine.addTrackable('score')
    const symptom = await engine.addTrackable('symptom')
    await engine.moveItem(symptom.id, -1)
    await engine.updateItem(symptom.id, { completionBehavior: 'expected', trendTrackingMode: 'better_same_worse', conditionalRule: { sourceTrackableId: 'score', operator: 'greaterThan', expectedValue: 0 } })
    let configuration = await engine.getConfiguration()
    expect(configuration.routine?.name).toBe('Daily Check-In')
    expect(configuration.questions.map((question) => question.trackable.id)).toEqual(['symptom', 'score'])
    expect(configuration.questions[0].item.completionBehavior).toBe('expected')
    await engine.removeTrackable(symptom.id)
    configuration = await engine.getConfiguration()
    expect(configuration.questions.map((question) => question.trackable.id)).toEqual(['score'])
    expect((await repository.getById('trackables', 'symptom'))?.active).toBe(true)
  })
})

describe('CheckInEngine daily records', () => {
  it('uses the latest options for today, preserves a removed selection, and keeps older dates on their recorded version', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('locations')
    const today = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    await engine.saveAnswer(today.record.id, 'locations', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['locations:option-0'] })
    const historical = await engine.getOrCreateToday('2026-08-09', 'America/Chicago')
    await engine.saveAnswer(historical.record.id, 'locations', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['locations:option-0'] })
    const trackable = (await repository.getById('trackables', 'locations'))!
    await repository.save('trackables', { ...trackable, currentVersion: 2, updatedAt: '2026-08-10T22:00:00.000Z', revision: 2 })
    await repository.save('trackableVersions', { id: 'locations:v2', trackableId: 'locations', version: 2, name: 'Locations', inputType: 'multi_select', valueDirection: 'neutral', configuration: {}, retiredAt: null, createdAt: '2026-08-10T22:00:00.000Z', updatedAt: '2026-08-10T22:00:00.000Z', deletedAt: null, revision: 1 })
    await repository.saveMany('trackableOptions', [
      { id: 'locations:option-1:v2', optionId: 'locations:option-1', trackableId: 'locations', trackableVersion: 2, storedValue: 'right', label: 'Right', sortOrder: 0, active: true, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 },
      { id: 'locations:option-2:v2', optionId: 'locations:option-2', trackableId: 'locations', trackableVersion: 2, storedValue: 'center', label: 'Center', sortOrder: 1, active: true, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 },
    ])
    const reopenedToday = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(reopenedToday.questions[0].version.version).toBe(2)
    expect(reopenedToday.questions[0].options.map((option) => option.label)).toEqual(['Right', 'Center', 'Left (Previously selected)'])
    const reopenedHistorical = await engine.getOrCreateToday('2026-08-09', 'America/Chicago')
    expect(reopenedHistorical.questions[0].version.version).toBe(1)
    expect(reopenedHistorical.questions[0].options.map((option) => option.label)).toEqual(['Left', 'Right'])
  })

  it('keeps multi-choice selection saves unique and idempotent', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('locations')
    const draft = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    const answer = { answer: { state: 'answered' as const, value: { kind: 'choice' as const, value: null } }, selectedOptionIds: ['locations:option-0', 'locations:option-0', 'locations:option-1'] }
    await engine.saveAnswer(draft.record.id, 'locations', answer)
    await engine.saveAnswer(draft.record.id, 'locations', answer)
    const active = (await repository.getAll('observationSelections')).filter((item) => !item.deletedAt)
    expect(active.map((item) => item.optionId).sort()).toEqual(['locations:option-0', 'locations:option-1'])
  })

  it('round-trips a custom Other value without creating an option', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('choice')
    const version = (await repository.getById('trackableVersions', 'choice:v1'))!
    await repository.save('trackableVersions', { ...version, configuration: { allowOther: true } })
    const draft = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    const saved = await engine.saveAnswer(draft.record.id, 'choice', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, customChoiceValue: '  Something new  ' })
    expect(saved.observations.find((item) => item.trackableId === 'choice')?.customChoiceValue).toBe('Something new')
    expect((await repository.getAll('trackableOptions')).filter((item) => item.trackableId === 'choice')).toHaveLength(3)
  })

  it('fully clears Single Choice Other state and reopens without stale custom text', async () => {
    const { engine } = await setup()
    await engine.addTrackable('choice')
    let snapshot = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    snapshot = await engine.saveAnswer(snapshot.record.id, 'choice', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, customChoiceValue: 'Temporary' })
    snapshot = await engine.saveAnswer(snapshot.record.id, 'choice', { answer: { state: 'unanswered' }, selectedOptionIds: [] })
    const observation = snapshot.observations.find((item) => item.trackableId === 'choice')
    expect(observation?.answer.state).toBe('unanswered')
    expect(observation?.customChoiceValue).toBeUndefined()
    expect(snapshot.selections.filter((item) => item.observationId === observation?.id)).toEqual([])
  })

  it('removes only Multi Choice Other while preserving predefined selections', async () => {
    const { engine } = await setup()
    await engine.addTrackable('locations')
    let snapshot = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    snapshot = await engine.saveAnswer(snapshot.record.id, 'locations', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['locations:option-0'], customChoiceValue: 'Elsewhere' })
    snapshot = await engine.saveAnswer(snapshot.record.id, 'locations', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['locations:option-0'] })
    const observation = snapshot.observations.find((item) => item.trackableId === 'locations')
    expect(observation?.customChoiceValue).toBeUndefined()
    expect(snapshot.selections.filter((item) => item.observationId === observation?.id).map((item) => item.optionId)).toEqual(['locations:option-0'])
  })

  it('promotes Other to one stable permanent option without case or whitespace duplicates', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('choice')
    const version = (await repository.getById('trackableVersions', 'choice:v1'))!
    await repository.save('trackableVersions', { ...version, configuration: { allowOther: true } })
    const draft = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    let saved = await engine.saveAnswer(draft.record.id, 'choice', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, customChoiceValue: 'Something New', promoteCustomChoice: true })
    const promotedId = saved.selections[0].optionId
    expect((await repository.getById('trackables', 'choice'))?.currentVersion).toBe(2)
    expect(saved.questions[0].version.version).toBe(2)
    expect(saved.questions[0].options.find((option) => option.optionId === promotedId)).toMatchObject({ label: 'Something New', active: true })
    expect(saved.questions[0].options.some((option) => option.label.includes('Previously selected'))).toBe(false)
    expect(saved.selections.map((item) => item.optionId)).toEqual([promotedId])
    const reopened = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(reopened.questions[0].options.find((option) => option.optionId === promotedId)).toMatchObject({ label: 'Something New', active: true })
    expect(reopened.selections.map((item) => item.optionId)).toEqual([promotedId])
    saved = await engine.saveAnswer(draft.record.id, 'choice', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, customChoiceValue: '  something   new ', promoteCustomChoice: true })
    expect(saved.selections.map((item) => item.optionId)).toEqual([promotedId])
    expect((await repository.getById('trackables', 'choice'))?.currentVersion).toBe(2)
    expect((await repository.getAll('trackableOptions')).filter((option) => option.optionId === promotedId)).toHaveLength(1)
  })

  it('prefills a configured default without persisting it until completion', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('score')
    const version = (await repository.getById('trackableVersions', 'score:v1'))!
    await repository.save('trackableVersions', { ...version, configuration: { defaultAnswer: { answer: { state: 'answered', value: { kind: 'scale', value: 3 } } } } })
    const draft = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(draft.defaultAnswers.score?.answer).toEqual({ state: 'answered', value: { kind: 'scale', value: 3 } })
    expect(await repository.getAll('observations')).toEqual([])
    await engine.complete(draft.record.id)
    expect((await repository.getAll('observations'))[0].answer).toEqual({ state: 'answered', value: { kind: 'scale', value: 3 } })
  })

  it('uses a presentation-only default Yes for initial visibility and persists it only on completion', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('acne')
    const dependent = await engine.addTrackable('symptom')
    await engine.updateItem(dependent.id, { conditionalRule: { sourceTrackableId: 'acne', operator: 'equals', expectedValue: true } })
    const version = (await repository.getById('trackableVersions', 'acne:v1'))!
    await repository.save('trackableVersions', { ...version, configuration: { defaultAnswer: { answer: { state: 'answered', value: { kind: 'boolean', value: true } } } } })

    const opened = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(opened.visibleQuestions.map((question) => question.trackable.id)).toEqual(['acne', 'symptom'])
    expect(opened.effectiveAnswers.get('acne')).toMatchObject({ answer: { state: 'answered', value: { kind: 'boolean', value: true } }, source: 'presentation' })
    expect(await repository.getAll('observations')).toEqual([])

    await engine.complete(opened.record.id)
    expect((await repository.getAll('observations')).find((item) => item.trackableId === 'acne')?.answer).toEqual({ state: 'answered', value: { kind: 'boolean', value: true } })
  })

  it('updates conditional visibility immediately when the user changes away from a default', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('acne')
    const dependent = await engine.addTrackable('symptom')
    await engine.updateItem(dependent.id, { conditionalRule: { sourceTrackableId: 'acne', operator: 'equals', expectedValue: true } })
    const version = (await repository.getById('trackableVersions', 'acne:v1'))!
    await repository.save('trackableVersions', { ...version, configuration: { defaultAnswer: { answer: { state: 'answered', value: { kind: 'boolean', value: true } } } } })
    let snapshot = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(snapshot.visibleQuestions.map((question) => question.trackable.id)).toContain('symptom')
    snapshot = await engine.saveAnswer(snapshot.record.id, 'acne', { answer: { state: 'answered', value: { kind: 'boolean', value: false } } })
    expect(snapshot.visibleQuestions.map((question) => question.trackable.id)).not.toContain('symptom')
  })

  it('uses default Single Choice selections in conditional evaluation without persisting them', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('choice')
    const dependent = await engine.addTrackable('symptom')
    await engine.updateItem(dependent.id, { conditionalRule: { sourceTrackableId: 'choice', operator: 'equals', expectedValue: 'choice:option-1' } })
    const version = (await repository.getById('trackableVersions', 'choice:v1'))!
    await repository.save('trackableVersions', { ...version, configuration: { defaultAnswer: { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['choice:option-1'] } } })
    const snapshot = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(snapshot.visibleQuestions.map((question) => question.trackable.id)).toContain('symptom')
    expect(await repository.getAll('observations')).toEqual([])
    expect(await repository.getAll('observationSelections')).toEqual([])
  })

  it('uses default Multi Choice selections in conditional evaluation without persisting them', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('locations')
    const dependent = await engine.addTrackable('symptom')
    await engine.updateItem(dependent.id, { conditionalRule: { sourceTrackableId: 'locations', operator: 'containsAny', expectedValue: ['locations:option-1'] } })
    const version = (await repository.getById('trackableVersions', 'locations:v1'))!
    await repository.save('trackableVersions', { ...version, configuration: { defaultAnswer: { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['locations:option-0', 'locations:option-1'] } } })
    const snapshot = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(snapshot.visibleQuestions.map((question) => question.trackable.id)).toContain('symptom')
    expect(snapshot.effectiveAnswers.get('locations')?.selectedOptionIds).toEqual(['locations:option-0', 'locations:option-1'])
    expect(await repository.getAll('observations')).toEqual([])
  })

  it('groups structured fields and requires them only when their parent Yes condition is active', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('symptom')
    await repository.save('trackableFields', { id: 'field-score', ownerTrackableId: 'symptom', ownerTrackableVersion: 1, fieldTrackableId: 'score', fieldTrackableVersion: 1, sortOrder: 0, enabled: true, required: true, completionBehavior: 'expected', conditionalRule: { sourceTrackableId: 'symptom', operator: 'equals', expectedValue: true }, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 })
    let snapshot = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(snapshot.questions[0].fields?.map((field) => field.trackable.id)).toEqual(['score'])
    snapshot = await engine.saveAnswer(snapshot.record.id, 'symptom', { answer: { state: 'answered', value: { kind: 'boolean', value: false } } })
    await expect(engine.complete(snapshot.record.id)).resolves.toMatchObject({ completed: true })
  })

  it('blocks completion for a visible required structured field and updates one observation context', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('symptom')
    await repository.save('trackableFields', { id: 'field-score', ownerTrackableId: 'symptom', ownerTrackableVersion: 1, fieldTrackableId: 'score', fieldTrackableVersion: 1, sortOrder: 0, enabled: true, required: true, completionBehavior: 'expected', conditionalRule: { sourceTrackableId: 'symptom', operator: 'equals', expectedValue: true }, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 })
    let snapshot = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    snapshot = await engine.saveAnswer(snapshot.record.id, 'symptom', { answer: { state: 'answered', value: { kind: 'boolean', value: true } } })
    await expect(engine.complete(snapshot.record.id)).rejects.toThrow('Score')
    await engine.saveAnswer(snapshot.record.id, 'score', { answer: { state: 'answered', value: { kind: 'scale', value: 2 } } })
    await engine.saveAnswer(snapshot.record.id, 'score', { answer: { state: 'answered', value: { kind: 'scale', value: 3 } } })
    await expect(engine.complete(snapshot.record.id)).resolves.toMatchObject({ completed: true })
    expect((await repository.getAll('observations')).filter((item) => item.logRecordId === snapshot.record.id && !item.deletedAt)).toHaveLength(2)
  })

  it('stores an occurrence-semantics Trackable as an observation when it is a structured field', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('symptom')
    await repository.save('trackableFields', { id: 'field-pilates', ownerTrackableId: 'symptom', ownerTrackableVersion: 1, fieldTrackableId: 'pilates', fieldTrackableVersion: 1, sortOrder: 0, enabled: true, required: true, completionBehavior: 'expected', createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 })
    let snapshot = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    snapshot = await engine.saveAnswer(snapshot.record.id, 'symptom', { answer: { state: 'answered', value: { kind: 'boolean', value: true } } })
    snapshot = await engine.saveAnswer(snapshot.record.id, 'pilates', { answer: { state: 'answered', value: { kind: 'boolean', value: false } } })
    expect(snapshot.observations.find((item) => item.trackableId === 'pilates')?.answer).toEqual({ state: 'answered', value: { kind: 'boolean', value: false } })
    expect((await repository.getAll('logRecords')).filter((item) => item.trackableId === 'pilates')).toHaveLength(0)
  })
  it('keeps Pilates in its routine position, prefills repeated Quick Logs, avoids duplicates, and lists a Quick-Log-only item once', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('pilates')
    const entry = (id: string, trackableId: string) => ({ id, recordKind: 'quick_log' as const, trackableId, eventTimingKind: 'point' as const, localDate: '2026-08-10', startTimePrecision: 'day' as const, startTime: null, startTimeOfDay: null, endLocalDate: null, endTimePrecision: null, endTime: null, endTimeOfDay: null, ongoing: false, timezone: null, status: 'completed' as const, source: 'app' as const, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 })
    await repository.saveMany('logRecords', [entry('pilates-entry', 'pilates'), entry('migraine-1', 'migraine'), entry('migraine-2', 'migraine')])
    const snapshot = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(snapshot.observations.find((item) => item.trackableId === 'pilates')?.answer).toEqual({ state: 'answered', value: { kind: 'boolean', value: true } })
    expect(snapshot.quickLogSummaries.pilates).toBe(1)
    expect(snapshot.loggedToday).toEqual([expect.objectContaining({ count: 2, version: expect.objectContaining({ name: 'Migraine' }) })])
    expect(snapshot.questions.map((item) => item.trackable.id)).toEqual(['pilates'])
    await engine.complete(snapshot.record.id)
    expect((await repository.getAll('logRecords')).filter((item) => item.trackableId === 'pilates' && !item.deletedAt)).toHaveLength(1)
    expect((await repository.getAll('logRecords')).filter((item) => item.trackableId === 'migraine' && !item.deletedAt)).toHaveLength(2)
    await repository.save('logRecords', entry('pilates-entry-2', 'pilates'))
    const repeated = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(repeated.quickLogSummaries.pilates).toBe(2)
    expect(repeated.observations.find((item) => item.trackableId === 'pilates')?.answer).toEqual({ state: 'answered', value: { kind: 'boolean', value: true } })
    await engine.complete(repeated.record.id)
    expect((await repository.getAll('logRecords')).filter((item) => item.trackableId === 'pilates' && !item.deletedAt)).toHaveLength(2)
  })

  it('defaults an unlogged occurrence to unpersisted No, persists it only on completion, and creates one date-only Yes', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('pilates')
    let snapshot = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(snapshot.observations.find((item) => item.trackableId === 'pilates')?.answer).toEqual({ state: 'answered', value: { kind: 'boolean', value: false } })
    expect(await repository.getAll('trackableDailyAssertions')).toEqual([])
    snapshot = await engine.saveAnswer(snapshot.record.id, 'pilates', { answer: { state: 'answered', value: { kind: 'boolean', value: false } } })
    expect(await repository.getAll('trackableDailyAssertions')).toEqual([])
    await engine.complete(snapshot.record.id)
    expect(await repository.getAll('trackableDailyAssertions')).toEqual([expect.objectContaining({ trackableId: 'pilates', status: 'did_not_occur', deletedAt: null })])
    snapshot = await engine.saveAnswer(snapshot.record.id, 'pilates', { answer: { state: 'answered', value: { kind: 'boolean', value: true } } })
    const occurrence = (await repository.getAll('logRecords')).find((item) => item.trackableId === 'pilates')!
    expect(occurrence).toMatchObject({ startTimePrecision: 'day', startTime: null, source: 'nightly_backfill' })
    expect((await repository.getAll('logRecords')).filter((item) => item.trackableId === 'pilates' && !item.deletedAt)).toHaveLength(1)
    await expect(engine.saveAnswer(snapshot.record.id, 'pilates', { answer: { state: 'answered', value: { kind: 'boolean', value: false } } })).rejects.toBeInstanceOf(OccurrenceConflictError)
    snapshot = await engine.resolveQuickLogNo(snapshot.record.id, 'pilates')
    expect((await repository.getById('logRecords', occurrence.id))?.deletedAt).not.toBeNull()
    expect(await repository.getAll('trackableDailyAssertions')).toEqual([expect.objectContaining({ trackableId: 'pilates', status: 'did_not_occur', deletedAt: null })])
    expect(snapshot.observations.find((item) => item.trackableId === 'pilates')?.answer).toEqual({ state: 'answered', value: { kind: 'boolean', value: false } })
  })

  it('keeps a Daily Value canonical and separate from Quick Log eligibility', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('acne')
    const snapshot = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    await engine.saveAnswer(snapshot.record.id, 'acne', { answer: { state: 'answered', value: { kind: 'boolean', value: true } } })
    await engine.saveAnswer(snapshot.record.id, 'acne', { answer: { state: 'answered', value: { kind: 'boolean', value: false } } })
    expect((await repository.getAll('observations')).filter((item) => item.trackableId === 'acne' && !item.deletedAt)).toHaveLength(1)
    expect((await repository.getAll('logRecords')).filter((item) => item.trackableId === 'acne' && !item.deletedAt)).toHaveLength(0)
  })
  it('autosaves and resumes a zero answer, warns but does not block expected missing, completes, and edits the same record', async () => {
    const { engine } = await setup()
    const score = await engine.addTrackable('score')
    const symptom = await engine.addTrackable('symptom')
    await engine.updateItem(score.id, { completionBehavior: 'expected' })
    await engine.updateItem(symptom.id, { completionBehavior: 'expected' })
    const draft = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    const saved = await engine.saveAnswer(draft.record.id, 'score', { answer: { state: 'answered', value: { kind: 'scale', value: 0 } } })
    expect(saved.observations[0].answer).toEqual({ state: 'answered', value: { kind: 'scale', value: 0 } })
    const resumed = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(resumed.record.id).toBe(draft.record.id)
    expect(resumed.record.status).toBe('draft')
    const warning = await engine.complete(draft.record.id)
    expect(warning.completed).toBe(false)
    expect(warning.expectedUnanswered.map((question) => question.trackable.id)).toEqual(['symptom'])
    const completed = await engine.complete(draft.record.id, true)
    expect(completed.snapshot.record.status).toBe('completed')
    const edited = await engine.saveAnswer(draft.record.id, 'score', { answer: { state: 'answered', value: { kind: 'scale', value: 3 } } })
    expect(edited.record.id).toBe(draft.record.id)
    expect(edited.record.status).toBe('completed')
    expect(edited.observations.find((item) => item.trackableId === 'score')?.answer).toEqual({ state: 'answered', value: { kind: 'scale', value: 3 } })
  })

  it('persists multi-select choices relationally and keeps trend separate from the actual answer', async () => {
    const { engine } = await setup()
    await engine.addTrackable('locations')
    const draft = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    const saved = await engine.saveAnswer(draft.record.id, 'locations', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['locations:option-0', 'locations:option-1'], trendValue: 'Improving' })
    expect(saved.selections.map((item) => item.optionId).sort()).toEqual(['locations:option-0', 'locations:option-1'])
    expect(saved.observations[0].trendValue).toBe('Improving')
    expect(saved.observations[0].answer.value).toEqual({ kind: 'choice', value: null })
    const updated = await engine.saveAnswer(draft.record.id, 'locations', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['locations:option-1'], trendValue: 'Same' })
    expect(updated.selections.map((item) => item.optionId)).toEqual(['locations:option-1'])
  })

  it('uses one routine record per local calendar date and no timestamp for the day-level check-in', async () => {
    const { engine, repository, setNow } = await setup()
    await engine.addTrackable('score')
    const first = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    setNow('2026-08-10T23:59:00.000Z')
    const again = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(again.record.id).toBe(first.record.id)
    expect(again.record.startTime).toBeNull()
    expect(again.record.startTimePrecision).toBe('day')
    expect(await repository.getAll('logRecords')).toHaveLength(1)
  })

  it('coalesces concurrent opens so development remounts cannot duplicate a daily record', async () => {
    const { engine, repository } = await setup()
    await engine.addTrackable('score')
    const [first, second] = await Promise.all([
      engine.getOrCreateToday('2026-08-10', 'America/Chicago'),
      engine.getOrCreateToday('2026-08-10', 'America/Chicago'),
    ])
    expect(second.record.id).toBe(first.record.id)
    expect(await repository.getAll('logRecords')).toHaveLength(1)
  })

  it('edits a historical check-in in place without creating a second daily record', async () => {
    const { engine, repository } = await setup()
    const item = await engine.addTrackable('score')
    const historical = await engine.getOrCreateToday('2026-07-04', 'America/Chicago')
    await engine.saveAnswer(historical.record.id, 'score', { answer: { state: 'answered', value: { kind: 'scale', value: 2 } } })
    await engine.removeTrackable(item.id)
    const reopened = await engine.getOrCreateToday('2026-07-04', 'America/Chicago')
    expect(reopened.visibleQuestions.map((question) => question.trackable.id)).toContain('score')
    const edited = await engine.saveAnswer(reopened.record.id, 'score', { answer: { state: 'answered', value: { kind: 'scale', value: 4 } } })
    expect(edited.record.id).toBe(historical.record.id)
    expect((await repository.getAll('logRecords')).filter((item) => item.localDate === '2026-07-04')).toHaveLength(1)
  })

  it('persists and refreshes single-choice and multi-select any-match visibility exactly', async () => {
    const { engine } = await setup()
    await engine.addTrackable('choice')
    const dependent = await engine.addTrackable('symptom')
    await engine.updateItem(dependent.id, { conditionalRule: { sourceTrackableId: 'choice', operator: 'anyOf', expectedValue: ['choice:option-0', 'choice:option-1'] } })
    let snapshot = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    expect(snapshot.visibleQuestions.map((question) => question.trackable.id)).toEqual(['choice'])

    snapshot = await engine.saveAnswer(snapshot.record.id, 'choice', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['choice:option-0'] })
    expect(snapshot.visibleQuestions.map((question) => question.trackable.id)).toEqual(['choice', 'symptom'])
    snapshot = await engine.saveAnswer(snapshot.record.id, 'choice', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['choice:option-2'] })
    expect(snapshot.visibleQuestions.map((question) => question.trackable.id)).toEqual(['choice'])
    snapshot = await engine.saveAnswer(snapshot.record.id, 'choice', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['choice:option-1'] })
    expect(snapshot.visibleQuestions.map((question) => question.trackable.id)).toEqual(['choice', 'symptom'])

    await engine.removeTrackable((await engine.getConfiguration()).questions[0].item.id)
    await engine.addTrackable('locations')
    await engine.moveItem(dependent.id, 1)
    await engine.updateItem(dependent.id, { conditionalRule: { sourceTrackableId: 'locations', operator: 'containsAny', expectedValue: ['locations:option-0', 'locations:option-1'] } })
    snapshot = await engine.getOrCreateToday('2026-08-10', 'America/Chicago')
    snapshot = await engine.saveAnswer(snapshot.record.id, 'locations', { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['locations:option-0'] })
    expect(snapshot.visibleQuestions.map((question) => question.trackable.id)).toContain('symptom')
    snapshot = await engine.saveAnswer(snapshot.record.id, 'locations', { answer: { state: 'unanswered' }, selectedOptionIds: [] })
    expect(snapshot.visibleQuestions.map((question) => question.trackable.id)).not.toContain('symptom')
  })
})
