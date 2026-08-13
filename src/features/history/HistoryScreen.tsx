import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  buildCalendarSummaries, buildDayDetail, buildWeekAgenda, calendarDates, calendarMetricOptions,
  groupHistoryResults, historySearchSuggestions, monthKey, projectCalendarMetric, searchHistory, sliceHistoryGroup,
  shiftLocalDate, shiftMonth, weekDates, type CalendarDaySummary, type HistoryAgendaDay,
  type CalendarMetricIdentity, type CalendarMetricOption, type HistoryData, type HistorySearchFilters, type HistorySearchResponse, type HistorySearchResult, type MetricDayValue,
} from '../../domain/history/HistoryEngine.ts'
import { localDateFor } from '../../domain/checkin/CheckInEngine.ts'
import { iconGlyph } from '../../presets/iconLibrary.ts'
import { clearCalendarFormatting } from './calendarFormatting.ts'
import { historyEngine } from './historyEngine.ts'

const validDate = /^\d{4}-\d{2}-\d{2}$/

function dateLabel(localDate: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${localDate}T12:00:00`))
}

function statusLabel(status: 'draft' | 'completed' | null): string {
  if (status === 'completed') return 'Completed Check-In'
  if (status === 'draft') return 'Draft Check-In'
  return ''
}

type CalendarView = 'month' | 'week'
type SearchFilterDraft = { from: string; to: string; recordType: 'all' | 'event' | 'check-in' }

const emptySearchFilters: SearchFilterDraft = { from: '', to: '', recordType: 'all' }

function activeFilters(draft: SearchFilterDraft): HistorySearchFilters {
  return {
    ...(draft.from ? { from: draft.from } : {}),
    ...(draft.to ? { to: draft.to } : {}),
    ...(draft.recordType !== 'all' ? { recordType: draft.recordType } : {}),
  }
}

function weekLabel(dates: readonly string[]): string {
  const first = dates[0]; const last = dates.at(-1)
  if (!first || !last) return ''
  const firstMonth = dateLabel(first, { month: 'short' })
  const lastMonth = dateLabel(last, { month: 'short' })
  const year = dateLabel(last, { year: 'numeric' })
  return firstMonth === lastMonth
    ? `${firstMonth} ${Number(first.slice(-2))}–${Number(last.slice(-2))}, ${year}`
    : `${firstMonth} ${Number(first.slice(-2))}–${lastMonth} ${Number(last.slice(-2))}, ${year}`
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
}

function EditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7" /><path d="M10 11v5m4-5v5" /></svg>
}

function PaletteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.25a2.25 2.25 0 0 0 0-4.5h-.75a1.75 1.75 0 0 1 0-3.5H16A5 5 0 0 0 21 8c0-2.75-4.03-5-9-5Z" /><circle cx="7.5" cy="10" r=".75" /><circle cx="10" cy="6.75" r=".75" /><circle cx="15" cy="7" r=".75" /></svg>
}

export function HistoryScreen() {
  const today = useMemo(() => localDateFor(new Date()), [])
  const [searchParams, setSearchParams] = useSearchParams()
  const initialDate = searchParams.get('date')
  const [selectedDate, setSelectedDate] = useState(initialDate && validDate.test(initialDate) ? initialDate : today)
  const [visibleMonth, setVisibleMonth] = useState(monthKey(selectedDate))
  const [calendarView, setCalendarView] = useState<CalendarView>('week')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [colorOpen, setColorOpen] = useState(false)
  const colorButtonRef = useRef<HTMLButtonElement>(null)
  const colorPanelRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<HistoryData | null>(null)
  const [calendarFormatting, setCalendarFormatting] = useState(clearCalendarFormatting)
  const [metricQuery, setMetricQuery] = useState('')
  const [query, setQuery] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [activeQuery, setActiveQuery] = useState('')
  const [filterDraft, setFilterDraft] = useState<SearchFilterDraft>(emptySearchFilters)
  const [searchFilters, setSearchFilters] = useState<HistorySearchFilters>({})
  const [undo, setUndo] = useState<{ recordId: string; label: string } | null>(null)
  const [pendingRecordAnchor, setPendingRecordAnchor] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = () => void historyEngine.load().then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load History.'))
  useEffect(load, [])

  const summaries = useMemo(() => data ? buildCalendarSummaries(data, today) : new Map<string, CalendarDaySummary>(), [data, today])
  const firstDayOfWeek = data?.settings.find((item) => !item.deletedAt)?.firstDayOfWeek ?? 0
  const { metricId, heatmap } = calendarFormatting
  const metricOptions = useMemo(() => data ? calendarMetricOptions(data) : [], [data])
  const filteredMetricOptions = useMemo(() => metricOptions.filter((option) => option.name.toLowerCase().includes(metricQuery.trim().toLowerCase())), [metricOptions, metricQuery])
  const selectedMetric = metricId === 'none' ? undefined : metricOptions.find((option) => option.identity === metricId)
  const selectedMetricName = selectedMetric?.name
  const metricValues = useMemo(() => {
    if (!data || metricId === 'none') return new Map<string, MetricDayValue>()
    return projectCalendarMetric(data, metricId, today, heatmap)
  }, [data, heatmap, metricId, today])
  const dates = useMemo(() => calendarView === 'month' ? calendarDates(visibleMonth, firstDayOfWeek) : weekDates(selectedDate, firstDayOfWeek), [calendarView, firstDayOfWeek, selectedDate, visibleMonth])
  const weekAgenda = useMemo(() => data && calendarView === 'week' ? buildWeekAgenda(data, dates, today) : [], [calendarView, data, dates, today])
  const detail = useMemo(() => data ? buildDayDetail(data, selectedDate, today) : null, [data, selectedDate, today])
  const hasSearchFilters = Boolean(searchFilters.from || searchFilters.to || searchFilters.recordType)
  const results: HistorySearchResponse | null = useMemo(() => data && (activeQuery || hasSearchFilters) ? searchHistory(data, activeQuery, today, searchFilters) : null, [activeQuery, data, hasSearchFilters, searchFilters, today])
  const suggestions = useMemo(() => data ? historySearchSuggestions(data, query) : [], [data, query])

  useEffect(() => {
    if (!colorOpen) return
    function dismissFormatting(event: PointerEvent) {
      const target = event.target as Node
      if (!colorButtonRef.current?.contains(target) && !colorPanelRef.current?.contains(target)) setColorOpen(false)
    }
    function dismissFormattingWithEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      setColorOpen(false)
      window.requestAnimationFrame(() => colorButtonRef.current?.focus())
    }
    document.addEventListener('pointerdown', dismissFormatting)
    document.addEventListener('keydown', dismissFormattingWithEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissFormatting)
      document.removeEventListener('keydown', dismissFormattingWithEscape)
    }
  }, [colorOpen])

  useEffect(() => {
    if (calendarView !== 'week') return
    window.requestAnimationFrame(() => {
      const day = document.querySelector<HTMLElement>(`[data-agenda-date="${selectedDate}"]`)
      const scroller = day?.closest<HTMLElement>('.week-agenda-scroller')
      if (!day || !scroller) return
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      scroller.scrollTo({ left: day.offsetLeft - (scroller.clientWidth - day.clientWidth) / 2, behavior: reduced ? 'auto' : 'smooth' })
    })
  }, [calendarView, dates, selectedDate, weekAgenda])

  useEffect(() => {
    if (!pendingRecordAnchor || !detail) return
    window.requestAnimationFrame(() => {
      const target = document.getElementById(pendingRecordAnchor)
      if (!target) return
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
      target.focus({ preventScroll: true })
      setPendingRecordAnchor(null)
    })
  }, [detail, pendingRecordAnchor])

  function selectDate(localDate: string) {
    setSelectedDate(localDate)
    setVisibleMonth(monthKey(localDate))
    setSearchParams({ date: localDate }, { replace: true })
  }

  function handleCalendarKey(event: KeyboardEvent<HTMLButtonElement>, localDate: string) {
    const movements: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    const amount = movements[event.key]
    if (!amount) return
    event.preventDefault()
    const next = shiftLocalDate(localDate, amount)
    selectDate(next)
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-calendar-date="${next}"]`)?.focus())
  }

  async function remove(recordId: string, label: string) {
    setError('')
    try { await historyEngine.softDelete(recordId); setUndo({ recordId, label }); load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this record.') }
  }

  async function restore() {
    if (!undo) return
    setError('')
    try { await historyEngine.restore(undo.recordId); setUndo(null); load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not restore this record.') }
  }

  function submitSearch(searchQuery = query) {
    setActiveQuery(searchQuery.trim())
    setSearchFilters(activeFilters(filterDraft))
    setSuggestionsOpen(false)
    setActiveSuggestion(-1)
  }

  function selectSuggestion(label: string) {
    setQuery(label)
    submitSearch(label)
  }

  function handleSuggestionKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setSuggestionsOpen(false)
      setActiveSuggestion(-1)
      return
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
      event.preventDefault()
      setSuggestionsOpen(true)
      setActiveSuggestion((current) => event.key === 'ArrowDown'
        ? (current + 1) % suggestions.length
        : (current <= 0 ? suggestions.length - 1 : current - 1))
      return
    }
    if (event.key === 'Enter' && suggestionsOpen && activeSuggestion >= 0) {
      event.preventDefault()
      selectSuggestion(suggestions[activeSuggestion].label)
    }
  }

  function clearFilters() {
    setFilterDraft(emptySearchFilters)
    setSearchFilters({})
  }

  function clearSearch() {
    setQuery('')
    setActiveQuery('')
    setSuggestionsOpen(false)
    setActiveSuggestion(-1)
    clearFilters()
  }

  function toggleSearch() {
    if (searchOpen) {
      setSearchOpen(false)
      return
    }
    setSearchOpen(true)
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  function changeView(view: CalendarView) {
    setCalendarView(view)
    if (view === 'month') setVisibleMonth(monthKey(selectedDate))
  }

  function moveCalendar(amount: -1 | 1) {
    if (calendarView === 'month') setVisibleMonth(shiftMonth(visibleMonth, amount))
    else selectDate(shiftLocalDate(selectedDate, amount * 7))
  }

  function selectAgendaRecord(localDate: string, recordId: string) {
    selectDate(localDate)
    setPendingRecordAnchor(`history-record-${recordId}`)
  }

  if (!data) return <section className="screen history-screen"><p className="save-status">{error || 'Opening History…'}</p></section>
  const hasRecords = data.logRecords.some((item) => !item.deletedAt)
  const calendarTitle = calendarView === 'month' ? dateLabel(`${visibleMonth}-01`, { month: 'long', year: 'numeric' }) : weekLabel(dates)

  return <section className="screen history-screen">
    <header className="history-header"><div><p className="eyebrow">Your records</p><h1>History</h1><p className="screen__description">Find what you logged, revisit a day, or gently correct the past.</p></div><button type="button" className={`history-search-toggle${searchOpen ? ' is-active' : ''}`} aria-label="Search history" aria-expanded={searchOpen} aria-controls="history-search-panel" onClick={toggleSearch}><SearchIcon /></button></header>
    {searchOpen ? <form id="history-search-panel" className="history-search" role="search" onSubmit={(event) => { event.preventDefault(); submitSearch() }}>
      <div className="history-search-field"><label className="form-field"><span>Search History</span><input ref={searchInputRef} type="search" role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen && Boolean(suggestions.length)} aria-controls="history-search-suggestions" aria-activedescendant={activeSuggestion >= 0 ? `history-suggestion-${activeSuggestion}` : undefined} value={query} onFocus={() => setSuggestionsOpen(Boolean(query.trim()))} onChange={(event) => { setQuery(event.target.value); setSuggestionsOpen(Boolean(event.target.value.trim())); setActiveSuggestion(-1) }} onKeyDown={handleSuggestionKey} placeholder="Search events, symptoms, notes…" /></label>{suggestionsOpen && suggestions.length ? <div id="history-search-suggestions" className="history-search-suggestions" role="listbox" aria-label="History search suggestions">{suggestions.map((suggestion, index) => <button id={`history-suggestion-${index}`} type="button" role="option" aria-selected={activeSuggestion === index} className={activeSuggestion === index ? 'is-active' : ''} key={suggestion.label.toLowerCase()} onClick={() => selectSuggestion(suggestion.label)}>{suggestion.label}</button>)}</div> : null}</div>
      <button className="primary-button">Search</button>
      {activeQuery || hasSearchFilters ? <button type="button" className="text-button" onClick={clearSearch}>Clear All</button> : null}
      <details className="history-advanced-search">
        <summary>Advanced search</summary>
        <div className="advanced-search__fields">
          <label className="form-field"><span>From</span><input type="date" value={filterDraft.from} max={filterDraft.to || undefined} onChange={(event) => setFilterDraft((current) => ({ ...current, from: event.target.value }))} /></label>
          <label className="form-field"><span>To</span><input type="date" value={filterDraft.to} min={filterDraft.from || undefined} onChange={(event) => setFilterDraft((current) => ({ ...current, to: event.target.value }))} /></label>
          <label className="form-field"><span>Record type</span><select value={filterDraft.recordType} onChange={(event) => setFilterDraft((current) => ({ ...current, recordType: event.target.value as SearchFilterDraft['recordType'] }))}><option value="all">All</option><option value="event">Quick Logs</option><option value="check-in">Check-Ins</option></select></label>
        </div>
        <button type="button" className="text-button" onClick={clearFilters}>Clear Filters</button>
      </details>
    </form> : null}
    {results ? <SearchResults key={`${activeQuery}:${searchFilters.from ?? ''}:${searchFilters.to ?? ''}:${searchFilters.recordType ?? ''}`} response={results} onSelect={selectDate} /> : null}
    {undo ? <div className="history-undo" role="status"><span>{undo.label} moved to Recently Deleted.</span><button className="text-button" onClick={() => void restore()}>Undo</button></div> : null}
    {error ? <p className="notice notice--error" role="alert">{error}</p> : null}

    <section className="history-calendar-card" aria-labelledby="history-calendar-heading">
      <div className="history-calendar-toolbar"><div className="history-calendar-title-row"><div><p className="eyebrow">Calendar</p><h2 id="history-calendar-heading">{calendarTitle}</h2></div><button ref={colorButtonRef} type="button" className={`calendar-color-toggle${colorOpen ? ' is-active' : ''}`} aria-label="Format Calendar" aria-expanded={colorOpen} aria-controls="calendar-color-panel" onClick={() => setColorOpen((open) => !open)}><PaletteIcon /></button></div><div className="history-calendar-controls"><div className="history-view-switch" aria-label="Calendar view"><button type="button" className={calendarView === 'month' ? 'is-active' : ''} aria-pressed={calendarView === 'month'} onClick={() => changeView('month')}>Month</button><button type="button" className={calendarView === 'week' ? 'is-active' : ''} aria-pressed={calendarView === 'week'} onClick={() => changeView('week')}>Week</button></div><div className="calendar-actions"><button type="button" aria-label={`Previous ${calendarView}`} onClick={() => moveCalendar(-1)}>←</button><button type="button" onClick={() => selectDate(today)}>Today</button><button type="button" aria-label={`Next ${calendarView}`} onClick={() => moveCalendar(1)}>→</button></div></div></div>
      {colorOpen ? <CalendarFormattingPanel panelRef={colorPanelRef} options={filteredMetricOptions} totalOptions={metricOptions.length} selected={selectedMetric} metricId={metricId} metricQuery={metricQuery} heatmap={heatmap} valueCount={metricValues.size} onQueryChange={setMetricQuery} onSelect={(nextMetricId) => setCalendarFormatting((current) => ({ ...current, metricId: nextMetricId }))} onHeatmapChange={(nextHeatmap) => setCalendarFormatting((current) => ({ ...current, heatmap: nextHeatmap }))} onClear={() => { setCalendarFormatting(clearCalendarFormatting()); setMetricQuery('') }} /> : null}
      {calendarView === 'month' ? <MonthCalendar dates={dates} visibleMonth={visibleMonth} selectedDate={selectedDate} firstDayOfWeek={firstDayOfWeek} summaries={summaries} metricValues={metricValues} metricName={selectedMetricName} onSelect={selectDate} onKeyDown={handleCalendarKey} title={calendarTitle} /> : <WeekAgenda days={weekAgenda} selectedDate={selectedDate} today={today} metricValues={metricValues} metricName={selectedMetricName} onSelect={selectDate} onSelectRecord={selectAgendaRecord} />}
      {calendarView === 'month' ? <div className="calendar-legend"><span><b>✓</b> Completed</span><span><b>◔</b> Draft</span><span><b>✦</b> Events</span></div> : null}
    </section>
    {!hasRecords ? <div className="empty-state"><span aria-hidden="true">◷</span><h2>Your History starts here</h2><p>Complete a Check-In or add a Quick Log, and it will appear on this calendar.</p><Link className="primary-button button-link" to="/">Go to Home</Link></div> : detail ? <DayDetail detail={detail} onDelete={remove} /> : null}
  </section>
}

