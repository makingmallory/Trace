import { describe, expect, it } from 'vitest'
import { inputTypeSelectionState, setAllInputTypes, shouldCloseAnalysisDropdown, toggleAnalysisSelection, toggleInputType } from './analysisExploreControls.ts'
import type { AnalysisSourceInputType } from './analysisModel.ts'

const types: readonly AnalysisSourceInputType[] = ['scale', 'boolean', 'number']

describe('Explore control state', () => {
  it('allows removal of the final selected Trackable', () => {
    expect(toggleAnalysisSelection(['energy'], 'energy')).toEqual([])
  })

  it('supports multi-select type filters and Select all state', () => {
    const selected = toggleInputType(new Set<AnalysisSourceInputType>(['scale']), 'number')
    expect([...selected].sort()).toEqual(['number', 'scale'])
    expect(inputTypeSelectionState(selected, types)).toBe('some')
    const all = setAllInputTypes(types, true)
    expect(inputTypeSelectionState(all, types)).toBe('all')
    expect(inputTypeSelectionState(setAllInputTypes(types, false), types)).toBe('none')
  })

  it('closes open dropdowns outside and on Escape without closing for inside interactions', () => {
    expect(shouldCloseAnalysisDropdown(true, { pointerInside: false })).toBe(true)
    expect(shouldCloseAnalysisDropdown(true, { pointerInside: true })).toBe(false)
    expect(shouldCloseAnalysisDropdown(true, { key: 'Escape' })).toBe(true)
    expect(shouldCloseAnalysisDropdown(true, { key: 'Enter' })).toBe(false)
  })
})
