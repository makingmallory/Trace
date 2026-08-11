import { describe, expect, it } from 'vitest'
import { InMemoryDataRepository } from '../../data/local/InMemoryDataRepository.ts'
import type { Category, InputType, Trackable, TrackableOption, TrackableVersion } from '../models/index.ts'
import { CheckInEngine } from './CheckInEngine.ts'

const timestamp = '2026-08-10T21:00:00.000Z'

async function setup() {
  let id = 0
  let now = new Date(timestamp)
  const repository = new InMemoryDataRepository()
  const engine = new CheckInEngine(repository, () => now, () => `id-${++id}`)
  const category: Category = { id: 'category', name: 'Custom', sortOrder: 0, active: true, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
  await repository.save('categories', category)

  async function addTrackable(trackableId: string, name: string, inputType: InputType, options: readonly string[] = []) {
    const trackable: Trackable = { id: trackableId, categoryId: category.id, active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: 'other', createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
    const version: TrackableVersion = { id: `${trackableId}:v1`, trackableId, version: 1, name, inputType, ...(inputType === 'scale' ? { scaleMin: 0, scaleMax: 5, scaleStep: 1 } : {}), valueDirection: 'neutral', configuration: {}, retiredAt: null, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }
    const savedOptions: TrackableOption[] = options.map((label, sortOrder) => ({ id: `${trackableId}:option-${sortOrder}:v1`, optionId: `${trackableId}:option-${sortOrder}`, trackableId, trackableVersion: 1, storedValue: label.toLowerCase(), label, sortOrder, active: true, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, revision: 1 }))
    await repository.save('trackables', trackable); await repository.save('trackableVersions', version); await repository.saveMany('trackableOptions', savedOptions)
  }

  await addTrackable('score', 'Score', 'scale')
  await addTrackable('symptom', 'Symptom present', 'boolean')
  await addTrackable('locations', 'Locations', 'multi_select', ['Left', 'Right'])
  await addTrackable('choice', 'Choice source', 'single_choice', ['First', 'Second', 'Third'])
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
    expect(configuration.questions.map((question) => question.trackable.id)).toEqual(['symptom', 'score'])
    expect(configuration.questions[0].item.completionBehavior).toBe('expected')
    await engine.removeTrackable(symptom.id)
    configuration = await engine.getConfiguration()
    expect(configuration.questions.map((question) => question.trackable.id)).toEqual(['score'])
    expect((await repository.getById('trackables', 'symptom'))?.active).toBe(true)
  })
})

describe('CheckInEngine daily records', () => {
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
    expect(again.record.timePrecision).toBe('day')
    expect(await repository.getAll('logRecords')).toHaveLength(1)
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
