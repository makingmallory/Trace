import type { AnalysisSourceInputType } from './analysisModel.ts'

export function toggleAnalysisSelection(selectedIds: readonly string[], id: string): readonly string[] {
  return selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]
}

export function toggleInputType(selectedTypes: ReadonlySet<AnalysisSourceInputType>, type: AnalysisSourceInputType): ReadonlySet<AnalysisSourceInputType> {
  const next = new Set(selectedTypes)
  if (next.has(type)) next.delete(type)
  else next.add(type)
  return next
}

export function setAllInputTypes(types: readonly AnalysisSourceInputType[], selected: boolean): ReadonlySet<AnalysisSourceInputType> {
  return selected ? new Set(types) : new Set()
}

export function inputTypeSelectionState(selectedTypes: ReadonlySet<AnalysisSourceInputType>, types: readonly AnalysisSourceInputType[]): 'none' | 'some' | 'all' {
  const selectedCount = types.filter((type) => selectedTypes.has(type)).length
  return selectedCount === 0 ? 'none' : selectedCount === types.length ? 'all' : 'some'
}

export function shouldCloseAnalysisDropdown(open: boolean, interaction: { pointerInside?: boolean; key?: string }): boolean {
  if (!open) return false
  if (interaction.key !== undefined) return interaction.key === 'Escape'
  return interaction.pointerInside === false
}
