import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { DataRole, EventTimingMode, Observation, ObservationAnswer, ObservationOptionSelection, RoutineItem } from '../../domain/models/index.ts'
import type { EventAnswerDraft, EventDefinitionDetails, EventDefinitionDraft, EventLibrary } from '../../domain/events/EventEngine.ts'
import { EventValidationError } from '../../domain/events/EventEngine.ts'
import { timeOfDayDefinitions } from '../../domain/events/eventTiming.ts'
import { localDateFor, currentTimeZone } from '../../domain/checkin/CheckInEngine.ts'
import { builtInIcons, iconGlyph } from '../../presets/iconLibrary.ts'
import { QuestionInput } from '../checkin/QuestionInput.tsx'
import { eventEngine } from './eventEngine.ts'
import { endpointDraftFromInput, endpointInputFromRecord, type EndpointInputState } from './eventTimingInput.ts'
import { homeEventEditPath, homeEventTiming } from './homeEventSummary.ts'
import { ActionIcon } from '../../components/ActionIcons.tsx'

const timingLabels: Record<EventTimingMode, string> = { point: 'Point in time', duration: 'Duration', either: 'Point or duration', dayOnly: 'Day only' }
const roles: readonly { value: DataRole; label: string }[] = [
  { value: 'symptom', label: 'Symptom' }, { value: 'treatment', label: 'Treatment' }, { value: 'behavior', label: 'Behavior' },
  { value: 'exposure', label: 'Exposure' }, { value: 'context', label: 'Context' }, { value: 'measurement', label: 'Measurement' },
  { value: 'outcome', label: 'Outcome' }, { value: 'other', label: 'Other' },
]

function Loading() { return <section className="screen"><p className="save-status">Loading events…</p></section> }

