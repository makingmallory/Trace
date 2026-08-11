import { describe, expect, it } from 'vitest'
import { InMemoryDataRepository } from '../../data/local/InMemoryDataRepository.ts'
import { trackablePresets } from '../../presets/trackablePresets.ts'
import { TrackableEngine, TrackableValidationError, type TrackableDraft } from './TrackableEngine.ts'

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
    expect(trackablePresets).toHaveLength(90)

    const created = await engine.createFromPreset('preset.cycle-reproductive.discharge-color')
    expect(created.trackable.id).not.toBe('preset.cycle-reproductive.discharge-color')
    expect(created.options.map((option) => option.label)).toContain('Red')
  })

  it('creates and validates a custom Trackable without losing zero scale bounds', async () => {
    const { engine } = setup()
    const created = await engine.createTrackable(customDraft)
    expect(created.version.scaleMin).toBe(0)
    expect(created.trackable.tags).toEqual(['personal'])

    await expect(engine.createTrackable({ ...customDraft, scaleMax: 0 })).rejects.toBeInstanceOf(TrackableValidationError)
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

  it('prevents adding an active ready-made Trackable twice', async () => {
    const { engine } = setup()
    await engine.createFromPreset('preset.skin.acne-severity')
    await expect(engine.createFromPreset('preset.skin.acne-severity')).rejects.toThrow('already in your active Trackables')
    expect((await engine.getLibrary()).active).toHaveLength(1)
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
})
