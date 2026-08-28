import { describe, expect, it } from 'vitest'
import { dailyLocalWallClockSchedule, nextLocalWallClockOccurrence } from './localWallClockSchedule.ts'

describe('local Daily Check-In reminder scheduling', () => {
  it('keeps a 9 PM reminder today when the selected local time has not passed', () => {
    const result = nextLocalWallClockOccurrence('21:00', new Date(2026, 7, 28, 20, 59, 59))

    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(7)
    expect(result.getDate()).toBe(28)
    expect(result.getHours()).toBe(21)
    expect(result.getMinutes()).toBe(0)
  })

  it('moves a passed 9 PM reminder to tomorrow without converting it to UTC', () => {
    const result = nextLocalWallClockOccurrence('21:00', new Date(2026, 7, 28, 21, 0, 1))

    expect(result.getDate()).toBe(29)
    expect(result.getHours()).toBe(21)
    expect(result.getMinutes()).toBe(0)
  })

  it('preserves exact minutes and handles midnight-adjacent times', () => {
    const laterToday = nextLocalWallClockOccurrence('00:05', new Date(2026, 7, 28, 0, 4, 59))
    const tomorrow = nextLocalWallClockOccurrence('00:05', new Date(2026, 7, 28, 0, 5, 1))

    expect(laterToday.getHours()).toBe(0)
    expect(laterToday.getMinutes()).toBe(5)
    expect(laterToday.getDate()).toBe(28)
    expect(tomorrow.getHours()).toBe(0)
    expect(tomorrow.getMinutes()).toBe(5)
    expect(tomorrow.getDate()).toBe(29)
  })

  it('uses a repeating local calendar rule rather than a UTC timestamp', () => {
    expect(dailyLocalWallClockSchedule('21:07')).toEqual({
      on: { hour: 21, minute: 7, second: 0 },
      allowWhileIdle: true,
    })
  })
})
