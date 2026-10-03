import { lazy, Suspense, useState, type FormEvent } from 'react'
import type { DataRole, EventTimingMode, InputType, ObservationAnswer, ValueDirection } from '../../domain/models/index.ts'
import { TrackableNameConflictError, TrackableValidationError, type TrackableDetails, type TrackableDraft, type TrackableLibrary } from '../../domain/trackables/TrackableEngine.ts'
import { builtInIcons, iconGlyph } from '../../presets/iconLibrary.ts'
import { trackableEngine } from './trackableEngine.ts'
import { groupAdditionalFieldCandidates, inputTypes } from './trackableUi.ts'
import { firstGrapheme } from './emojiInput.ts'
import { assessTrackableEditContinuity, type TrackableEditContinuityAssessment } from '../../analytics/trackableEditContinuity.ts'
import { analyticsProvider } from '../trends/analyticsProvider.ts'
import { TrackableAnalysisHistory } from './TrackableAnalysisHistory.tsx'
import { addChoiceOption, choiceAnalysisConfiguration, choiceIsOrdered, moveChoiceOption, removeChoiceFromDefault, removeChoiceOption, updateChoiceOption } from './trackableChoiceOptions.ts'

const TraceEmojiPicker = lazy(() => import('./TraceEmojiPicker.tsx').then((module) => ({ default: module.TraceEmojiPicker })))

function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  return <Suspense fallback={<p className="save-status">Opening emoji picker…</p>}><TraceEmojiPicker onSelect={onSelect} /></Suspense>
}

const roleLabels: Record<DataRole, string> = {
  symptom: 'Symptom', treatment: 'Treatment', behavior: 'Behavior', exposure: 'Exposure', context: 'Context',
  measurement: 'Measurement', outcome: 'Outcome', other: 'Other',
}

function answered(value: Extract<ObservationAnswer, { state: 'answered' }>['value']): TrackableDraft['defaultAnswer'] {
  return { answer: { state: 'answered', value } }
}

