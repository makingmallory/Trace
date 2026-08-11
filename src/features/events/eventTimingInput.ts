import type { TimeOfDayBucket } from '../../domain/models/index.ts'
import type { EventEndpointDraft } from '../../domain/events/EventEngine.ts'

export interface EndpointInputState {
  localDate: string
  localTime: string
  timeOfDay: TimeOfDayBucket | null
  timeOfDayExpanded: boolean
}

export function endpointDraftFromInput(state: EndpointInputState): EventEndpointDraft {
  if (state.localTime) return { localDate: state.localDate, precision: 'exact', localTime: state.localTime }
  if (state.timeOfDay) return { localDate: state.localDate, precision: 'timeOfDay', timeOfDay: state.timeOfDay }
  return { localDate: state.localDate, precision: 'day' }
}
