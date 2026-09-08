import { describe, expect, it } from 'vitest'
import { InMemoryDataRepository } from '../../data/local/InMemoryDataRepository.ts'
import { trackablePresets } from '../../presets/trackablePresets.ts'
import { normalizeTrackableName, TrackableEngine, TrackableNameConflictError, TrackableValidationError, type TrackableDraft } from './TrackableEngine.ts'

function setup() {
  let id = 0
  const repository = new InMemoryDataRepository()
  const engine = new TrackableEngine(repository, () => new Date('2026-08-10T12:00:00.000Z'), () => `id-${++id}`)
  return { engine, repository }
}

const customDraft: TrackableDraft = {
  name: 'Custom score', categoryId: 'category.custom-other', inputType: 'scale', dataRole: 'other', valueDirection: 'neutral',
  scaleMin: 0, scaleMax: 10, scaleStep: 1, tags: [' Personal ', 'personal'], icon: { type: 'emoji', value: '✨' },
}

describe('TrackableEngine', () => {
  it('seeds every category and creates a user-owned Trackable from a stable preset', async () => {
    const { engine } = setup()
    const library = await engine.getLibrary()
    expect(library.categories).toHaveLength(10)
    expect(library.categories.find((category) => category.id === 'category.skin')?.icon).toEqual({ type: 'emoji', value: '✨' })
    expect(trackablePresets).toHaveLength(90)

    const created = await engine.createFromPreset('preset.cycle-reproductive.discharge-color')
    expect(created.trackable.id).not.toBe('preset.cycle-reproductive.discharge-color')
    expect(created.options.map((option) => option.label)).toContain('Red')
  })

  it('uses the saved category icon for new presets without changing existing custom icons', async () => {
    const { engine } = setup()
    await engine.initialize()
    await engine.updateCategory('category.skin', { name: 'Skin', icon: { type: 'emoji', value: '🌿' }, active: true })
    const created = await engine.createFromPreset('preset.skin.acne-severity')
    expect(created.trackable.icon).toEqual({ type: 'emoji', value: '🌿' })

    const custom = await engine.createTrackable({ ...customDraft, categoryId: 'category.skin', icon: { type: 'emoji', value: '🪷' } })
    await engine.updateCategory('category.skin', { name: 'Skin', icon: { type: 'emoji', value: '✨' }, active: true })
    expect((await engine.getDetails(custom.trackable.id)).trackable.icon).toEqual({ type: 'emoji', value: '🪷' })
  })

  it('creates and validates a custom Trackable without losing zero scale bounds', async () => {
    const { engine } = setup()
    const created = await engine.createTrackable(customDraft)
    expect(created.version.scaleMin).toBe(0)
    expect(created.trackable.tags).toEqual(['personal'])

    await expect(engine.createTrackable({ ...customDraft, scaleMax: 0 })).rejects.toBeInstanceOf(TrackableValidationError)
  })

  it('uses one canonical Trackable-name key for exact, case, whitespace, and cross-category collisions', async () => {
    const { engine } = setup()
    await engine.createTrackable({ ...customDraft, name: 'Blood Pressure' })
    expect(normalizeTrackableName('  BLOOD   pressure  ')).toBe('blood pressure')
    for (const name of ['Blood Pressure', 'blood pressure', '  Blood Pressure  ', 'Blood   Pressure']) {
      await expect(engine.createTrackable({ ...customDraft, name, categoryId: 'category.pain' })).rejects.toThrow('A Trackable named Blood Pressure already exists in Custom / Other.')
    }
  })

  it('serializes rapid duplicate creates so only one can persist', async () => {
    const { engine } = setup()
    const results = await Promise.allSettled([
      engine.createTrackable({ ...customDraft, name: 'Rapid add' }),
      engine.createTrackable({ ...customDraft, name: '  RAPID   ADD ' }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((await engine.getLibrary()).active).toHaveLength(1)
  })

  it('allows a Trackable to keep its own name but blocks renaming it to another Trackable name', async () => {
    const { engine } = setup()
    const migraine = await engine.createTrackable({ ...customDraft, name: 'Migraine' })
    const headache = await engine.createTrackable({ ...customDraft, name: 'Headache' })
    await expect(engine.updateTrackable(migraine.trackable.id, { ...customDraft, name: '  migraine  ' })).resolves.toMatchObject({ trackable: { id: migraine.trackable.id } })
    await expect(engine.updateTrackable(migraine.trackable.id, { ...customDraft, name: 'HEADACHE' })).rejects.toThrow('A Trackable named Headache already exists')
    expect((await engine.getDetails(headache.trackable.id)).version.name).toBe('Headache')
  })

  it('keeps an archived name collision intact until its existing permanent identity is restored', async () => {
    const { engine, repository } = setup()
    const created = await engine.createTrackable({ ...customDraft, name: 'Migraine' })
    await engine.setTrackableActive(created.trackable.id, false)
    await expect(engine.createTrackable({ ...customDraft, name: ' migraine ' })).rejects.toMatchObject({
      name: 'TrackableNameConflictError', existingTrackableId: created.trackable.id, archived: true,
    } satisfies Partial<TrackableNameConflictError>)
    await engine.setTrackableActive(created.trackable.id, true)
    expect((await repository.getAll('trackables')).map((trackable) => trackable.id)).toEqual([created.trackable.id])
  })

  it('keeps stable option IDs for unchanged meanings when a new version is created', async () => {
    const { engine, repository } = setup()
    const created = await engine.createTrackable({ ...customDraft, inputType: 'single_choice', scaleMin: undefined, scaleMax: undefined, scaleStep: undefined, options: [{ label: 'Low' }, { label: 'High' }] })
    const firstIds = created.options.map((option) => option.optionId)
    const updated = await engine.updateTrackable(created.trackable.id, {
      ...customDraft, name: 'Custom level', inputType: 'single_choice', scaleMin: undefined, scaleMax: undefined, scaleStep: undefined,
      options: created.options.map((option) => ({ optionId: option.optionId, label: option.label })),
    })
    expect(updated.trackable.currentVersion).toBe(2)
    expect(updated.options.map((option) => option.optionId)).toEqual(firstIds)
    expect(new Set((await repository.getAll('trackableOptions')).map((option) => option.id)).size).toBe(4)
  })

  it('stores type-appropriate structured defaults and rejects incompatible values', async () => {
    const cases: readonly TrackableDraft[] = [
      { ...customDraft, inputType: 'boolean', scaleMin: undefined, scaleMax: undefined, scaleStep: undefined, defaultAnswer: { answer: { state: 'answered', value: { kind: 'boolean', value: false } } } },
      { ...customDraft, defaultAnswer: { answer: { state: 'answered', value: { kind: 'scale', value: 4 } } } },
      { ...customDraft, inputType: 'number', scaleMin: undefined, scaleMax: undefined, scaleStep: undefined, unit: 'mg', configuration: { min: 0, max: 100 }, defaultAnswer: { answer: { state: 'answered', value: { kind: 'number', value: 30, unit: 'mg' } } } },
      { ...customDraft, inputType: 'duration', scaleMin: undefined, scaleMax: undefined, scaleStep: undefined, defaultAnswer: { answer: { state: 'answered', value: { kind: 'duration', value: 45, unit: 'minutes' } } } },
      { ...customDraft, inputType: 'time', scaleMin: undefined, scaleMax: undefined, scaleStep: undefined, defaultAnswer: { answer: { state: 'answered', value: { kind: 'time', value: '08:30' } } } },
      { ...customDraft, inputType: 'text', scaleMin: undefined, scaleMax: undefined, scaleStep: undefined, defaultAnswer: { answer: { state: 'answered', value: { kind: 'text', value: 'Prepared' } } } },
      { ...customDraft, inputType: 'single_choice', scaleMin: undefined, scaleMax: undefined, scaleStep: undefined, options: [{ optionId: 'low', label: 'Low' }, { optionId: 'high', label: 'High' }], defaultAnswer: { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['low'] } },
      { ...customDraft, inputType: 'multi_select', scaleMin: undefined, scaleMax: undefined, scaleStep: undefined, options: [{ optionId: 'left', label: 'Left' }, { optionId: 'right', label: 'Right' }], defaultAnswer: { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: ['left', 'right'] } },
    ]
    for (const [index, draft] of cases.entries()) {
      const { engine } = setup()
      const created = await engine.createTrackable({ ...draft, name: `Default ${index}` })
      expect(created.version.configuration.defaultAnswer).toEqual(draft.defaultAnswer)
    }
    const { engine } = setup()
    await expect(engine.createTrackable({ ...customDraft, inputType: 'number', scaleMin: undefined, scaleMax: undefined, scaleStep: undefined, configuration: { min: 0, max: 10 }, defaultAnswer: { answer: { state: 'answered', value: { kind: 'number', value: 11 } } } })).rejects.toThrow('valid number range')
  })

  it('creates versions only for semantic edits and retires the prior version', async () => {
    const { engine, repository } = setup()
    const created = await engine.createTrackable(customDraft)
    const metadataOnly = await engine.updateTrackable(created.trackable.id, { ...customDraft, tags: ['updated'] })
    expect(metadataOnly.trackable.currentVersion).toBe(1)
    const semantic = await engine.updateTrackable(created.trackable.id, { ...customDraft, tags: ['updated'], scaleMax: 5 })
    expect(semantic.trackable.currentVersion).toBe(2)
    const versions = await repository.getAll('trackableVersions')
    expect(versions.find((version) => version.version === 1)?.retiredAt).not.toBeNull()
  })

  it('archives and reactivates without deleting the Trackable', async () => {
    const { engine } = setup()
    const created = await engine.createTrackable(customDraft)
    await engine.setTrackableActive(created.trackable.id, false)
    expect((await engine.getLibrary()).archived[0].trackable.archivedAt).not.toBeNull()
    await engine.setTrackableActive(created.trackable.id, true)
    expect((await engine.getLibrary()).active[0].trackable.archivedAt).toBeNull()
  })

  it('prevents duplicate normalized category names on create and rename', async () => {
    const { engine } = setup()
    await engine.initialize()
    await expect(engine.createCategory('  skin  ')).rejects.toThrow('Category names must be unique.')
    const category = await engine.createCategory('Personal Signals')
    await expect(engine.renameCategory(category.id, ' SLEEP & ENERGY ')).rejects.toThrow('Category names must be unique.')
  })

  it('persists a normalized category color and can restore automatic color', async () => {
    const { engine, repository } = setup()
    await engine.initialize()
    await engine.setCategoryColor('category.skin', '#A1B2C3')
    expect((await repository.getAll('categories')).find((category) => category.id === 'category.skin')?.color).toBe('#a1b2c3')
    await engine.setCategoryColor('category.skin', undefined)
    expect((await repository.getAll('categories')).find((category) => category.id === 'category.skin')?.color).toBeUndefined()
  })

  it('edits category name, icon, color, and visibility without changing its identity', async () => {
    const { engine, repository } = setup()
    await engine.initialize()
    await engine.updateCategory('category.skin', { name: 'Complexion', icon: { type: 'emoji', value: '🪷' }, color: '#A1B2C3', active: false })
    const category = (await repository.getAll('categories')).find((item) => item.id === 'category.skin')
    expect(category).toMatchObject({ id: 'category.skin', name: 'Complexion', icon: { type: 'emoji', value: '🪷' }, color: '#a1b2c3', active: false })
  })

  it('keeps a migrated legacy icon when a category is renamed', async () => {
    const { engine, repository } = setup()
    await repository.save('categories', { id: 'category.skin', name: 'Skin', sortOrder: 0, active: true, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', deletedAt: null, revision: 1 })
    await engine.initialize()
    expect((await repository.getAll('categories'))[0]?.icon).toEqual({ type: 'emoji', value: '✨' })
    await engine.renameCategory('category.skin', 'Complexion')
    expect((await repository.getAll('categories'))[0]).toMatchObject({ name: 'Complexion', icon: { type: 'emoji', value: '✨' } })
  })

  it('creates categories with their configured icon, color, and visibility and still reorders them', async () => {
    const { engine } = setup()
    await engine.initialize()
    const created = await engine.createCategory({ name: 'Personal Signals', icon: { type: 'emoji', value: '🧩' }, color: '#1A2B3C', active: false })
    expect(created).toMatchObject({ name: 'Personal Signals', icon: { type: 'emoji', value: '🧩' }, color: '#1a2b3c', active: false })
    await engine.reorderCategory(created.id, -1)
    const categories = (await engine.getLibrary()).categories
    expect(categories.findIndex((item) => item.id === created.id)).toBe(9)
  })

  it('prevents adding an active ready-made Trackable twice', async () => {
    const { engine } = setup()
    await engine.createFromPreset('preset.skin.acne-severity')
    await expect(engine.createFromPreset('preset.skin.acne-severity')).rejects.toThrow('A Trackable named Acne Severity already exists in Skin.')
    expect((await engine.getLibrary()).active).toHaveLength(1)
  })

  it('reactivates an archived ready-made Trackable instead of duplicating its identity', async () => {
    const { engine, repository } = setup()
    const created = await engine.createFromPreset('preset.skin.acne-severity')
    await engine.setTrackableActive(created.trackable.id, false)

    const restored = await engine.createFromPreset('preset.skin.acne-severity')

    expect(restored.trackable.id).toBe(created.trackable.id)
    expect(restored.trackable).toMatchObject({ active: true, archivedAt: null })
    expect(await repository.getAll('trackables')).toHaveLength(1)
    expect((await engine.getLibrary()).archived).toHaveLength(0)
  })

  it('uses global name matching for Library additions and restores matching archived presets', async () => {
    const { engine, repository } = setup()
    const custom = await engine.createTrackable({ ...customDraft, name: '  Acne   Severity  ', categoryId: 'category.pain' })
    await expect(engine.createFromPreset('preset.skin.acne-severity')).rejects.toThrow('A Trackable named Acne   Severity already exists in Pain.')
    expect(await engine.isPresetActive('preset.skin.acne-severity')).toBe(true)
    await engine.setTrackableActive(custom.trackable.id, false)
    const restored = await engine.createFromPreset('preset.skin.acne-severity')
    expect(restored.trackable.id).toBe(custom.trackable.id)
    expect((await repository.getAll('trackables')).map((trackable) => trackable.id)).toEqual([custom.trackable.id])
  })

  it('skips ready-made Trackables already active when adding a Starter Pack', async () => {
    const { engine } = setup()
    await engine.createFromPreset('preset.skin.acne-severity')
    const created = await engine.createFromPack('pack.skin-tracking')
    expect(created).toHaveLength(5)
    const active = (await engine.getLibrary()).active
    expect(active.filter(({ version }) => version.name === 'Acne Severity')).toHaveLength(1)
    expect(active).toHaveLength(6)
  })

  it('keeps Starter Pack Add All and Add Remaining duplicate-safe across repeated actions', async () => {
    const { engine } = setup()
    await engine.createTrackable({ ...customDraft, name: 'Acne Severity', categoryId: 'category.pain' })
    const firstAdd = await engine.createFromPack('pack.skin-tracking')
    const secondAdd = await engine.createFromPack('pack.skin-tracking')
    const active = (await engine.getLibrary()).active
    expect(firstAdd).toHaveLength(5)
    expect(secondAdd).toHaveLength(0)
    expect(active.filter(({ version }) => normalizeTrackableName(version.name) === 'acne severity')).toHaveLength(1)
  })

  it('does not modify legacy duplicate records while enforcing future names', async () => {
    const { engine, repository } = setup()
    const original = await engine.createTrackable({ ...customDraft, name: 'Legacy Name' })
    await repository.save('trackables', { ...original.trackable, id: 'legacy-duplicate', revision: 1 })
    await repository.save('trackableVersions', { ...original.version, id: 'legacy-duplicate:v1', trackableId: 'legacy-duplicate', name: ' legacy   name ', revision: 1 })
    await expect(engine.createTrackable({ ...customDraft, name: 'LEGACY NAME' })).rejects.toBeInstanceOf(TrackableNameConflictError)
    expect((await engine.getLibrary()).active.map(({ trackable }) => trackable.id).sort()).toEqual(['legacy-duplicate', original.trackable.id].sort())
  })
})
