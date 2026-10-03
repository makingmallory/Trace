import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { Category } from '../../domain/models/index.ts'
import type { TrackableDetails } from '../../domain/trackables/TrackableEngine.ts'
import { getPresetById, presetPacks, trackablePresets } from '../../presets/trackablePresets.ts'
import { AddTrackableScreen, BrowseSection, ManageTrackablesScreen, PackCard, PresetCard } from './TrackablesScreen.tsx'
import { TrackableEditor } from './TrackableEditor.tsx'
import { filterOwnedTrackableGroups, filterOwnedTrackables, filterPresetGroups, groupAdditionalFieldCandidates, isPresetAlreadyActive, packDisplayIcon, presetIcon } from './trackableUi.ts'

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
    expect(filterOwnedTrackableGroups(active, categories, '', 'category.skin').map((group) => group.category.id)).toEqual(['category.skin'])
  })

  it('groups and filters Additional Field candidates without changing the source selection data', () => {
    const candidates = [owned('owner', 'Owner', 'category.skin'), owned('acne', 'Acne Location', 'category.skin'), owned('energy', 'Energy Level', 'category.mood-mental')]
    const before = structuredClone(candidates)
    expect(groupAdditionalFieldCandidates(candidates, categories, 'owner', 'energy').map((group) => [group.category.id, group.items.map((item) => item.trackable.id)])).toEqual([['category.mood-mental', ['energy']]])
    expect(candidates).toEqual(before)
  })

  it('identifies an active ready-made Trackable by its canonical global name', () => {
    const preset = getPresetById('preset.skin.acne-severity')!
    const active = [{
      trackable: { id: 'owned-id', categoryId: 'category.mood-mental', active: true, archivedAt: null, currentVersion: 1, tags: [], dataRole: preset.dataRole, createdAt: '', updatedAt: '', deletedAt: null, revision: 1 },
      version: { id: 'version-id', trackableId: 'owned-id', version: 1, name: '  ACNE   severity ', inputType: 'text', valueDirection: preset.valueDirection, configuration: {}, retiredAt: null, createdAt: '', updatedAt: '', deletedAt: null, revision: 1 },
      options: [],
    }] satisfies readonly TrackableDetails[]
    expect(isPresetAlreadyActive(preset, active)).toBe(true)
    expect(preset.id).not.toBe(active[0].trackable.id)
  })

  it('uses compact expandable browsing sections rather than separate pack selection controls', () => {
    const collapsed = renderToStaticMarkup(createElement(BrowseSection, { id: 'test', icon: '✨', title: 'Skin', count: 2, expanded: false, onToggle: () => undefined }, createElement('p', {}, 'Hidden item')))
    const expanded = renderToStaticMarkup(createElement(BrowseSection, { id: 'test', icon: '✨', title: 'Skin', count: 2, expanded: true, onToggle: () => undefined }, createElement('p', {}, 'Visible item')))
    expect(collapsed).toContain('aria-expanded="false"')
    expect(collapsed).not.toContain('Hidden item')
    expect(expanded).toContain('aria-expanded="true"')
    expect(expanded).toContain('Visible item')
  })

  it('offers only missing pack items through an Add All or Add Remaining action', () => {
    const allMissing = renderToStaticMarkup(createElement(PackCard, { pack: presetPacks[0], addedPresetIds: [], onAdd: () => undefined, onToggle: () => undefined }))
    const addedId = presetPacks[0].presetIds[0]
    const remaining = renderToStaticMarkup(createElement(PackCard, { pack: presetPacks[0], addedPresetIds: [addedId], onAdd: () => undefined, onToggle: () => undefined }))
    const complete = renderToStaticMarkup(createElement(PackCard, { pack: presetPacks[0], addedPresetIds: presetPacks[0].presetIds, onAdd: () => undefined, onToggle: () => undefined }))
    expect(allMissing).toContain('Add All')
    expect(remaining).toContain('Add Remaining')
    expect(complete).not.toContain('browse-section__bulk-action')
  })

  it('keeps the Add control stable while allowing an Added item to be toggled off', () => {
    const preset = getPresetById('preset.skin.acne-severity')!
    const markup = renderToStaticMarkup(createElement(PresetCard, { preset, added: true, busy: false, onAdd: () => undefined }))
    expect(markup).toContain('<button class="tile-action is-added" type="button">Added</button>')
    expect(markup).not.toContain('disabled=""')
  })

  it('uses the current category icon for ordinary presets while retaining explicit preset art', () => {
    const category = { icon: { type: 'emoji' as const, value: '🌿' } }
    const ordinary = getPresetById('preset.skin.acne-severity')!
    expect(presetIcon(ordinary, category)).toEqual(category.icon)
    expect(presetIcon({ ...ordinary, icon: { type: 'emoji', value: '✨' } }, category)).toEqual({ type: 'emoji', value: '✨' })
  })

  it('derives pack icons from the most common effective item icon with item-order ties', () => {
    const displayCategories = [
      { id: 'category.first', icon: { type: 'emoji' as const, value: '💗' } },
      { id: 'category.second', icon: { type: 'emoji' as const, value: '🌙' } },
    ]
    const displayPresets = [
      { ...trackablePresets[0], id: 'first-a', categoryId: 'category.first' },
      { ...trackablePresets[0], id: 'second', categoryId: 'category.second' },
      { ...trackablePresets[0], id: 'first-b', categoryId: 'category.first' },
    ]
    expect(packDisplayIcon(['first-a', 'second', 'first-b'], displayPresets, displayCategories)).toBe('💗')
    expect(packDisplayIcon(['second', 'first-a'], displayPresets, displayCategories)).toBe('🌙')
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

  it('shares the configuration-first sections across create and edit while history remains edit-only', () => {
    const library = { categories, active: [owned('acne', 'Acne Location', 'category.skin')], archived: [] }
    const createMarkup = renderToStaticMarkup(createElement(TrackableEditor, { library, onCancel: () => undefined, onSaved: () => undefined }))
    const editMarkup = renderToStaticMarkup(createElement(TrackableEditor, { details: library.active[0], library, onCancel: () => undefined, onSaved: () => undefined }))
    for (const markup of [createMarkup, editMarkup]) {
      expect(markup).toContain('class="trackable-config-card basics-card"')
      expect(markup).toContain('class="trackable-config-card tracking-card"')
      expect(markup).toContain('class="trackable-config-card answer-config-card"')
      expect(markup).toContain('class="tracking-choice-list"')
      expect(markup).toContain('Additional Fields')
      expect(markup).toContain('Advanced Options')
      expect(markup).toContain('Find a field')
    }
    expect(createMarkup).not.toContain('Historical mappings')
    expect(editMarkup).toContain('Historical mappings')
    expect(createMarkup).toContain('class="trackable-scale-settings"')
  })

  it('renders choice options as stable structured rows instead of a line-based textarea', () => {
    const choice = owned('severity', 'Severity', 'category.skin')
    choice.version = { ...choice.version, inputType: 'single_choice', configuration: { analysisMeasurementType: 'ordinal', orderedOptionIds: ['low', 'high'] } }
    choice.options = [
      { id: 'low:v1', optionId: 'low', trackableId: 'severity', trackableVersion: 1, storedValue: 'low', label: 'Low', sortOrder: 0, active: true, createdAt: '', updatedAt: '', deletedAt: null, revision: 1 },
      { id: 'high:v1', optionId: 'high', trackableId: 'severity', trackableVersion: 1, storedValue: 'high', label: 'High', sortOrder: 1, active: true, createdAt: '', updatedAt: '', deletedAt: null, revision: 1 },
    ]
    const markup = renderToStaticMarkup(createElement(TrackableEditor, { details: choice, library: { categories, active: [choice], archived: [] }, onCancel: () => undefined, onSaved: () => undefined }))
    expect(markup).toContain('class="choice-option-row"')
    expect(markup).toContain('value="Low"')
    expect(markup).toContain('+ Add option')
    expect(markup).toContain('Ordered categories')
    expect(markup).not.toContain('one per line')
  })
})
