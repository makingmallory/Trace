import type { AnalysisSeriesDescriptor, AnalysisSourceInputType } from './analysisModel.ts'

export interface AnalysisSelectorFilters {
  query: string
  categoryId: string
  inputTypes: ReadonlySet<AnalysisSourceInputType>
}

export interface AnalysisSelectorGroup {
  categoryId: string
  categoryName: string
  items: readonly AnalysisSeriesDescriptor[]
}

export const analysisSourceInputLabels: Readonly<Record<AnalysisSourceInputType, string>> = {
  scale: 'Scale',
  boolean: 'Yes / No',
  number: 'Number',
  single_choice: 'Single choice',
  multi_select: 'Multiple choice',
  text: 'Text',
  duration: 'Duration',
  time: 'Time',
  event: 'Event / Quick Log',
}

export function filterAnalysisSeries(items: readonly AnalysisSeriesDescriptor[], filters: AnalysisSelectorFilters): readonly AnalysisSeriesDescriptor[] {
  const query = filters.query.trim().toLocaleLowerCase()
  return items.filter((item) =>
    (!query || item.name.toLocaleLowerCase().includes(query))
    && (filters.categoryId === 'all' || item.categoryId === filters.categoryId)
    && filters.inputTypes.has(item.sourceInputType),
  )
}

export function groupAnalysisSeries(items: readonly AnalysisSeriesDescriptor[]): readonly AnalysisSelectorGroup[] {
  const groups = new Map<string, AnalysisSelectorGroup>()
  for (const item of items) {
    const group = groups.get(item.categoryId) ?? { categoryId: item.categoryId, categoryName: item.categoryName, items: [] }
    groups.set(item.categoryId, { ...group, items: [...group.items, item] })
  }
  return [...groups.values()]
    .map((group) => ({ ...group, items: [...group.items].sort((left, right) => left.name.localeCompare(right.name)) }))
    .sort((left, right) => left.categoryName.localeCompare(right.categoryName))
}

/** Selector filters are presentation-only and intentionally never alter selected analysis IDs. */
export function retainSelectedAnalysisIds(selectedIds: readonly string[]): readonly string[] {
  return selectedIds
}
