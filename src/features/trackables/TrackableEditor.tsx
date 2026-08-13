import { useState, type FormEvent } from 'react'
import type { DataRole, EventTimingMode, InputType, ObservationAnswer, ValueDirection } from '../../domain/models/index.ts'
import { TrackableValidationError, type TrackableDetails, type TrackableDraft, type TrackableLibrary } from '../../domain/trackables/TrackableEngine.ts'
import { builtInIcons } from '../../presets/iconLibrary.ts'
import { trackableEngine } from './trackableEngine.ts'
import { inputTypes } from './trackableUi.ts'

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
    defaultAnswer: details.version.configuration.defaultAnswer as unknown as TrackableDraft['defaultAnswer'],
    fields: (details.fields ?? []).map(({ field }) => ({ trackableId: field.fieldTrackableId, required: field.required, conditionalRule: field.conditionalRule ? { ...field.conditionalRule, sourceTrackableId: '__parent__' } : undefined })),
  }
}

export function TrackableEditor({ details, library, onCancel, onSaved }: { details?: TrackableDetails; library: TrackableLibrary; onCancel: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<TrackableDraft>(() => details ? detailsDraft(details) : initialDraft(library.categories.find((category) => category.active)?.id ?? library.categories[0]?.id ?? ''))
  const [optionsText, setOptionsText] = useState(() => (draft.options ?? []).map((option) => option.label).join('\n'))
  const [tagsText, setTagsText] = useState(() => (draft.tags ?? []).join(', '))
  const [iconMode, setIconMode] = useState<'library' | 'emoji'>(() => draft.icon?.type === 'emoji' ? 'emoji' : 'library')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isChoice = draft.inputType === 'single_choice' || draft.inputType === 'multi_select'

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    const submittedOptions = isChoice ? draft.options ?? [] : []
    const completeDraft: TrackableDraft = {
      ...draft,
      options: submittedOptions,
      defaultAnswer: draft.defaultAnswer,
      tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
    }
    try {
      if (details) await trackableEngine.updateTrackable(details.trackable.id, completeDraft)
      else await trackableEngine.createTrackable(completeDraft)
      onSaved()
    } catch (caught) {
      setError(caught instanceof TrackableValidationError ? caught.issues.join(' ') : caught instanceof Error ? caught.message : 'Could not save this Trackable.')
    } finally { setBusy(false) }
  }

  function changeInputType(inputType: InputType) {
    setDraft((current) => ({ ...current, inputType, defaultAnswer: undefined, ...(inputType === 'scale' ? { scaleMin: current.scaleMin ?? 1, scaleMax: current.scaleMax ?? 5, scaleStep: current.scaleStep ?? 1 } : {}) }))
  }

  function updateOptions(value: string) {
    setOptionsText(value)
    const existing = new Map((draft.options ?? []).map((option) => [option.label.trim().toLocaleLowerCase(), option]))
    const options = value.split('\n').map((label) => label.trim()).filter(Boolean).map((label) => ({ label, optionId: existing.get(label.toLocaleLowerCase())?.optionId ?? crypto.randomUUID() }))
    const valid = new Set(options.map((option) => option.optionId))
    const selected = (draft.defaultAnswer?.selectedOptionIds ?? []).filter((id) => valid.has(id))
    setDraft({ ...draft, options, defaultAnswer: selected.length ? { answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: draft.inputType === 'single_choice' ? selected.slice(0, 1) : selected } : undefined })
  }

  function toggleField(trackableId: string) {
    const fields = [...(draft.fields ?? [])]
    setDraft({ ...draft, fields: fields.some((field) => field.trackableId === trackableId) ? fields.filter((field) => field.trackableId !== trackableId) : [...fields, { trackableId }] })
  }

  function updateField(trackableId: string, changes: Partial<NonNullable<TrackableDraft['fields']>[number]>) {
    setDraft({ ...draft, fields: (draft.fields ?? []).map((field) => field.trackableId === trackableId ? { ...field, ...changes } : field) })
  }

  return <form className="trackable-form trackable-editor-form" onSubmit={submit}>
    <label className="form-field"><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Morning energy" maxLength={100} required autoFocus={!details} /></label>
    <fieldset className="event-field-editor tracking-semantics"><legend>How is this tracked?</legend><div className="segmented"><button type="button" aria-pressed={draft.recordSemantics === 'daily_value'} onClick={() => setDraft({ ...draft, recordSemantics: 'daily_value', quickLogEnabled: false, quickLogTimingMode: undefined })}><strong>Daily Value</strong><small>One answer for the day</small></button><button type="button" aria-pressed={draft.recordSemantics === 'occurrence'} onClick={() => setDraft({ ...draft, recordSemantics: 'occurrence', inputType: 'boolean', defaultAnswer: undefined, quickLogTimingMode: draft.quickLogTimingMode ?? 'either' })}><strong>Occurrence</strong><small>Zero or more times per day</small></button></div></fieldset>
    {draft.recordSemantics === 'occurrence' && <label className="form-field checkbox-field"><span><input type="checkbox" checked={Boolean(draft.quickLogEnabled)} onChange={(event) => setDraft({ ...draft, quickLogEnabled: event.target.checked, quickLogTimingMode: event.target.checked ? draft.quickLogTimingMode ?? 'either' : undefined })} /> Available in Quick Log</span><small>Daily Check-In inclusion is configured separately in your routine.</small></label>}
    <div className="form-row">
      <label className="form-field"><span>Category</span><select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>{library.categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? '' : ' (hidden)'}</option>)}</select></label>
      {draft.recordSemantics === 'daily_value' ? <label className="form-field"><span>Answer style</span><select value={draft.inputType} onChange={(event) => changeInputType(event.target.value as InputType)}>{inputTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label> : draft.quickLogEnabled ? <label className="form-field"><span>Quick Log timing</span><select value={draft.quickLogTimingMode ?? 'either'} onChange={(event) => setDraft({ ...draft, quickLogTimingMode: event.target.value as EventTimingMode })}><option value="point">Point in time</option><option value="duration">Duration</option><option value="either">Point or duration</option><option value="dayOnly">Date only</option></select></label> : null}
    </div>
    {draft.inputType === 'scale' && <fieldset className="inline-fields"><legend>Scale</legend><label>From<input type="number" value={draft.scaleMin ?? ''} onChange={(event) => setDraft({ ...draft, scaleMin: event.target.valueAsNumber })} /></label><label>To<input type="number" value={draft.scaleMax ?? ''} onChange={(event) => setDraft({ ...draft, scaleMax: event.target.valueAsNumber })} /></label><label>Step<input type="number" min="0.01" step="any" value={draft.scaleStep ?? ''} onChange={(event) => setDraft({ ...draft, scaleStep: event.target.valueAsNumber })} /></label></fieldset>}
    {isChoice && <><label className="form-field"><span>Choices <small>one per line</small></span><textarea value={optionsText} onChange={(event) => updateOptions(event.target.value)} rows={5} placeholder={'Low\nMedium\nHigh'} required /></label><label className="form-field checkbox-field"><span><input type="checkbox" checked={Boolean(draft.allowOther)} onChange={(event) => setDraft({ ...draft, allowOther: event.target.checked })} /> Allow a custom “Other” answer</span></label></>}
    <details className="additional-fields"><summary>Additional Fields{draft.fields?.length ? ` · ${draft.fields.length}` : ''}</summary><div className="additional-fields__body"><p className="version-note">Fields stay grouped with this Trackable and keep stable identities through their linked Trackables.</p>{library.active.filter((item) => item.trackable.id !== details?.trackable.id).map((item) => {
      const configured = draft.fields?.find((field) => field.trackableId === item.trackable.id)
      return <div className="additional-field-row" key={item.trackable.id}><label><input type="checkbox" checked={Boolean(configured)} onChange={() => toggleField(item.trackable.id)} /> {item.version.name}</label>{configured ? <div className="form-row"><label><input type="checkbox" checked={Boolean(configured.required)} onChange={(event) => updateField(item.trackable.id, { required: event.target.checked })} /> Required when shown</label>{draft.inputType === 'boolean' ? <label><input type="checkbox" checked={Boolean(configured.conditionalRule)} onChange={(event) => updateField(item.trackable.id, { conditionalRule: event.target.checked ? { sourceTrackableId: '__parent__', operator: 'equals', expectedValue: true } : undefined })} /> Show only when Yes</label> : null}</div> : null}</div>
    })}</div></details>
    <details className="advanced-options"><summary>Advanced options</summary><div className="advanced-options__body">
      <label className="form-field"><span>Description</span><textarea value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} /></label>
      <DefaultAnswerEditor draft={draft} onChange={(defaultAnswer) => setDraft({ ...draft, defaultAnswer })} />
      <div className="form-row"><label className="form-field"><span>Data role</span><select value={draft.dataRole} onChange={(event) => setDraft({ ...draft, dataRole: event.target.value as DataRole })}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="form-field"><span>Higher values mean</span><select value={draft.valueDirection} onChange={(event) => setDraft({ ...draft, valueDirection: event.target.value as ValueDirection })}><option value="neutral">Neither / depends</option><option value="better">Better</option><option value="worse">Worse</option></select></label></div>
      {(draft.inputType === 'number' || draft.inputType === 'scale') && <label className="form-field"><span>Unit <small>optional</small></span><input value={draft.unit ?? ''} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="e.g. mg, oz, °F" /></label>}
      {draft.inputType === 'duration' && <p className="version-note">Durations are stored in minutes so they remain consistent for future analysis.</p>}
      <label className="form-field"><span>Tags <small>comma separated</small></span><input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="morning, wellness" /></label>
      <fieldset className="icon-picker"><legend>Icon</legend><div className="segmented segmented--small"><button type="button" aria-pressed={iconMode === 'library'} onClick={() => { setIconMode('library'); setDraft({ ...draft, icon: { type: 'library', value: 'sparkle' } }) }}>Built-in</button><button type="button" aria-pressed={iconMode === 'emoji'} onClick={() => { setIconMode('emoji'); setDraft({ ...draft, icon: { type: 'emoji', value: '✨' } }) }}>Emoji</button></div>{iconMode === 'library' ? <div className="icon-grid">{builtInIcons.map((icon) => <button type="button" key={icon.id} className={draft.icon?.type === 'library' && draft.icon.value === icon.id ? 'is-selected' : ''} aria-label={icon.label} title={icon.label} onClick={() => setDraft({ ...draft, icon: { type: 'library', value: icon.id } })}>{icon.glyph}</button>)}</div> : <label className="form-field"><span>Your emoji</span><input value={draft.icon?.type === 'emoji' ? draft.icon.value : ''} onChange={(event) => setDraft({ ...draft, icon: { type: 'emoji', value: event.target.value } })} maxLength={16} /></label>}</fieldset>
    </div></details>
    {details && <p className="version-note">Changing what an answer means creates a new version. Old records keep their original meaning.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="editor-actions"><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : details ? 'Save Changes' : 'Create Trackable'}</button><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button></div>
  </form>
}
