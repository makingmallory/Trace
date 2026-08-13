import { useState, type FormEvent } from 'react'
import type { DataRole, EventTimingMode, InputType, ValueDirection } from '../../domain/models/index.ts'
import { TrackableValidationError, type TrackableDetails, type TrackableDraft, type TrackableLibrary } from '../../domain/trackables/TrackableEngine.ts'
import { builtInIcons } from '../../presets/iconLibrary.ts'
import { trackableEngine } from './trackableEngine.ts'
import { inputTypes } from './trackableUi.ts'

const roleLabels: Record<DataRole, string> = {
  symptom: 'Symptom', treatment: 'Treatment', behavior: 'Behavior', exposure: 'Exposure', context: 'Context',
  measurement: 'Measurement', outcome: 'Outcome', other: 'Other',
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
    tags: details.trackable.tags, icon: details.trackable.icon, configuration: details.version.configuration,
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
    const existingOptions = new Map((details?.options ?? []).map((option) => [option.label.trim().toLowerCase(), option]))
    const completeDraft: TrackableDraft = {
      ...draft,
      options: isChoice ? optionsText.split('\n').map((label) => label.trim()).filter(Boolean).map((label) => ({ label, optionId: existingOptions.get(label.toLowerCase())?.optionId })) : [],
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
    setDraft((current) => ({ ...current, inputType, ...(inputType === 'scale' ? { scaleMin: current.scaleMin ?? 1, scaleMax: current.scaleMax ?? 5, scaleStep: current.scaleStep ?? 1 } : {}) }))
  }

  return <form className="trackable-form trackable-editor-form" onSubmit={submit}>
    <label className="form-field"><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Morning energy" maxLength={100} required autoFocus /></label>
    <fieldset className="event-field-editor"><legend>How is this tracked?</legend><div className="segmented"><button type="button" aria-pressed={draft.recordSemantics === 'daily_value'} onClick={() => setDraft({ ...draft, recordSemantics: 'daily_value', quickLogEnabled: false, quickLogTimingMode: undefined })}>Daily Value<small>one answer for the day</small></button><button type="button" aria-pressed={draft.recordSemantics === 'occurrence'} onClick={() => setDraft({ ...draft, recordSemantics: 'occurrence', inputType: 'boolean', quickLogTimingMode: draft.quickLogTimingMode ?? 'either' })}>Occurrence<small>zero or more times per day</small></button></div></fieldset>
    {draft.recordSemantics === 'occurrence' && <label className="form-field"><span><input type="checkbox" checked={Boolean(draft.quickLogEnabled)} onChange={(event) => setDraft({ ...draft, quickLogEnabled: event.target.checked, quickLogTimingMode: event.target.checked ? draft.quickLogTimingMode ?? 'either' : undefined })} /> Available in Quick Log</span><small>Nightly inclusion is configured separately in your routine.</small></label>}
    <div className="form-row">
      <label className="form-field"><span>Category</span><select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>{library.categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? '' : ' (hidden)'}</option>)}</select></label>
      {draft.recordSemantics === 'daily_value' ? <label className="form-field"><span>Answer style</span><select value={draft.inputType} onChange={(event) => changeInputType(event.target.value as InputType)}>{inputTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label> : draft.quickLogEnabled ? <label className="form-field"><span>Quick Log timing</span><select value={draft.quickLogTimingMode ?? 'either'} onChange={(event) => setDraft({ ...draft, quickLogTimingMode: event.target.value as EventTimingMode })}><option value="point">Point in time</option><option value="duration">Duration</option><option value="either">Point or duration</option><option value="dayOnly">Date only</option></select></label> : null}
    </div>
    {draft.inputType === 'scale' && <fieldset className="inline-fields"><legend>Scale</legend><label>From<input type="number" value={draft.scaleMin ?? ''} onChange={(event) => setDraft({ ...draft, scaleMin: event.target.valueAsNumber })} /></label><label>To<input type="number" value={draft.scaleMax ?? ''} onChange={(event) => setDraft({ ...draft, scaleMax: event.target.valueAsNumber })} /></label><label>Step<input type="number" min="0.01" step="any" value={draft.scaleStep ?? ''} onChange={(event) => setDraft({ ...draft, scaleStep: event.target.valueAsNumber })} /></label></fieldset>}
    {isChoice && <label className="form-field"><span>Choices <small>one per line</small></span><textarea value={optionsText} onChange={(event) => setOptionsText(event.target.value)} rows={5} placeholder={'Low\nMedium\nHigh'} required /></label>}
    <details className="advanced-options"><summary>Advanced options</summary><div className="advanced-options__body">
      <label className="form-field"><span>Description</span><textarea value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} /></label>
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