function CalendarFormattingPanel({ panelRef, options, totalOptions, selected, metricId, metricQuery, heatmap, valueCount, onQueryChange, onSelect, onHeatmapChange, onClear }: {
  panelRef: RefObject<HTMLDivElement | null>
  options: readonly CalendarMetricOption[]
  totalOptions: number
  selected?: CalendarMetricOption
  metricId: 'none' | CalendarMetricIdentity
  metricQuery: string
  heatmap: boolean
  valueCount: number
  onQueryChange: (value: string) => void
  onSelect: (value: CalendarMetricIdentity) => void
  onHeatmapChange: (value: boolean) => void
  onClear: () => void
}) {
  return <div ref={panelRef} id="calendar-color-panel" className="calendar-color-panel" role="dialog" aria-label="Calendar Formatting">
    <div className="calendar-color-panel__header"><div><strong>Calendar Formatting</strong><span>{selected ? `${selected.name} · ${selected.kind}` : 'None'}</span></div><button type="button" className="text-button calendar-format-clear" disabled={metricId === 'none' && !heatmap} onClick={onClear}>Clear</button></div>
    <label className="calendar-metric-search"><span>Color by</span><input type="search" value={metricQuery} onChange={(event) => onQueryChange(event.target.value)} placeholder="Find a Daily Value or Occurrence Trackable" /></label>
    {totalOptions ? <div className="calendar-metric-options" role="listbox" aria-label="Color calendar by">
      {options.map((option) => <button type="button" role="option" aria-selected={metricId === option.identity} className={metricId === option.identity ? 'is-selected' : ''} key={option.identity} onClick={() => onSelect(option.identity)}><span>{option.name}</span><small className={`metric-kind-badge metric-kind-badge--${option.kind.toLowerCase()}`}>{option.kind}</small></button>)}
      {!options.length ? <p>No matching Trackables.</p> : null}
    </div> : <p>No supported Trackables are available yet.</p>}
    <label className={`calendar-heatmap-toggle${selected ? '' : ' is-disabled'}`}><span><strong>Heatmap</strong><small>Scale color across your observed history.</small></span><input type="checkbox" checked={heatmap} disabled={!selected} onChange={(event) => onHeatmapChange(event.target.checked)} /></label>
    <div className="calendar-color-panel__help">{selected && !valueCount ? <p>No historical {selected.kind === 'Occurrence' ? 'entries' : 'values'} are recorded for {selected.name} yet.</p> : selected && heatmap ? <><p>Intensity uses the observed historical range.</p><div className="heatmap-legend" aria-label={`${selected.name} heatmap scale from lower to higher`}><span>Lower</span><i aria-hidden="true" /><span>Higher</span></div></> : selected?.kind === 'Occurrence' ? <p>Days with {selected.name} are marked; daily counts stay visible.</p> : selected ? <p>{selected.name} values are shown on applicable days.</p> : <p>Choose a Trackable to color the calendar.</p>}</div>
  </div>
}

