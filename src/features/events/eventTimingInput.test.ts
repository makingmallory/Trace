import { describe, expect, it } from 'vitest'
import { endpointDraftFromInput, type EndpointInputState } from './eventTimingInput.ts'

const base: EndpointInputState = { localDate: '2026-08-11', localTime: '', timeOfDay: null, timeOfDayExpanded: false }

describe('event timing input inference', () => {
  it('maps a blank optional time to date-only without another selection', () => {
    expect(endpointDraftFromInput(base)).toEqual({ localDate: '2026-08-11', precision: 'day' })
  })

  it('stores the selected time-of-day bucket without a clock time', () => {
    expect(endpointDraftFromInput({ ...base, timeOfDay: 'morning' })).toEqual({ localDate: '2026-08-11', precision: 'timeOfDay', timeOfDay: 'morning' })
  })

  it('gives an entered exact time precedence over a stale bucket', () => {
    expect(endpointDraftFromInput({ ...base, localTime: '15:42', timeOfDay: 'late_afternoon' })).toEqual({ localDate: '2026-08-11', precision: 'exact', localTime: '15:42' })
  })
})
