import type { Category, InputType } from '../../domain/models/index.ts'
import type { TrackableDetails } from '../../domain/trackables/TrackableEngine.ts'
import type { TrackablePreset } from '../../presets/trackablePresets.ts'

export interface PresetGroup {
  category: Category
  presets: readonly TrackablePreset[]
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