function MonthCalendar({ dates, visibleMonth, selectedDate, firstDayOfWeek, summaries, metricValues, metricName, onSelect, onKeyDown, title }: {
  dates: readonly string[]; visibleMonth: string; selectedDate: string; firstDayOfWeek: number
  summaries: ReadonlyMap<string, CalendarDaySummary>; metricValues: ReadonlyMap<string, MetricDayValue>; metricName?: string
  onSelect: (localDate: string) => void; onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, localDate: string) => void; title: string
}) {
  return <><div className="calendar-weekdays" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((_, index, days) => days[(index + firstDayOfWeek) % 7]).map((day) => <span key={day}>{day}</span>)}</div><div className="history-calendar-grid" role="grid" aria-label={`${title} History`}>
    {dates.map((localDate) => {
      const summary = summaries.get(localDate); const metric = metricValues.get(localDate); const outside = monthKey(localDate) !== visibleMonth
      const accessible = [dateLabel(localDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), statusLabel(summary?.checkInStatus ?? null), summary?.eventCount ? `${summary.eventCount} ${summary.eventCount === 1 ? 'event' : 'events'}` : '', metric ? `${metricName}: ${metric.display}` : ''].filter(Boolean).join(', ')
      return <button type="button" role="gridcell" data-calendar-date={localDate} aria-label={accessible} aria-selected={selectedDate === localDate} className={`calendar-day${outside ? ' calendar-day--outside' : ''}${selectedDate === localDate ? ' is-selected' : ''}${metric ? ` metric-level-${Math.max(1, Math.round(metric.level * 4))}` : ''}`} key={localDate} onClick={() => onSelect(localDate)} onKeyDown={(event) => onKeyDown(event, localDate)}>
        <span className="calendar-day__number">{Number(localDate.slice(-2))}</span>{metric ? <span className="calendar-day__metric">{metric.display}</span> : null}<span className="calendar-day__signals"><span>{summary?.checkInStatus === 'completed' ? '✓' : summary?.checkInStatus === 'draft' ? '◔' : ''}</span><span>{summary?.eventIcons.slice(0, 2).map((icon, index) => <i key={`${icon.value}-${index}`}>{iconGlyph(icon)}</i>)}{summary && summary.eventCount > 2 ? <b>+{summary.eventCount - 2}</b> : null}</span></span>
      </button>
    })}
  </div></>
}

