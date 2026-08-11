import { describe, expect, it } from 'vitest'
import { clearCalendarFormatting } from './calendarFormatting.ts'

describe('calendar formatting state', () => {
  it('clears both the selected identity and heatmap mode', () => {
    expect(clearCalendarFormatting()).toEqual({ metricId: 'none', heatmap: false })
  })
})
