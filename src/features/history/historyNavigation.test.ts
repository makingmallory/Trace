import { describe, expect, it } from 'vitest'
import { weekDates } from '../../domain/history/HistoryEngine.ts'
import {
  calendarPeriodSelection, currentPeriodLabel, horizontalSwipeDirection,
  selectedDaySelection, shouldRevealSelectedDay, swipeAmount,
} from './historyNavigation.ts'

describe('History calendar navigation intent', () => {
  it('reveals Selected Day only after an explicit date choice', () => {
    expect(shouldRevealSelectedDay('manual-day-selection')).toBe(true)
  })

  it('does not reveal Selected Day for week navigation', () => {
    expect(shouldRevealSelectedDay('week-navigation')).toBe(false)
  })

  it('does not reveal Selected Day for month navigation', () => {
    expect(shouldRevealSelectedDay('month-navigation')).toBe(false)
  })

  it('does not reveal Selected Day for current-period navigation', () => {
    expect(shouldRevealSelectedDay('current-period-navigation')).toBe(false)
  })

  it('does not reveal Selected Day for day navigation', () => {
    expect(shouldRevealSelectedDay('day-navigation')).toBe(false)
  })

  it('uses view-specific current-period labels', () => {
    expect(currentPeriodLabel('week')).toBe('This Week')
    expect(currentPeriodLabel('month')).toBe('This Month')
  })

  it('recognizes deliberate horizontal swipes and maps their directions', () => {
    expect(horizontalSwipeDirection({ x: 180, y: 100 }, { x: 100, y: 106 })).toBe('next')
    expect(horizontalSwipeDirection({ x: 100, y: 100 }, { x: 180, y: 94 })).toBe('previous')
    expect(swipeAmount('next')).toBe(1)
    expect(swipeAmount('previous')).toBe(-1)
  })

  it('ignores movement below the threshold and movement that is mostly vertical', () => {
    expect(horizontalSwipeDirection({ x: 100, y: 100 }, { x: 140, y: 102 })).toBeNull()
    expect(horizontalSwipeDirection({ x: 100, y: 100 }, { x: 155, y: 170 })).toBeNull()
  })

  it('moves week swipes backward and forward without changing interaction intent', () => {
    expect(calendarPeriodSelection('2026-08-24', '2026-08', 'week', 1)).toBe('2026-08-31')
    expect(calendarPeriodSelection('2026-08-24', '2026-08', 'week', -1)).toBe('2026-08-17')
    expect(shouldRevealSelectedDay('week-navigation')).toBe(false)
  })

  it('moves month swipes backward and forward while keeping the selected date in the visible month', () => {
    expect(calendarPeriodSelection('2026-08-24', '2026-08', 'month', 1)).toBe('2026-09-24')
    expect(calendarPeriodSelection('2026-08-24', '2026-08', 'month', -1)).toBe('2026-07-24')
    expect(calendarPeriodSelection('2026-01-31', '2026-01', 'month', 1)).toBe('2026-02-28')
    expect(shouldRevealSelectedDay('month-navigation')).toBe(false)
  })

  it('moves Selected Day in either direction and synchronizes cross-month calendar state', () => {
    expect(selectedDaySelection('2026-08-31', 1)).toEqual({ selectedDate: '2026-09-01', visibleMonth: '2026-09' })
    expect(selectedDaySelection('2026-09-01', -1)).toEqual({ selectedDate: '2026-08-31', visibleMonth: '2026-08' })
  })

  it('keeps a cross-week Selected Day swipe synchronized through the selected date', () => {
    const forward = selectedDaySelection('2026-08-30', 1)
    const backward = selectedDaySelection('2026-08-31', -1)
    expect(forward).toEqual({ selectedDate: '2026-08-31', visibleMonth: '2026-08' })
    expect(backward).toEqual({ selectedDate: '2026-08-30', visibleMonth: '2026-08' })
    expect(weekDates('2026-08-30', 1)[0]).toBe('2026-08-24')
    expect(weekDates(forward.selectedDate, 1)[0]).toBe('2026-08-31')
  })
})