function WeekAgenda({ days, selectedDate, today, metricValues, metricName, onSelect, onSelectRecord }: { days: readonly HistoryAgendaDay[]; selectedDate: string; today: string; metricValues: ReadonlyMap<string, MetricDayValue>; metricName?: string; onSelect: (localDate: string) => void; onSelectRecord: (localDate: string, recordId: string) => void }) {
  return <div className="week-agenda-scroller" aria-label="Weekly agenda"><div className="week-agenda">
    {days.map((day) => { const metric = metricValues.get(day.localDate); return <section key={day.localDate} data-agenda-date={day.localDate} className={`week-agenda__day${day.localDate === selectedDate ? ' is-selected' : ''}${day.localDate === today ? ' is-today' : ''}${metric ? ` metric-level-${Math.max(1, Math.round(metric.level * 4))}` : ''}`} aria-labelledby={`week-day-${day.localDate}`} aria-label={metric ? `${dateLabel(day.localDate, { weekday: 'long', month: 'long', day: 'numeric' })}, ${metricName}: ${metric.display}` : undefined} onClick={() => onSelect(day.localDate)}>
      <button type="button" className="week-agenda__header" onClick={() => onSelect(day.localDate)} aria-current={day.localDate === today ? 'date' : undefined}><span>{dateLabel(day.localDate, { weekday: 'short' })}</span><strong id={`week-day-${day.localDate}`}>{Number(day.localDate.slice(-2))}</strong>{metric ? <small className="week-agenda__metric">{metric.display}</small> : null}</button>
      <div className="week-agenda__records">{day.records.length ? day.records.map((record) => record.kind === 'check-in' ? <button type="button" data-record-id={record.recordId} className="agenda-record agenda-record--checkin" key={record.recordId} onClick={(event) => { event.stopPropagation(); onSelectRecord(day.localDate, record.recordId) }}><span aria-hidden="true">{record.status === 'completed' ? '✓' : '◔'}</span><span><strong>Nightly Check-In</strong><small>{record.summary}</small></span></button> : <button type="button" data-record-id={record.recordId} className="agenda-record agenda-record--event" key={record.recordId} onClick={(event) => { event.stopPropagation(); onSelectRecord(day.localDate, record.recordId) }}><span aria-hidden="true">{iconGlyph(record.icon)}</span><span><strong>{record.name}</strong>{record.timing !== 'Date only' ? <small>{record.timing}</small> : null}</span></button>) : <p className="week-agenda__empty">No records</p>}</div>
    </section>})}
  </div></div>
}