export function QuickLogScreen() {
  const [searchParams] = useSearchParams()
  const historyDate = searchParams.get('date') ?? ''
  const [library, setLibrary] = useState<EventLibrary | null>(null)
  const [recent, setRecent] = useState<readonly EventDefinitionDetails[]>([])
  const [query, setQuery] = useState('')
  useEffect(() => { void Promise.all([eventEngine.getLibrary(), eventEngine.getRecentDefinitions()]).then(([next, recentItems]) => { setLibrary(next); setRecent(recentItems) }) }, [])
  const results = useMemo(() => (library?.active ?? []).filter(({ definition }) => `${definition.name} ${definition.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())), [library, query])
  if (!library) return <Loading />
  return <section className="screen event-picker">
    <header className="screen__heading compact-heading"><Link className="back-link" to="/">← Home</Link><p className="eyebrow">Quick Log</p><h1>What happened?</h1><p className="screen__description">Choose an event type, then save it in a few taps.</p></header>
    {recent.length > 0 && <section className="event-section"><div className="section-heading"><h2>Recent</h2><span>Your latest event types</span></div><div className="event-choice-grid">{recent.map((item) => <EventChoice key={item.definition.id} item={item} historyDate={historyDate} />)}</div></section>}
    <section className="event-section"><div className="section-heading"><h2>All event types</h2><Link to="/events/manage">Manage</Link></div><label className="search-field"><span className="sr-only">Search event types</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events" /></label>
      <div className="event-choice-grid">{results.map((item) => <EventChoice key={item.definition.id} item={item} historyDate={historyDate} />)}</div>{results.length === 0 && <p className="empty-copy">No matching event types.</p>}
    </section>
    <Link className="secondary-button event-create-path" to="/events/manage/new">+ Create Event Type</Link>
  </section>
}

function EventChoice({ item, historyDate }: { item: EventDefinitionDetails; historyDate?: string }) {
  return <Link className="event-choice" to={`/events/log/${item.definition.id}${historyDate ? `?date=${historyDate}` : ''}`}><span aria-hidden="true">{iconGlyph(item.definition.icon)}</span><div><strong>{item.definition.name}</strong><small>{timingLabels[item.definition.timingMode]}</small></div><b aria-hidden="true">→</b></Link>
}

export function LogEventScreen() {
  const { eventDefinitionId = '', recordId = '' } = useParams(); const navigate = useNavigate(); const [searchParams] = useSearchParams()
  const [details, setDetails] = useState<EventDefinitionDetails | null>(null)
  const [answers, setAnswers] = useState<Map<string, EventAnswerDraft>>(new Map())
  const now = useMemo(() => new Date(), [])
  const requestedDate = searchParams.get('date') || localDateFor(now)
  const initialEndpoint = (): EndpointInputState => ({ localDate: requestedDate, localTime: '', timeOfDay: null, timeOfDayExpanded: false })
  const [start, setStart] = useState<EndpointInputState>(initialEndpoint)
  const [end, setEnd] = useState<EndpointInputState>(initialEndpoint)
  const [occurrence, setOccurrence] = useState<'point' | 'duration'>('point')
  const [endsSameDay, setEndsSameDay] = useState(true); const [ongoing, setOngoing] = useState(false)
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  useEffect(() => {
    const load = async () => {
      if (recordId) {
        const existing = await eventEngine.getLoggedEvent(recordId)
        setDetails(existing.details)
        setOccurrence(existing.record.eventTimingKind ?? 'point')
        setStart(endpointInputFromRecord(existing.record, 'start'))
        setEnd(endpointInputFromRecord(existing.record, 'end'))
        setEndsSameDay(!existing.record.endLocalDate || existing.record.endLocalDate === existing.record.localDate)
        setOngoing(existing.record.ongoing)
        setAnswers(new Map(existing.observations.map((observation) => [observation.trackableId, { trackableId: observation.trackableId, answer: observation.answer, selectedOptionIds: existing.selections.filter((item) => item.observationId === observation.id).map((item) => item.optionId) }])))
        return
      }
      const item = await eventEngine.getDetails(eventDefinitionId)
      setDetails(item)
      if (item.definition.timingMode === 'duration') setOccurrence('duration')
    }
    void load().catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load this event type.'))
  }, [eventDefinitionId, recordId])
  if (!details) return error ? <section className="screen"><p className="form-error">{error}</p><Link to="/events">Back to events</Link></section> : <Loading />
  function saveAnswer(trackableId: string, answer: EventAnswerDraft) { setAnswers((current) => new Map(current).set(trackableId, answer)) }
  async function submit(event: FormEvent) {
    if (!details) return
    event.preventDefault(); setBusy(true); setError('')
    try {
      const endInput = endsSameDay ? { ...end, localDate: start.localDate } : end
      const draft = { eventDefinitionId: details.definition.id, timing: { occurrence, start: endpointDraftFromInput(start), ...(occurrence === 'duration' && !ongoing ? { end: endpointDraftFromInput(endInput) } : {}), ongoing: occurrence === 'duration' && ongoing, timezone: currentTimeZone() }, answers: [...answers.values()] }
      const result = recordId ? await eventEngine.updateEvent(recordId, draft) : await eventEngine.logEvent(draft)
      navigate(recordId || searchParams.get('date') ? `/history?date=${result.record.localDate}` : '/', { replace: true, state: { loggedEventId: result.record.id } })
    } catch (caught) { setError(caught instanceof EventValidationError ? caught.issues.join(' ') : caught instanceof Error ? caught.message : 'Could not save this event.') } finally { setBusy(false) }
  }
  return <section className="screen log-event-screen"><header className="event-log-header"><Link className="back-link" to={recordId ? `/history?date=${start.localDate}` : '/events'}>← {recordId ? 'History' : 'Events'}</Link><div className="event-title"><span aria-hidden="true">{iconGlyph(details.definition.icon)}</span><div><p className="eyebrow">{recordId ? 'Edit historical event' : 'Log event'}</p><h1>{details.definition.name}</h1></div></div></header>
    <form className="event-log-form" onSubmit={submit}>
      <section className="event-timing-card"><h2>When?</h2>
        {details.definition.timingMode === 'either' && <fieldset className="occurrence-choice"><legend>Event shape</legend><div><button type="button" aria-pressed={occurrence === 'point'} onClick={() => setOccurrence('point')}>Point</button><button type="button" aria-pressed={occurrence === 'duration'} onClick={() => setOccurrence('duration')}>Duration</button></div></fieldset>}
        {occurrence === 'point'
          ? <PointTimingInput value={start} onChange={setStart} dayOnly={details.definition.timingMode === 'dayOnly'} />
          : <DurationTimingInput start={start} end={end} endsSameDay={endsSameDay} ongoing={ongoing} onStartChange={(next) => { setStart(next); if (end.localDate < next.localDate) setEnd({ ...end, localDate: next.localDate }) }} onEndChange={setEnd} onEndsSameDayChange={setEndsSameDay} onOngoingChange={setOngoing} />}
      </section>
      {details.fields.length > 0 && <section className="event-fields"><div className="section-heading"><h2>Details</h2><span>Optional unless you choose to answer</span></div>{details.fields.map((field) => {
        const saved = answers.get(field.trackable.id); const observation = saved ? localObservation(field.trackable.id, field.field.trackableVersion, saved.answer) : undefined
        const selections = (saved?.selectedOptionIds ?? []).map((optionId) => localSelection(field.trackable.id, optionId))
        const item: RoutineItem = { ...field.field, routineId: 'event-form', target: { kind: 'trackable', trackableId: field.trackable.id }, section: undefined, frequency: 'every_day', trendTrackingMode: 'none', eventReminderBehavior: 'never' }
        return <article className="question-card" key={field.field.id}><div className="question-card__heading"><span aria-hidden="true">{iconGlyph(field.trackable.icon)}</span><div><h3 id={`event-field-${field.field.id}`}>{field.version.name}</h3>{field.version.description && <p>{field.version.description}</p>}</div></div><QuestionInput question={{ item, trackable: field.trackable, version: field.version, options: field.options, category: field.category }} observation={observation} selections={selections} onSave={(next) => saveAnswer(field.trackable.id, { trackableId: field.trackable.id, answer: next.answer, selectedOptionIds: next.selectedOptionIds })} /></article>
      })}</section>}
      {details.fields.length === 0 && <p className="precision-note">This event type has no extra fields, so it is ready to save now. You can add Trackables from Manage event types.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button finish-button" disabled={busy}>{busy ? 'Saving…' : recordId ? 'Save Changes' : `Save ${details.definition.name}`}</button>
    </form>
  </section>
}

function PointTimingInput({ value, onChange, dayOnly }: { value: EndpointInputState; onChange: (value: EndpointInputState) => void; dayOnly: boolean }) {
  return <div className="point-timing"><div className="timing-fields timing-fields--point"><DateInput label="Date" value={value.localDate} onChange={(localDate) => onChange({ ...value, localDate })} />{!dayOnly && <TimeInput label="Time (optional)" value={value.localTime} onChange={(localTime) => onChange({ ...value, localTime, blankPrecision: 'day', ...(localTime ? { timeOfDay: null, timeOfDayExpanded: false } : {}) })} />}</div>{!dayOnly && <TimeOfDayChoices value={value} onChange={onChange} />}</div>
}

function DurationTimingInput({ start, end, endsSameDay, ongoing, onStartChange, onEndChange, onEndsSameDayChange, onOngoingChange }: { start: EndpointInputState; end: EndpointInputState; endsSameDay: boolean; ongoing: boolean; onStartChange: (value: EndpointInputState) => void; onEndChange: (value: EndpointInputState) => void; onEndsSameDayChange: (value: boolean) => void; onOngoingChange: (value: boolean) => void }) {
  return <div className="duration-timing"><fieldset className="timing-endpoint"><legend>Start</legend><div className="timing-fields"><DateInput label="Start date" value={start.localDate} onChange={(localDate) => onStartChange({ ...start, localDate })} /><TimeInput label="Start time (optional)" value={start.localTime} onChange={(localTime) => onStartChange({ ...start, localTime, blankPrecision: 'day', ...(localTime ? { timeOfDay: null, timeOfDayExpanded: false } : {}) })} /></div><TimeOfDayChoices value={start} onChange={onStartChange} /></fieldset>
    <div className="duration-options"><label className="toggle-row"><input type="checkbox" checked={ongoing} onChange={(event) => onOngoingChange(event.target.checked)} /><span>Ongoing</span></label>{!ongoing && <label className="toggle-row"><input type="checkbox" checked={endsSameDay} onChange={(event) => onEndsSameDayChange(event.target.checked)} /><span>Ends same day</span></label>}</div>
    {!ongoing && <fieldset className="timing-endpoint"><legend>End</legend><div className={`timing-fields ${endsSameDay ? 'timing-fields--time-only' : ''}`}>{!endsSameDay && <DateInput label="End date" min={start.localDate} value={end.localDate} onChange={(localDate) => onEndChange({ ...end, localDate })} />}<TimeInput label="End time (optional)" value={end.localTime} onChange={(localTime) => onEndChange({ ...end, localTime, blankPrecision: 'day', ...(localTime ? { timeOfDay: null, timeOfDayExpanded: false } : {}) })} /></div><TimeOfDayChoices value={end} onChange={onEndChange} /></fieldset>}
  </div>
}

function DateInput({ label, value, min, onChange }: { label: string; value: string; min?: string; onChange: (value: string) => void }) {
  return <label className="form-field"><span>{label}</span><input type="date" required min={min} value={value} onInput={(event) => onChange(event.currentTarget.value)} /></label>
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="form-field"><span>{label}</span><input type="time" value={value} onInput={(event) => onChange(event.currentTarget.value)} /></label>
}

function TimeOfDayChoices({ value, onChange }: { value: EndpointInputState; onChange: (value: EndpointInputState) => void }) {
  const selected = value.timeOfDay ? timeOfDayDefinitions.find((item) => item.value === value.timeOfDay) : undefined
  if (selected && !value.timeOfDayExpanded) return <div className="time-of-day-selected"><button type="button" className="time-of-day-card is-selected" aria-label={`${selected.label}, ${selected.conceptualRange}. Change time of day`} onClick={() => onChange({ ...value, timeOfDayExpanded: true })}><span aria-hidden="true">{selected.icon}</span><strong>{selected.label}</strong><small>{selected.conceptualRange}</small></button><button type="button" className="text-button" onClick={() => onChange({ ...value, timeOfDay: null, blankPrecision: 'day' })}>Clear</button></div>
  if (!value.timeOfDayExpanded) return <button type="button" className="time-of-day-trigger" onClick={() => onChange({ ...value, timeOfDayExpanded: true })}>Not sure of the exact time? <strong>Use time of day</strong></button>
  return <fieldset className="time-of-day-choices"><legend>Choose a time of day</legend><div>{timeOfDayDefinitions.map((item) => <button type="button" className="time-of-day-card" aria-pressed={value.timeOfDay === item.value} key={item.value} onClick={() => onChange({ ...value, localTime: '', timeOfDay: item.value, timeOfDayExpanded: false, blankPrecision: 'day' })}><span aria-hidden="true">{item.icon}</span><strong>{item.label}</strong><small>{item.conceptualRange}</small></button>)}</div><button type="button" className="text-button" onClick={() => onChange({ ...value, timeOfDayExpanded: false })}>Cancel</button></fieldset>
}

function localObservation(trackableId: string, trackableVersion: number, answer: ObservationAnswer): Observation { return { id: `draft-${trackableId}`, logRecordId: 'draft', trackableId, trackableVersion, answer, createdAt: '', updatedAt: '', deletedAt: null, revision: 1 } }
function localSelection(trackableId: string, optionId: string): ObservationOptionSelection { return { id: `draft-${trackableId}-${optionId}`, observationId: `draft-${trackableId}`, optionId, createdAt: '', updatedAt: '', deletedAt: null, revision: 1 } }

export function ManageEventsScreen() {
  const [library, setLibrary] = useState<EventLibrary | null>(null); const [error, setError] = useState('')
  const load = () => void eventEngine.getLibrary().then(setLibrary).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load event types.'))
  useEffect(load, [])
  async function toggle(id: string, active: boolean) { try { await eventEngine.setDefinitionActive(id, active); load() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update event type.') } }
  if (!library) return <Loading />
  return <section className="screen manage-events"><header className="screen__heading compact-heading"><Link className="back-link" to="/events">← Quick Log</Link><p className="eyebrow">Settings</p><h1>Event Types</h1><p className="screen__description">Shape the quick-log choices around what matters to you.</p></header><Link className="primary-button button-link" to="/events/manage/new">+ Create Event Type</Link>
    {error && <p className="form-error">{error}</p>}<div className="event-manage-list">{library.active.map((item) => <EventManageCard key={item.definition.id} item={item} active action={() => void toggle(item.definition.id, false)} />)}</div>
    {library.archived.length > 0 && <section className="event-section"><div className="section-heading"><h2>Archived</h2></div><div className="event-manage-list">{library.archived.map((item) => <EventManageCard key={item.definition.id} item={item} active={false} action={() => void toggle(item.definition.id, true)} />)}</div></section>}
  </section>
}

function EventManageCard({ item, active, action }: { item: EventDefinitionDetails; active: boolean; action: () => void }) { return <article className="event-manage-card"><span className="emoji-icon" aria-hidden="true">{iconGlyph(item.definition.icon)}</span><div className="management-row__copy"><h2>{item.definition.name}</h2><p>{timingLabels[item.definition.timingMode]} · {item.fields.length} {item.fields.length === 1 ? 'field' : 'fields'}</p></div><div className="card-actions"><Link className="management-icon-button" aria-label={`Edit ${item.definition.name}`} title="Edit" to={`/events/manage/${item.definition.id}`}><ActionIcon name="edit" /></Link><button type="button" className={`management-icon-button${active ? ' management-icon-button--danger' : ''}`} aria-label={`${active ? 'Archive' : 'Reactivate'} ${item.definition.name}`} title={active ? 'Archive' : 'Reactivate'} onClick={action}><ActionIcon name={active ? 'archive' : 'show'} /></button></div></article> }

export function EventEditorScreen() {
  const { eventDefinitionId } = useParams(); const navigate = useNavigate(); const [library, setLibrary] = useState<EventLibrary | null>(null); const [details, setDetails] = useState<EventDefinitionDetails | undefined>(); const [draft, setDraft] = useState<EventDefinitionDraft | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { void eventEngine.getLibrary().then(async (next) => { setLibrary(next); const item = eventDefinitionId ? await eventEngine.getDetails(eventDefinitionId) : undefined; setDetails(item); setDraft(item ? { name: item.definition.name, description: item.definition.description, categoryId: item.definition.categoryId, icon: item.definition.icon, timingMode: item.definition.timingMode, dataRole: item.definition.dataRole, trackableIds: item.fields.map((field) => field.trackable.id) } : { name: '', categoryId: next.categories.find((item) => item.active)?.id ?? '', icon: { type: 'library', value: 'sparkle' }, timingMode: 'point', dataRole: 'other', trackableIds: [] }) }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load the editor.')) }, [eventDefinitionId])
  if (!library || !draft) return error ? <section className="screen"><p className="form-error">{error}</p></section> : <Loading />
  function addField(id: string) { if (!draft || draft.trackableIds.includes(id)) return; setDraft({ ...draft, trackableIds: [...draft.trackableIds, id] }) }
  function moveField(index: number, direction: -1 | 1) { if (!draft) return; const next = [...draft.trackableIds]; const swap = index + direction; if (swap < 0 || swap >= next.length) return; [next[index], next[swap]] = [next[swap], next[index]]; setDraft({ ...draft, trackableIds: next }) }
  async function submit(event: FormEvent) { event.preventDefault(); const submitted = draft; if (!submitted) return; setBusy(true); setError(''); try { if (details) await eventEngine.updateDefinition(details.definition.id, submitted); else await eventEngine.createDefinition(submitted); navigate('/events/manage') } catch (caught) { setError(caught instanceof EventValidationError ? caught.issues.join(' ') : caught instanceof Error ? caught.message : 'Could not save this event type.') } finally { setBusy(false) } }
  const available = library.availableTrackables.filter((item) => !draft.trackableIds.includes(item.trackable.id))
  return <section className="screen event-editor"><header className="screen__heading compact-heading"><Link className="back-link" to="/events/manage">← Event Types</Link><p className="eyebrow">{details ? 'Edit' : 'Create'}</p><h1>{details ? details.definition.name : 'Create Event Type'}</h1></header><form className="trackable-form trackable-editor-form" onSubmit={submit}>
    <label className="form-field"><span>Name</span><input required maxLength={100} autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Physical therapy" /></label><label className="form-field"><span>Description <small>optional</small></span><textarea rows={2} value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
    <div className="form-row"><label className="form-field"><span>Category</span><select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>{library.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-field"><span>Timing</span><select value={draft.timingMode} onChange={(event) => setDraft({ ...draft, timingMode: event.target.value as EventTimingMode })}>{Object.entries(timingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <div className="form-row"><label className="form-field"><span>Data role</span><select value={draft.dataRole} onChange={(event) => setDraft({ ...draft, dataRole: event.target.value as DataRole })}>{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="form-field"><span>Icon</span><select value={draft.icon?.type === 'library' ? draft.icon.value : 'sparkle'} onChange={(event) => setDraft({ ...draft, icon: { type: 'library', value: event.target.value } })}>{builtInIcons.map((item) => <option key={item.id} value={item.id}>{item.glyph} {item.label}</option>)}</select></label></div>
    <fieldset className="event-field-editor"><legend>Event fields</legend><p>Add existing active Trackables as optional questions. Removing one here never deletes the Trackable.</p>{draft.trackableIds.length === 0 && <p className="empty-copy">No extra fields yet.</p>}<ol>{draft.trackableIds.map((id, index) => { const item = library.availableTrackables.find((entry) => entry.trackable.id === id); if (!item) return null; return <li key={id}><span>{iconGlyph(item.trackable.icon)}</span><strong>{item.version.name}</strong><div><button type="button" aria-label={`Move ${item.version.name} up`} disabled={index === 0} onClick={() => moveField(index, -1)}>↑</button><button type="button" aria-label={`Move ${item.version.name} down`} disabled={index === draft.trackableIds.length - 1} onClick={() => moveField(index, 1)}>↓</button><button type="button" className="text-button text-button--danger" onClick={() => setDraft({ ...draft, trackableIds: draft.trackableIds.filter((itemId) => itemId !== id) })}>Remove</button></div></li> })}</ol>{available.length > 0 ? <label className="form-field"><span>Add a Trackable</span><select value="" onChange={(event) => addField(event.target.value)}><option value="">Choose a Trackable…</option>{available.map((item) => <option key={item.trackable.id} value={item.trackable.id}>{item.version.name}</option>)}</select></label> : <p className="precision-note">Create or reactivate Trackables to add more fields.</p>}</fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="editor-actions"><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : details ? 'Save Changes' : 'Create Event Type'}</button><Link className="secondary-button" to="/events/manage">Cancel</Link></div>
  </form></section>
}

export function TodayEvents({ localDate }: { localDate: string }) {
  const [events, setEvents] = useState<Awaited<ReturnType<typeof eventEngine.getEventsForDate>>>([])
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { void eventEngine.getEventsForDate(localDate).then(setEvents) }, [localDate])
  if (!events.length) return null
  const visible = expanded ? events : events.slice(0, 3)
  const additionalCount = events.length - visible.length
  return <div className="today-events"><strong>Events</strong><ul>{visible.map(({ record, definition }) => {
    const timing = homeEventTiming(record)
    return <li key={record.id}><Link to={homeEventEditPath(record.id)} aria-label={`Open ${definition.name}`}><span className="today-event__icon emoji-icon" aria-hidden="true">{iconGlyph(definition.icon)}</span><span className="today-event__name">{definition.name}</span>{timing ? <small className="today-event__timing">· {timing}</small> : null}</Link></li>
  })}</ul>{additionalCount > 0 ? <button type="button" className="today-events__more" aria-expanded={expanded} onClick={() => setExpanded(true)}>+{additionalCount}</button> : expanded && events.length > 3 ? <button type="button" className="today-events__more" aria-expanded="true" onClick={() => setExpanded(false)}>Show Fewer</button> : null}</div>
}