function DefaultAnswerEditor({ draft, onChange }: { draft: TrackableDraft; onChange: (value: TrackableDraft['defaultAnswer']) => void }) {
  const configured = draft.defaultAnswer
  const answer = configured?.answer.state === 'answered' ? configured.answer.value : undefined
  const optionIds = new Set(configured?.selectedOptionIds ?? [])
  const options = (draft.options ?? []).filter((option): option is typeof option & { optionId: string } => Boolean(option.optionId))
  const clear = () => onChange(undefined)

  if (draft.inputType === 'boolean') {
    const selected = answer?.kind === 'boolean' ? String(answer.value) : ''
    return <fieldset className="default-answer-editor"><legend>Default answer <small>optional</small></legend><div className="default-choice-list"><label><input type="radio" name="default-boolean" checked={!selected} onChange={clear} /> No Default</label><label><input type="radio" name="default-boolean" checked={selected === 'true'} onChange={() => onChange(answered({ kind: 'boolean', value: true }))} /> Yes</label><label><input type="radio" name="default-boolean" checked={selected === 'false'} onChange={() => onChange(answered({ kind: 'boolean', value: false }))} /> No</label></div></fieldset>
  }
  if (draft.inputType === 'single_choice') {
    const selected = configured?.selectedOptionIds?.[0] ?? ''
    return <fieldset className="default-answer-editor"><legend>Default answer <small>optional</small></legend><div className="default-choice-list"><label><input type="radio" name="default-single-choice" checked={!selected} onChange={clear} /> No Default</label>{options.map((option) => <label key={option.optionId}><input type="radio" name="default-single-choice" checked={selected === option.optionId} onChange={() => onChange({ answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: [option.optionId] })} /> {option.label}</label>)}</div></fieldset>
  }
  if (draft.inputType === 'multi_select') {
    return <fieldset className="default-answer-editor"><legend>Default answers <small>optional</small></legend><div className="default-choice-list">{options.map((option) => <label key={option.optionId}><input type="checkbox" checked={optionIds.has(option.optionId)} onChange={(event) => { const next = new Set(optionIds); if (event.target.checked) next.add(option.optionId); else next.delete(option.optionId); onChange(next.size ? { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: [...next] } : undefined) }} /> {option.label}</label>)}</div>{optionIds.size ? <button type="button" className="text-button" onClick={clear}>Clear Default</button> : <small>No default selected.</small>}</fieldset>
  }
  if (draft.inputType === 'scale') {
    const values: number[] = []
    for (let value = draft.scaleMin ?? 0; value <= (draft.scaleMax ?? 5); value += draft.scaleStep ?? 1) values.push(value)
    return <label className="form-field"><span>Default answer <small>optional</small></span><select value={answer?.kind === 'scale' ? String(answer.value) : ''} onChange={(event) => event.target.value === '' ? clear() : onChange(answered({ kind: 'scale', value: Number(event.target.value) }))}><option value="">No Default</option>{values.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
  }
  if (draft.inputType === 'number' || draft.inputType === 'duration') {
    const value = answer?.kind === draft.inputType ? answer.value : ''
    return <label className="form-field"><span>Default answer <small>optional{draft.unit ? ` · ${draft.unit}` : draft.inputType === 'duration' ? ' · minutes' : ''}</small></span><input type="number" min={draft.configuration?.min as number | undefined} max={draft.configuration?.max as number | undefined} step={draft.configuration?.step as number | undefined} value={value} onChange={(event) => { if (event.target.value === '') { clear(); return } const numeric = event.target.valueAsNumber; onChange(draft.inputType === 'duration' ? answered({ kind: 'duration', value: numeric, unit: 'minutes' }) : answered({ kind: 'number', value: numeric, ...(draft.unit ? { unit: draft.unit } : {}) })) }} /></label>
  }
  if (draft.inputType === 'time') {
    return <label className="form-field"><span>Default answer <small>optional</small></span><input type="time" value={answer?.kind === 'time' ? answer.value : ''} onChange={(event) => event.target.value ? onChange(answered({ kind: 'time', value: event.target.value })) : clear()} /></label>
  }
  return <label className="form-field"><span>Default answer <small>optional</small></span><input value={answer?.kind === 'text' ? answer.value : ''} onChange={(event) => event.target.value ? onChange(answered({ kind: 'text', value: event.target.value })) : clear()} /></label>
}

function initialDraft(categoryId: string): TrackableDraft {
  return { name: '', categoryId, inputType: 'scale', recordSemantics: 'daily_value', quickLogEnabled: false, dataRole: 'other', valueDirection: 'neutral', scaleMin: 1, scaleMax: 5, scaleStep: 1, tags: [], icon: { type: 'library', value: 'sparkle' } }
}

function detailsDraft(details: TrackableDetails): TrackableDraft {
  return {
    name: details.version.name, description: details.version.description, categoryId: details.trackable.categoryId,
    inputType: details.version.inputType, recordSemantics: details.trackable.recordSemantics ?? 'daily_value', quickLogEnabled: details.trackable.quickLogEnabled ?? false, quickLogTimingMode: details.trackable.quickLogTimingMode,
    dataRole: details.trackable.dataRole, valueDirection: details.version.valueDirection,
    unit: details.version.unit, scaleMin: details.version.scaleMin, scaleMax: details.version.scaleMax, scaleStep: details.version.scaleStep,
    options: details.options.filter((option) => option.active).map((option) => ({ optionId: option.optionId, label: option.label, icon: option.icon })),
    tags: details.trackable.tags, icon: details.trackable.icon,
    configuration: Object.fromEntries(Object.entries(details.version.configuration).filter(([key]) => key !== 'allowOther' && key !== 'defaultAnswer')),
    allowOther: details.version.configuration.allowOther === true,
    defaultAnswer: details.version.configuration.defaultAnswer as unknown as TrackableDraft['defaultAnswer'], reminder: details.trackable.reminder,
    fields: (details.fields ?? []).map(({ field }) => ({ trackableId: field.fieldTrackableId, required: field.required, conditionalRule: field.conditionalRule ? { ...field.conditionalRule, sourceTrackableId: '__parent__' } : undefined })),
  }
}

export function EmojiIconField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  return <div className="form-field icon-field"><span>Icon</span><div className="icon-field__control"><input aria-label="Icon" value={value} onChange={(event) => onChange(firstGrapheme(event.target.value))} placeholder="🙂" /><button type="button" aria-label="Choose emoji" aria-expanded={open} onClick={() => setOpen((current) => !current)}>☺</button></div>{open ? <EmojiPicker onSelect={(emoji) => { onChange(firstGrapheme(emoji)); setOpen(false) }} /> : null}</div>
}

function ConfigHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <header className="trackable-config-header"><div><small>{eyebrow}</small><h2>{title}</h2></div>{description ? <p>{description}</p> : null}</header>
}

function ChoiceOptionsEditor({ draft, onChange }: { draft: TrackableDraft; onChange: (draft: TrackableDraft) => void }) {
  const options = draft.options ?? []
  function replace(nextOptions: typeof options) {
    const next = { ...draft, options: nextOptions }
    onChange({ ...next, configuration: choiceAnalysisConfiguration(next, choiceIsOrdered(draft.configuration)) })
  }
  function remove(optionId: string) {
    const next = { ...draft, options: removeChoiceOption(options, optionId), defaultAnswer: removeChoiceFromDefault(draft.defaultAnswer, optionId) }
    onChange({ ...next, configuration: choiceAnalysisConfiguration(next, choiceIsOrdered(draft.configuration)) })
  }
  return <div className="choice-option-editor"><div className="choice-option-list">{options.map((option, index) => <div className="choice-option-row" key={option.optionId}><span className="choice-option-handle" aria-hidden="true">⋮⋮</span><label><span className="sr-only">Option {index + 1}</span><input value={option.label} onChange={(event) => replace(updateChoiceOption(options, option.optionId!, event.target.value))} placeholder={`Option ${index + 1}`} required /></label><div className="choice-option-actions"><button type="button" aria-label={`Move ${option.label || `option ${index + 1}`} up`} disabled={index === 0} onClick={() => replace(moveChoiceOption(options, option.optionId!, -1))}>↑</button><button type="button" aria-label={`Move ${option.label || `option ${index + 1}`} down`} disabled={index === options.length - 1} onClick={() => replace(moveChoiceOption(options, option.optionId!, 1))}>↓</button><button type="button" className="choice-option-remove" aria-label={`Remove ${option.label || `option ${index + 1}`}`} disabled={options.length <= 2} onClick={() => remove(option.optionId!)}>×</button></div></div>)}</div><button type="button" className="secondary-button choice-option-add" onClick={() => replace(addChoiceOption(options, crypto.randomUUID()))}>+ Add option</button></div>
}

