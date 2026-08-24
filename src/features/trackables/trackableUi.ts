import type { Category, IconReference, InputType } from '../../domain/models/index.ts'
import type { TrackableDetails } from '../../domain/trackables/TrackableEngine.ts'
import type { TrackablePreset } from '../../presets/trackablePresets.ts'
import { iconGlyph } from '../../presets/iconLibrary.ts'

export interface PresetGroup {
  category: Category
  presets: readonly TrackablePreset[]
}

export interface TrackableGroup {
  category: Category
  items: readonly TrackableDetails[]
}

export const inputTypes: readonly { value: InputType; label: string }[] = [
  { value: 'scale', label: 'Scale' }, { value: 'boolean', label: 'Yes / No' },
  { value: 'single_choice', label: 'Single choice' }, { value: 'multi_select', label: 'Multi-select' },
  { value: 'number', label: 'Number' }, { value: 'duration', label: 'Duration' },
  { value: 'time', label: 'Time' }, { value: 'text', label: 'Text / notes' },
]

export function isPresetAlreadyActive(preset: TrackablePreset, active: readonly TrackableDetails[]): boolean {
  return active.some(({ trackable, version }) =>
    trackable.categoryId === preset.categoryId
    && version.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase()
    && version.inputType === preset.inputType,
  )
}

export function activeTrackableForPreset(preset: TrackablePreset, active: readonly TrackableDetails[]): TrackableDetails | undefined {
  return active.find(({ trackable, version }) =>
    trackable.categoryId === preset.categoryId
    && version.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase()
    && version.inputType === preset.inputType,
  )
}

export function presetIcon(preset: TrackablePreset, category: Pick<Category, 'icon'> | undefined): IconReference | undefined {
  return preset.icon ?? category?.icon
}

/**
 * Chooses the icon users see most often among a pack's ordered presets. Equal
 * counts keep the first icon encountered, making the result stable by pack
 * item order without adding pack-specific artwork.
 */
export function packDisplayIcon(
  presetIds: readonly string[],
  presets: readonly TrackablePreset[],
  categories: readonly Pick<Category, 'id' | 'icon'>[],
): string {
  const presetsById = new Map(presets.map((preset) => [preset.id, preset]))
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const counts = new Map<string, number>()
  let mode = iconGlyph(undefined)
  let modeCount = 0

  for (const presetId of presetIds) {
    const preset = presetsById.get(presetId)
    if (!preset) continue
    const glyph = iconGlyph(presetIcon(preset, categoriesById.get(preset.categoryId)))
    const count = (counts.get(glyph) ?? 0) + 1
    counts.set(glyph, count)
    if (count > modeCount) {
      mode = glyph
      modeCount = count
    }
  }

  return mode
}

export function filterPresetGroups(
  presets: readonly TrackablePreset[],
  categories: readonly Category[],
  search: string,
  categoryId: string,
): readonly PresetGroup[] {
  const query = search.trim().toLocaleLowerCase()
  const filtered = presets.filter((preset) =>
    (categoryId === 'all' || preset.categoryId === categoryId)
    && (!query || preset.name.toLocaleLowerCase().includes(query) || preset.description?.toLocaleLowerCase().includes(query)),
  )

  return [...categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category) => ({
      category,
      presets: filtered
        .filter((preset) => preset.categoryId === category.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((group) => group.presets.length > 0)
}

export function filterOwnedTrackables(
  trackables: readonly TrackableDetails[],
  categories: readonly Category[],
  search: string,
  categoryId = 'all',
): readonly TrackableDetails[] {
  const query = search.trim().toLocaleLowerCase()
  const categoryNames = new Map(categories.map((category) => [category.id, category.name.toLocaleLowerCase()]))
  return trackables.filter(({ trackable, version }) =>
    (categoryId === 'all' || trackable.categoryId === categoryId)
    && (!query
      || version.name.toLocaleLowerCase().includes(query)
      || categoryNames.get(trackable.categoryId)?.includes(query)),
  )
}

export function filterOwnedTrackableGroups(
  trackables: readonly TrackableDetails[],
  categories: readonly Category[],
  search: string,
  categoryId = 'all',
): readonly TrackableGroup[] {
  const filtered = filterOwnedTrackables(trackables, categories, search)
  return categories.filter((category) => categoryId === 'all' || category.id === categoryId).map((category) => ({
    category,
    items: filtered.filter((item) => item.trackable.categoryId === category.id),
  })).filter(({ items }) => items.length > 0)
}
