import type { LogRecord, TimeOfDayBucket, TimePrecision } from '../../domain/models/index.ts'
import type { EventEndpointDraft } from '../../domain/events/EventEngine.ts'

export interface EndpointInputState {
  localDate: string
  localTime: string
  timeOfDay: TimeOfDayBucket | null
  timeOfDayExpanded: boolean
  blankPrecision?: Extract<TimePrecision, 'day' | 'unknown'>
}

export function endpointDraftFromInput(state: EndpointInputState): EventEndpointDraft {
  if (state.localTime) return { localDate: state.localDate, precision: 'exact', localTime: state.localTime }
  if (state.timeOfDay) return { localDate: state.localDate, precision: 'timeOfDay', timeOfDay: state.timeOfDay }
  return { localDate: state.localDate, precision: state.blankPrecision ?? 'day' }
}

function localClockTime(timestamp: string | null, timezone: string | null): string {
  if (!timestamp) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone || undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(timestamp))
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
    return `${value('hour')}:${value('minute')}`
  } catch { return timestamp.slice(11, 16) }
}

export function endpointInputFromRecord(record: LogRecord, endpoint: 'start' | 'end'): EndpointInputState {
  const start = endpoint === 'start'
  const precision = (start ? record.startTimePrecision : record.endTimePrecision) ?? 'day'
  return {
    localDate: (start ? record.localDate : record.endLocalDate) ?? record.localDate,
    localTime: precision === 'exact' ? localClockTime(start ? record.startTime : record.endTime, record.timezone) : '',
    timeOfDay: precision === 'timeOfDay' ? (start ? record.startTimeOfDay : record.endTimeOfDay) : null,
    timeOfDayExpanded: false,
    ...(precision === 'unknown' ? { blankPrecision: 'unknown' as const } : {}),
  }
}
