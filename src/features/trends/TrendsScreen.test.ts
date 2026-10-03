import { describe, expect, it } from 'vitest'
import { trendsMappingEditPath } from './trendsNavigation.ts'

describe('Trends historical mapping navigation', () => {
  it('routes unresolved history to Edit Trackable with the relevant transition selected', () => {
    expect(trendsMappingEditPath('trackable / one', 3)).toBe('/trackables/edit/trackable%20%2F%20one?section=analysis&mapping=3')
  })
})