function SearchResults({ response, onSelect }: { response: HistorySearchResponse; onSelect: (localDate: string) => void }) {
  const [recentExpanded, setRecentExpanded] = useState(false)
  const [earlierExpanded, setEarlierExpanded] = useState(false)
  const groups = useMemo(() => groupHistoryResults(response.results), [response.results])
  if (!response.results.length) return <section className="history-results" aria-live="polite"><div className="section-heading"><div><p className="eyebrow">Search results</p><h2>No matches</h2></div></div><p className="empty-copy">Try a Quick Log name, Trackable, option, category, or note text.</p></section>
  if (response.isLastOccurrence) return <section className="history-results" aria-live="polite"><div className="section-heading"><div><p className="eyebrow">Last occurrence</p><h2>{response.totalMatches} {response.totalMatches === 1 ? 'match' : 'matches'}</h2></div></div><HistoryResultList results={response.results} onSelect={onSelect} /></section>
  const recent = sliceHistoryGroup(groups.recent, 8, recentExpanded)
  const earlier = sliceHistoryGroup(groups.earlier, 5, earlierExpanded)
  return <section className="history-results" aria-live="polite"><div className="section-heading"><div><p className="eyebrow">Search results</p><h2>{response.totalMatches} {response.totalMatches === 1 ? 'match' : 'matches'}</h2></div></div>
    {groups.recent.length ? <section className="history-result-group" aria-labelledby="history-recent-results"><h3 id="history-recent-results">Recent</h3><HistoryResultList results={recent.visible} onSelect={onSelect} />{recent.hiddenCount ? <button type="button" className="text-button history-see-more" onClick={() => setRecentExpanded(true)}>See more ({recent.hiddenCount})</button> : null}</section> : null}
    {groups.earlier.length ? <section className="history-result-group" aria-labelledby="history-earlier-results"><h3 id="history-earlier-results">Earlier</h3><HistoryResultList results={earlier.visible} onSelect={onSelect} />{earlier.hiddenCount ? <button type="button" className="text-button history-see-more" onClick={() => setEarlierExpanded(true)}>See more ({earlier.hiddenCount})</button> : null}</section> : null}
  </section>
}

