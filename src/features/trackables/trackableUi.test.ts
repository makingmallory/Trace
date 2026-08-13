import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { Category } from '../../domain/models/index.ts'
import type { TrackableDetails } from '../../domain/trackables/TrackableEngine.ts'
import { getPresetById, presetPacks, trackablePresets } from '../../presets/trackablePresets.ts'
import { AddTrackableScreen, ManageTrackablesScreen, PackCard, PresetCard } from './TrackablesScreen.tsx'
import { TrackableEditor } from './TrackableEditor.tsx'
import { filterOwnedTrackableGroups, filterOwnedTrackables, filterPresetGroups, isPresetAlreadyActive } from './trackableUi.ts'

vi.mock('./trackableEngine.ts', () => ({ trackableEngine: {} }))

const categories: readonly Category[] = [
  { id: 'category.skin', name: 'Skin', sortOrder: 1, active: true, createdAt: '', updatedAt: '', deletedAt: null, revision: 1 },
  { id: 'category.mood-mental', name: 'Mood', sortOrder: 0, active: true, createdAt: '', updatedAt: '', deletedAt: null, revision: 1 },
]

function owned(id: string, name: string, categoryId: string, active = true): TrackableDetails {
  return {
    trackable: { id, categoryId, active, archivedAt: active ? null : '', currentVersion: 1, tags: [], dataRole: 'other', recordSemantics: 'daily_value', quickLogEnabled: false, createdAt: '', updatedAt: '', deletedAt: null, revision: 1 },
    version: { id: `${id}:v1`, trackableId: id, version: 1, name, inputType: 'boolean', valueDirection: 'neutral', configuration: {}, retiredAt: null, createdAt: '', updatedAt: '', deletedAt: null, revision: 1 },
    options: [],
  }
}

describe('Trackable preset browsing', () => {
  it('combines search and category filtering, then sorts groups and items', () => {
    const groups = filterPresetGroups(trackablePresets, categories, 'acne', 'category.skin')
    expect(groups).toHaveLength(1)
    expect(groups[0].category.id).toBe('category.skin')
    expect(groups[0].presets.map((preset) => preset.name)).toEqual(['Acne Location', 'Acne Present', 'Acne Severity'])
  })

  it('uses category ordering when all categories are selected', () => {
    const groups = filterPresetGroups(trackablePresets, categories, '', 'all')
    expect(groups.map((group) => group.category.id)).toEqual(['category.mood-mental', 'category.skin'])
  })

  it('filters owned Trackables by trimmed case-insensitive partial names and category names', () => {
    const trackables = [owned('acne', 'Acne Location', 'category.skin'), owned('energy', 'Energy Level', 'category.mood-mental'), owned('pilates', 'Pilates', 'category.mood-mental')]
    expect(filterOwnedTrackables(trackables, categories, '  LoCaT  ').map((item) => item.trackable.id)).toEqual(['acne'])
    expect(filterOwnedTrackables(trackables, categories, 'skin').map((item) => item.trackable.id)).toEqual(['acne'])
    expect(filterOwnedTrackables(trackables, categories, 'missing')).toEqual([])
    expect(filterOwnedTrackables(trackables, categories, '')).toEqual(trackables)
  })

  it('preserves category grouping, hides empty groups, and never expands the supplied active or archived scope', () => {
    const active = [owned('acne', 'Acne Location', 'category.skin'), owned('energy', 'Energy Level', 'category.mood-mental')]
    const archived = [owned('old-acne', 'Old Acne Note', 'category.skin', false)]
    const groups = filterOwnedTrackableGroups(active, categories, 'acne')
    expect(groups).toHaveLength(1)
    expect(groups[0].category.id).toBe('category.skin')
    expect(groups[0].items.map((item) => item.trackable.id)).toEqual(['acne'])
    expect(filterOwnedTrackables(archived, categories, 'acne').map((item) => item.trackable.id)).toEqual(['old-acne'])
    expect(filterOwnedTrackables(active, categories, 'old')).toEqual([])
  })

  it('identifies an active ready-made Trackable using the conservative matching rule', () => {
    const preset = getPresetById('preset.skin.acne-severity')!
    const active = [{
      trackable: { id: 'owned-id', categoryId: preset.categoryId, active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: preset.dataRole, createdAt: '', updatedAt: '', deletedAt: null, revision: 1 },
      version: { id: 'version-id', trackableId: 'owned-id', version: 1, name: preset.name, inputType: preset.inputType, scaleMin: 1, scaleMax: 5, scaleStep: 1, valueDirection: preset.valueDirection, configuration: {}, retiredAt: null, createdAt: '', updatedAt: '', deletedAt: null, revision: 1 },
      options: [],
    }] satisfies readonly TrackableDetails[]
    expect(isPresetAlreadyActive(preset, active)).toBe(true)
    expect(preset.id).not.toBe(active[0].trackable.id)
  })

  it('renders touch-accessible pack disclosure and item selection', () => {
    const markup = renderToStaticMarkup(createElement(PackCard, { pack: presetPacks[0], onAdd: () => undefined, busy: false }))
    expect(markup).toContain('<details>')
    expect(markup).toContain('<summary>View items</summary>')
    expect(markup.match(/type="checkbox"/g)).toHaveLength(presetPacks[0].presetIds.length)
  })

  it('disables ready-made Trackables already present in a Starter Pack', () => {
    const addedId = presetPacks[0].presetIds[0]
    const markup = renderToStaticMarkup(createElement(PackCard, { pack: presetPacks[0], addedPresetIds: [addedId], onAdd: () => undefined, busy: false }))
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('Added')
    expect(markup).toContain(`Add ${presetPacks[0].presetIds.length - 1} selected`)
  })

  it('disables the add action for an already-added library item', () => {
    const preset = getPresetById('preset.skin.acne-severity')!
    const markup = renderToStaticMarkup(createElement(PresetCard, { preset, added: true, busy: false, onAdd: () => undefined }))
    expect(markup).toContain('<button class="tile-action" type="button" disabled="">Added</button>')
    expect(markup).not.toContain('Add another')
  })

  it('uses Trackable Library terminology and navigation', () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(AddTrackableScreen)))
    expect(markup).toContain('Trackable Library')
    expect(markup).toContain('/trackables/library')
    expect(markup).not.toContain('Browse Presets')
  })

  it('keeps categories and archived Trackables behind the Manage screen', () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(ManageTrackablesScreen)))
    expect(markup).toContain('/trackables/manage/categories')
    expect(markup).toContain('/trackables/manage/archived')
  })

  it('autofocuses Name only for creation while keeping the edit Name field normally editable', () => {
    const library = { categories, active: [owned('acne', 'Acne Location', 'category.skin')], archived: [] }
    const createMarkup = renderToStaticMarkup(createElement(TrackableEditor, { library, onCancel: () => undefined, onSaved: () => undefined }))
    const editMarkup = renderToStaticMarkup(createElement(TrackableEditor, { details: library.active[0], library, onCancel: () => undefined, onSaved: () => undefined }))
    expect(createMarkup).toContain('autofocus=""')
    expect(editMarkup).not.toContain('autofocus=""')
    expect(editMarkup).toContain('value="Acne Location"')
  })
})