export function TrackableEditor({ details, library, onCancel, onSaved, initialHistorySourceVersion }: { details?: TrackableDetails; library: TrackableLibrary; onCancel: () => void; onSaved: () => void; initialHistorySourceVersion?: number }) {
  const [currentDetails, setCurrentDetails] = useState(details)
  const [draft, setDraft] = useState<TrackableDraft>(() => details ? detailsDraft(details) : initialDraft(library.categories.find((category) => category.active)?.id ?? library.categories[0]?.id ?? ''))
  const [tagsText, setTagsText] = useState(() => (draft.tags ?? []).join(', '))
  const [fieldSearch, setFieldSearch] = useState('')
  const [iconMode, setIconMode] = useState<'library' | 'emoji'>(() => draft.icon?.type === 'emoji' ? 'emoji' : 'library')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [archivedNameConflict, setArchivedNameConflict] = useState<TrackableNameConflictError | null>(null)
  const [continuity, setContinuity] = useState<Exclude<TrackableEditContinuityAssessment, { kind: 'none' }> | null>(null)
  const [pendingDraft, setPendingDraft] = useState<TrackableDraft | null>(null)
  const [historySourceVersion, setHistorySourceVersion] = useState<number | undefined>(initialHistorySourceVersion)
  const isChoice = draft.inputType === 'single_choice' || draft.inputType === 'multi_select'

  async function persistEdit(completeDraft: TrackableDraft, outcome: 'finish' | 'map' | 'unresolved') {
    if (!currentDetails) return
    const sourceVersion = currentDetails.trackable.currentVersion
    const saved = await trackableEngine.updateTrackable(currentDetails.trackable.id, completeDraft)
    if (outcome === 'finish') { onSaved(); return }
    setCurrentDetails(saved); setDraft(detailsDraft(saved)); setTagsText(saved.trackable.tags.join(', '))
    setContinuity(null); setPendingDraft(null); setHistorySourceVersion(sourceVersion)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setArchivedNameConflict(null)
    const submittedOptions = isChoice ? draft.options ?? [] : []
    const completeDraft: TrackableDraft = {
      ...draft,
      options: submittedOptions,
      defaultAnswer: draft.defaultAnswer,
      tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
    }
    try {
      if (details) {
        const data = await analyticsProvider.loadTrendsData()
        const assessment = assessTrackableEditContinuity(currentDetails ?? details, completeDraft, data)
        if (assessment.kind !== 'none') {
          setContinuity(assessment); setPendingDraft(completeDraft)
          return
        }
        await persistEdit(completeDraft, 'finish')
      } else {
        await trackableEngine.createTrackable(completeDraft)
        onSaved()
      }
    } catch (caught) {
      if (caught instanceof TrackableNameConflictError && caught.archived && !details) setArchivedNameConflict(caught)
      setError(caught instanceof TrackableValidationError ? caught.issues.join(' ') : caught instanceof Error ? caught.message : 'Could not save this Trackable.')
    } finally { setBusy(false) }
  }

  async function resolveContinuity(outcome: 'map' | 'unresolved') {
    if (!pendingDraft) return
    setBusy(true); setError('')
    try { await persistEdit(pendingDraft, outcome) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save this Trackable.') }
    finally { setBusy(false) }
  }

  async function restoreArchivedConflict() {
    if (!archivedNameConflict) return
    setBusy(true); setError('')
    try {
      await trackableEngine.setTrackableActive(archivedNameConflict.existingTrackableId, true)
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not restore this Trackable.')
    } finally { setBusy(false) }
  }

  function changeInputType(inputType: InputType) {
    setDraft((current) => {
      const choice = inputType === 'single_choice' || inputType === 'multi_select'
      const options = choice && !(current.options?.length) ? [{ optionId: crypto.randomUUID(), label: '' }, { optionId: crypto.randomUUID(), label: '' }] : current.options
      const next = { ...current, inputType, options: choice ? options : [], defaultAnswer: undefined, ...(inputType === 'scale' ? { scaleMin: current.scaleMin ?? 1, scaleMax: current.scaleMax ?? 5, scaleStep: current.scaleStep ?? 1 } : {}) }
      return { ...next, configuration: choiceAnalysisConfiguration(next, choice && choiceIsOrdered(current.configuration)) }
    })
  }

  function toggleField(trackableId: string) {
    const fields = [...(draft.fields ?? [])]
    setDraft({ ...draft, fields: fields.some((field) => field.trackableId === trackableId) ? fields.filter((field) => field.trackableId !== trackableId) : [...fields, { trackableId }] })
  }

  function updateField(trackableId: string, changes: Partial<NonNullable<TrackableDraft['fields']>[number]>) {
    setDraft({ ...draft, fields: (draft.fields ?? []).map((field) => field.trackableId === trackableId ? { ...field, ...changes } : field) })
  }

  return <form className="trackable-form trackable-editor-form" onSubmit={submit}>
    <section className="trackable-config-card basics-card"><ConfigHeader eyebrow="Basics" title="Identity" description="The name and shelf you’ll see throughout Trace." /><div className="basics-grid"><EmojiIconField value={draft.icon?.type === 'emoji' ? draft.icon.value : iconGlyph(draft.icon)} onChange={(emoji) => setDraft((current) => ({ ...current, icon: emoji ? { type: 'emoji', value: emoji } : undefined }))} /><label className="form-field basics-name"><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Morning energy" maxLength={100} required autoFocus={!details} /></label><label className="form-field basics-category"><span>Category</span><select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>{library.categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? '' : ' (hidden)'}</option>)}</select></label></div></section>
    <section className="trackable-config-card tracking-card"><ConfigHeader eyebrow="Tracking" title="How is this tracked?" /><div className="tracking-choice-list" role="group" aria-label="How is this tracked?"><button type="button" aria-pressed={draft.recordSemantics === 'daily_value'} onClick={() => setDraft({ ...draft, recordSemantics: 'daily_value', quickLogEnabled: false, quickLogTimingMode: undefined })}><strong>Daily Value</strong><small>One answer for the day</small></button><button type="button" aria-pressed={draft.recordSemantics === 'occurrence'} onClick={() => setDraft((current) => { const next = { ...current, recordSemantics: 'occurrence' as const, inputType: 'boolean' as const, options: [], defaultAnswer: undefined, quickLogTimingMode: current.quickLogTimingMode ?? 'either' as const }; return { ...next, configuration: choiceAnalysisConfiguration(next, false) } })}><strong>Occurrence</strong><small>Zero or more times per day</small></button></div><div className="tracking-settings">{draft.recordSemantics === 'daily_value' ? <label className="form-field"><span>Answer style</span><select value={draft.inputType} onChange={(event) => changeInputType(event.target.value as InputType)}>{inputTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label> : <><label className="checkbox-field"><span><input type="checkbox" checked={Boolean(draft.quickLogEnabled)} onChange={(event) => setDraft({ ...draft, quickLogEnabled: event.target.checked, quickLogTimingMode: event.target.checked ? draft.quickLogTimingMode ?? 'either' : undefined })} /> Available in Quick Log</span><small>Daily Check-In inclusion is configured separately.</small></label>{draft.quickLogEnabled ? <label className="form-field"><span>Quick Log timing</span><select value={draft.quickLogTimingMode ?? 'either'} onChange={(event) => setDraft({ ...draft, quickLogTimingMode: event.target.value as EventTimingMode })}><option value="point">Point in time</option><option value="duration">Duration</option><option value="either">Point or duration</option><option value="dayOnly">Date only</option></select></label> : null}</>}</div></section>
    <section className="trackable-config-card answer-config-card"><ConfigHeader eyebrow="Answer configuration" title={inputTypes.find((item) => item.value === draft.inputType)?.label ?? 'Answer'} description="Shape the answer without changing old records." />{draft.inputType === 'scale' ? <div className="trackable-scale-settings"><label>From<input type="number" value={draft.scaleMin ?? ''} onChange={(event) => setDraft({ ...draft, scaleMin: event.target.valueAsNumber })} /></label><label>To<input type="number" value={draft.scaleMax ?? ''} onChange={(event) => setDraft({ ...draft, scaleMax: event.target.valueAsNumber })} /></label><label>Step<input type="number" min="0.01" step="any" value={draft.scaleStep ?? ''} onChange={(event) => setDraft({ ...draft, scaleStep: event.target.valueAsNumber })} /></label></div> : null}{isChoice ? <><ChoiceOptionsEditor draft={draft} onChange={setDraft} /><label className="checkbox-field"><span><input type="checkbox" checked={Boolean(draft.allowOther)} onChange={(event) => setDraft({ ...draft, allowOther: event.target.checked })} /> Allow a custom “Other” answer</span></label></> : null}{draft.inputType === 'number' ? <label className="form-field"><span>Unit <small>optional</small></span><input value={draft.unit ?? ''} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="e.g. mg, oz, °F" /></label> : null}{draft.inputType === 'duration' ? <p className="version-note">Durations are stored consistently in minutes.</p> : null}{draft.inputType === 'time' ? <p className="version-note">Answers use a local clock time.</p> : null}{draft.inputType === 'text' ? <p className="version-note">Free-form notes stay readable but are not coerced into numeric analysis.</p> : null}</section>
    <details className="trackable-config-card additional-fields-card"><summary><span><small>Linked configuration</small><strong>Additional Fields</strong></span><em>{draft.fields?.length ?? 0} selected</em></summary><div className="trackable-config-card__body"><p className="version-note">Fields stay linked by stable Trackable identity and remain version-pinned when saved.</p><label className="form-field additional-field-search"><span>Find a field</span><input type="search" value={fieldSearch} onChange={(event) => setFieldSearch(event.target.value)} placeholder="Search Trackables" /></label><div className="additional-field-groups">{groupAdditionalFieldCandidates(library.active, library.categories, currentDetails?.trackable.id, fieldSearch).map(({ category, items }) => <section className="additional-field-group" key={category.id}><h3>{category.name}<span>{items.length}</span></h3>{items.map((item) => { const configured = draft.fields?.find((field) => field.trackableId === item.trackable.id); return <div className={`additional-field-row${configured ? ' is-selected' : ''}`} key={item.trackable.id}><label><input type="checkbox" checked={Boolean(configured)} onChange={() => toggleField(item.trackable.id)} /><span><strong>{item.version.name}</strong><small>{configured ? 'Included' : 'Available'}</small></span></label>{configured ? <div className="additional-field-options"><label><input type="checkbox" checked={Boolean(configured.required)} onChange={(event) => updateField(item.trackable.id, { required: event.target.checked })} /> Required</label>{draft.inputType === 'boolean' ? <label><input type="checkbox" checked={Boolean(configured.conditionalRule)} onChange={(event) => updateField(item.trackable.id, { conditionalRule: event.target.checked ? { sourceTrackableId: '__parent__', operator: 'equals', expectedValue: true } : undefined })} /> Show only when Yes</label> : null}</div> : null}</div> })}</section>)}</div></div></details>
    {(isChoice || currentDetails) ? <section className="trackable-config-card analysis-config-card"><ConfigHeader eyebrow="Analysis & history" title="Meaning over time" description="Tell Trends how choices relate and connect older formats when needed." />{isChoice ? <fieldset className="choice-behavior"><legend>Choice behavior</legend><div className="segmented"><button type="button" aria-pressed={!choiceIsOrdered(draft.configuration)} onClick={() => setDraft({ ...draft, configuration: choiceAnalysisConfiguration(draft, false) })}>Unordered categories</button><button type="button" aria-pressed={choiceIsOrdered(draft.configuration)} onClick={() => setDraft({ ...draft, configuration: choiceAnalysisConfiguration(draft, true) })}>Ordered categories</button></div>{choiceIsOrdered(draft.configuration) ? <p>The visible option order is meaningful from lowest to highest. Use the arrows above to refine it.</p> : <p>Choices are distinct labels without a numeric or ranked relationship.</p>}</fieldset> : null}{currentDetails ? <TrackableAnalysisHistory key={`${currentDetails.trackable.currentVersion}:${historySourceVersion ?? ''}`} details={currentDetails} autoOpenSourceVersion={historySourceVersion} /> : null}</section> : null}
    {currentDetails ? <details className="trackable-config-card reminder-editor"><summary><span><small>Optional</small><strong>Reminder</strong></span></summary><div className="trackable-config-card__body"><p className="version-note">Remind me about this Trackable on selected days. Times use your local clock.</p><label className="form-field checkbox-field"><span><input type="checkbox" checked={Boolean(draft.reminder?.enabled)} onChange={(event) => setDraft({ ...draft, reminder: { enabled: event.target.checked, time: draft.reminder?.time ?? '21:00', weekdays: draft.reminder?.weekdays ?? [0, 1, 2, 3, 4, 5, 6], skipIfAlreadyLoggedToday: draft.reminder?.skipIfAlreadyLoggedToday ?? true } })} /> Enable Reminder</span></label>{draft.reminder ? <><label className="form-field"><span>Time</span><input type="time" value={draft.reminder.time} onChange={(event) => setDraft({ ...draft, reminder: { ...draft.reminder!, time: event.target.value } })} /></label><fieldset className="default-answer-editor"><legend>Days</legend><div className="default-choice-list">{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((name, day) => <label key={name}><input type="checkbox" checked={draft.reminder!.weekdays.includes(day)} onChange={(event) => { const days = new Set(draft.reminder!.weekdays); if (event.target.checked) days.add(day); else days.delete(day); setDraft({ ...draft, reminder: { ...draft.reminder!, weekdays: [...days].sort() } }) }} /> {name}</label>)}</div></fieldset><label className="form-field checkbox-field"><span><input type="checkbox" checked={draft.reminder.skipIfAlreadyLoggedToday} onChange={(event) => setDraft({ ...draft, reminder: { ...draft.reminder!, skipIfAlreadyLoggedToday: event.target.checked } })} /> Skip if already logged today</span></label></> : null}</div></details> : null}
    <details className="trackable-config-card advanced-options"><summary><span><small>Optional</small><strong>Advanced Options</strong></span></summary><div className="trackable-config-card__body advanced-options__body">
      <label className="form-field"><span>Description</span><textarea value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} /></label>
      <DefaultAnswerEditor draft={draft} onChange={(defaultAnswer) => setDraft({ ...draft, defaultAnswer })} />
      <div className="form-row"><label className="form-field"><span>Data role</span><select value={draft.dataRole} onChange={(event) => setDraft({ ...draft, dataRole: event.target.value as DataRole })}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>Higher values mean</span><select value={draft.valueDirection} onChange={(event) => setDraft({ ...draft, valueDirection: event.target.value as ValueDirection })}><option value="neutral">Neither / depends</option><option value="better">Better</option><option value="worse">Worse</option></select></label></div>
      {(draft.inputType === 'number' || draft.inputType === 'scale') && <label className="form-field"><span>Unit <small>optional</small></span><input value={draft.unit ?? ''} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="e.g. mg, oz, °F" /></label>}
      {draft.inputType === 'duration' && <p className="version-note">Durations are stored in minutes so they remain consistent for future analysis.</p>}
      <label className="form-field"><span>Tags <small>comma separated</small></span><input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="morning, wellness" /></label>
      <fieldset className="icon-picker"><legend>Icon</legend><div className="segmented segmented--small"><button type="button" aria-pressed={iconMode === 'library'} onClick={() => { setIconMode('library'); setDraft({ ...draft, icon: { type: 'library', value: 'sparkle' } }) }}>Built-in</button><button type="button" aria-pressed={iconMode === 'emoji'} onClick={() => { setIconMode('emoji'); setDraft({ ...draft, icon: { type: 'emoji', value: '✨' } }) }}>Emoji</button></div>{iconMode === 'library' ? <div className="icon-grid">{builtInIcons.map((icon) => <button type="button" key={icon.id} className={draft.icon?.type === 'library' && draft.icon.value === icon.id ? 'is-selected' : ''} aria-label={icon.label} title={icon.label} onClick={() => setDraft({ ...draft, icon: { type: 'library', value: icon.id } })}>{icon.glyph}</button>)}</div> : <label className="form-field"><span>Your emoji</span><input value={draft.icon?.type === 'emoji' ? draft.icon.value : ''} onChange={(event) => setDraft({ ...draft, icon: { type: 'emoji', value: event.target.value } })} maxLength={16} /></label>}</fieldset>
      {iconMode === 'emoji' ? <EmojiPicker onSelect={(emoji) => setDraft((current) => ({ ...current, icon: { type: 'emoji', value: emoji } }))} /> : null}
    </div></details>
    {currentDetails && <p className="version-note">Changing what an answer means creates a new version. Old records keep their original meaning.</p>}
    {continuity ? <section className={`trackable-continuity-prompt trackable-continuity-prompt--${continuity.kind}`} role="alertdialog" aria-labelledby="trackable-continuity-title" aria-describedby="trackable-continuity-description"><div><p>{continuity.kind === 'mappable' ? 'Historical analysis' : 'Compatibility warning'}</p><h2 id="trackable-continuity-title">{continuity.kind === 'mappable' ? 'Keep older values comparable?' : 'Older values cannot be mapped to this answer style'}</h2><p id="trackable-continuity-description">{continuity.kind === 'mappable' ? 'This change creates a new version. You can connect values from the previous version to the new one without changing any original records.' : 'This change creates a new version, but the existing mapping system cannot safely translate its older values. Original records will remain available with their historical meaning.'}</p></div><div className="trackable-continuity-actions">{continuity.kind === 'mappable' ? <><button type="button" className="primary-button" disabled={busy} onClick={() => void resolveContinuity('map')}>Map now</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void resolveContinuity('unresolved')}>Save without mapping</button></> : <button type="button" className="primary-button" disabled={busy} onClick={() => void resolveContinuity('unresolved')}>Save anyway</button>}<button type="button" className="text-button" disabled={busy} onClick={() => { setContinuity(null); setPendingDraft(null) }}>Cancel</button></div></section> : null}
    {error && <p className="form-error" role="alert">{error}</p>}
    {archivedNameConflict ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void restoreArchivedConflict()}>Restore {archivedNameConflict.existingName}</button> : null}
    {!continuity ? <div className="editor-actions"><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : currentDetails ? 'Save Changes' : 'Create Trackable'}</button><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button></div> : null}
  </form>
}