function HistoryResultList({ results, onSelect }: { results: readonly HistorySearchResult[]; onSelect: (localDate: string) => void }) {
  return <div className="history-result-list">{results.map((result) => <button type="button" key={result.recordId} onClick={() => onSelect(result.localDate)}><span className="history-result__date">{dateLabel(result.localDate, { month: 'short', day: 'numeric', year: 'numeric' })}</span><strong>{result.identity}</strong><small>{result.context}{result.daysAgo === 0 ? ' · Today' : ` · ${result.daysAgo} days ago`}</small></button>)}</div>
}

function RecordAction({ label, title, danger = false, children, to, onClick }: { label: string; title: string; danger?: boolean; children: ReactNode; to?: string; onClick?: () => void }) {
  const className = `record-icon-action${danger ? ' record-icon-action--danger' : ''}`
  return to ? <Link className={className} to={to} aria-label={label} title={title}>{children}</Link> : <button type="button" className={className} onClick={onClick} aria-label={label} title={title}>{children}</button>
}

function DayDetail({ detail, onDelete }: { detail: ReturnType<typeof buildDayDetail>; onDelete: (recordId: string, label: string) => Promise<void> }) {
  return <section className="day-detail" aria-labelledby="day-detail-heading"><div className="day-detail__heading"><div><p className="eyebrow">Selected day</p><h2 id="day-detail-heading">{dateLabel(detail.localDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h2></div><Link className="secondary-button button-link" to={`/quick-log?date=${detail.localDate}`}>+ Quick Log</Link></div>
    {!detail.checkIn && !detail.events.length ? <div className="empty-state"><span aria-hidden="true">◇</span><h2>Nothing recorded</h2><p>This day is still open for forgotten events.</p></div> : null}
    {detail.checkIn ? <article id={`history-record-${detail.checkIn.record.id}`} tabIndex={-1} className="history-record-card history-checkin-card"><div className="history-record__heading"><div className="history-record__title"><h3>Nightly Check-In</h3><span className={`status-chip status-chip--${detail.checkIn.record.status}`}>{detail.checkIn.record.status === 'completed' ? '✓ Completed' : '◔ Draft'}</span></div><div className="history-record__actions"><RecordAction label="Edit Nightly Check-In" title="Edit Check-In" to={`/history/check-in/${detail.localDate}`}><EditIcon /></RecordAction><RecordAction label="Delete Nightly Check-In" title="Delete Check-In" danger onClick={() => void onDelete(detail.checkIn!.record.id, 'Nightly Check-In')}><TrashIcon /></RecordAction></div></div>
      {detail.checkIn.groups.length ? <div className="history-answer-groups">{detail.checkIn.groups.map((group) => <section className="history-answer-widget" key={group.category}><h4>{group.category}</h4><dl>{group.answers.map((answer) => <div key={answer.observationId} className={answer.state === 'answered' ? '' : 'is-missing'}><dt>{answer.name}</dt><dd>{answer.value}{answer.trendValue ? <small> · {answer.trendValue}</small> : null}</dd></div>)}</dl></section>)}</div> : <p className="empty-copy">No answers recorded yet.</p>}
    </article> : null}
    {detail.events.length ? <section className="history-events"><div className="section-heading"><h3>Quick Logs</h3><span>{detail.events.length}</span></div>{detail.events.map((event) => <article id={`history-record-${event.record.id}`} tabIndex={-1} className="history-record-card history-event-card" key={event.record.id}><div className="history-record__heading"><div className="history-event__identity"><span aria-hidden="true">{iconGlyph(event.definition.icon)}</span><div><h3>{event.definition.name}</h3>{event.timing && event.record.startTimePrecision !== 'day' ? <p>{event.timing}</p> : event.record.eventTimingKind === 'duration' ? <p>{event.timing}</p> : null}</div></div><div className="history-record__actions"><RecordAction label={`Edit ${event.definition.name}`} title={`Edit ${event.definition.name}`} to={`/history/quick-log/${event.record.id}/edit`}><EditIcon /></RecordAction><RecordAction label={`Delete ${event.definition.name}`} title={`Delete ${event.definition.name}`} danger onClick={() => void onDelete(event.record.id, event.definition.name)}><TrashIcon /></RecordAction></div></div>{event.fields.length ? <dl className="event-field-summary">{event.fields.map((field) => <div key={field.observationId} className={field.state === 'answered' ? '' : 'is-missing'}><dt>{field.name}</dt><dd>{field.value}</dd></div>)}</dl> : null}</article>)}</section> : null}
  </section>
}
