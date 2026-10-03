import { describe, expect, it } from 'vitest'
import { filterAnalysisSeries, groupAnalysisSeries, retainSelectedAnalysisIds } from './analysisSelector.ts'
import type { AnalysisSeriesDescriptor } from './analysisModel.ts'

const items: readonly AnalysisSeriesDescriptor[] = [
  { id: 'energy', trackableId: 'energy', name: 'Energy', categoryId: 'health', categoryName: 'General Health', sourceInputType: 'scale', measurementType: 'ordinal', recordedCount: 4 },
  { id: 'discharge', trackableId: 'discharge', name: 'Discharge Color', categoryId: 'cycle', categoryName: 'Cycle & Reproductive', sourceInputType: 'multi_select', measurementType: 'nominal-multiselect', recordedCount: 3 },
  { id: 'procedure:type', trackableId: 'type', ownerTrackableId: 'procedure', name: 'Procedure → Procedure Type', categoryId: 'health', categoryName: 'General Health', sourceInputType: 'single_choice', measurementType: 'nominal-single', recordedCount: 1 },
  { id: 'event', trackableId: 'event', name: 'Headache', categoryId: 'health', categoryName: 'General Health', sourceInputType: 'event', measurementType: 'event', recordedCount: 2 },
]

describe('analysis selector', () => {
  it('groups selectable Trackables by their user-facing category', () => {
    expect(groupAnalysisSeries(items)).toEqual([
      expect.objectContaining({ categoryName: 'Cycle & Reproductive', items: [expect.objectContaining({ name: 'Discharge Color' })] }),
      expect.objectContaining({ categoryName: 'General Health', items: [expect.objectContaining({ name: 'Energy' }), expect.objectContaining({ name: 'Headache' }), expect.objectContaining({ name: 'Procedure → Procedure Type' })] }),
    ])
  })

  it('filters by category and persisted source input type', () => {
    expect(filterAnalysisSeries(items, { query: '', categoryId: 'health', inputTypes: new Set(['event']) }).map((item) => item.name)).toEqual(['Headache'])
    expect(filterAnalysisSeries(items, { query: '', categoryId: 'cycle', inputTypes: new Set(['multi_select']) }).map((item) => item.name)).toEqual(['Discharge Color'])
  })

  it('combines text, category, and type filters', () => {
    expect(filterAnalysisSeries(items, { query: 'procedure', categoryId: 'health', inputTypes: new Set(['single_choice', 'event']) }).map((item) => item.name)).toEqual(['Procedure → Procedure Type'])
    expect(filterAnalysisSeries(items, { query: 'discharge', categoryId: 'health', inputTypes: new Set(['multi_select']) })).toEqual([])
  })

  it('does not alter the analysis selection when filters hide an item', () => {
    const selected = ['energy', 'discharge']
    expect(retainSelectedAnalysisIds(selected)).toEqual(selected)
    expect(filterAnalysisSeries(items, { query: 'discharge', categoryId: 'cycle', inputTypes: new Set(['multi_select']) }).map((item) => item.id)).toEqual(['discharge'])
  })
})
