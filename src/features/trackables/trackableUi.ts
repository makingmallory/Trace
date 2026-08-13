import type { Category, InputType } from '../../domain/models/index.ts'
import type { TrackableDetails } from '../../domain/trackables/TrackableEngine.ts'
import type { TrackablePreset } from '../../presets/trackablePresets.ts'

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
): readonly TrackableDetails[] {
  const query = search.trim().toLocaleLowerCase()
  if (!query) return trackables
  const categoryNames = new Map(categories.map((category) => [category.id, category.name.toLocaleLowerCase()]))
  return trackables.filter(({ trackable, version }) =>
    version.name.toLocaleLowerCase().includes(query)
    || categoryNames.get(trackable.categoryId)?.includes(query),
  )
}

export function filterOwnedTrackableGroups(
  trackables: readonly TrackableDetails[],
  categories: readonly Category[],
  search: string,
): readonly TrackableGroup[] {
  const filtered = filterOwnedTrackables(trackables, categories, search)
  return categories.map((category) => ({
    category,
    items: filtered.filter((item) => item.trackable.categoryId === category.id),
  })).filter(({ items }) => items.length > 0)
}
