import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type {
  CompletionBehavior,
  ConditionalRule,
  JsonValue,
  RuleOperator,
  TrendTrackingMode,
} from '../../domain/models/index.ts'
import type {
  RoutineConfiguration,
  RoutineItemChanges,
  RoutineQuestion,
} from '../../domain/checkin/CheckInEngine.ts'
import { checkInEngine } from './checkInEngine.ts'
import { AnswerChoiceButtons } from './AnswerChoiceButtons.tsx'
import { InlineBackHeader } from '../../components/InlineBackHeader.tsx'
import { TrackableFilterControls } from '../../components/TrackableFilterControls.tsx'
import { effectiveCategoryColor } from '../../themes/categoryColors.ts'
import { iconGlyph } from '../../presets/iconLibrary.ts'
import {
  categoricalTriggerRule,
  conditionIsComplete,
  inputTypeLabel,
  operatorOptionsFor,
} from './conditionEditorModel.ts'

interface ItemDraft {
  completionBehavior: CompletionBehavior
  trendTrackingMode: TrendTrackingMode
  conditionalRule?: ConditionalRule
}

function itemDraft(question: RoutineQuestion): ItemDraft {
  return {
    completionBehavior: question.item.completionBehavior,
    trendTrackingMode: question.item.trendTrackingMode,
    conditionalRule: question.item.conditionalRule
      ? structuredClone(question.item.conditionalRule)
      : undefined,
  }
}

function ConditionEditor({
  question,
  questions,
  rule,
  onChange,
}: {
  question: RoutineQuestion
  questions: readonly RoutineQuestion[]
  rule: ConditionalRule | undefined
  onChange: (rule: ConditionalRule | undefined) => void
}) {
  const candidates = questions.filter((item) => item.item.sortOrder < question.item.sortOrder)
  const source = candidates.find((item) => item.trackable.id === rule?.sourceTrackableId)
  const categorical = source && ['boolean', 'single_choice', 'multi_select'].includes(source.version.inputType)
  const answeredOnly = rule?.operator === 'isAnswered'

  function blankRule(nextSource: RoutineQuestion): ConditionalRule {
    if (nextSource.version.inputType === 'boolean' || nextSource.version.inputType === 'single_choice' || nextSource.version.inputType === 'multi_select') {
      return categoricalTriggerRule(nextSource.trackable.id, nextSource.version.inputType, [])
    }
    return {
      sourceTrackableId: nextSource.trackable.id,
      operator: nextSource.version.inputType === 'text' ? 'contains' : 'equals',
    }
  }

  function chooseSource(sourceId: string) {
    if (!sourceId) { onChange(undefined); return }
    const nextSource = candidates.find((item) => item.trackable.id === sourceId)
    if (!nextSource) return
    onChange(blankRule(nextSource))
  }

  function chooseOperator(operator: RuleOperator) {
    if (!rule) return
    if (operator === 'isAnswered') { onChange({ sourceTrackableId: rule.sourceTrackableId, operator }); return }
    const current = Array.isArray(rule.expectedValue) ? rule.expectedValue[0] : rule.expectedValue
    onChange({ ...rule, operator, expectedValue: current })
  }

  function setExpectedValue(expectedValue: JsonValue | undefined) {
    if (!rule) return
    onChange({ ...rule, expectedValue })
  }

  function categoricalSelections(): readonly string[] {
    if (!source || !rule) return []
    if (source.version.inputType === 'boolean') {
      return rule.operator === 'equals' && typeof rule.expectedValue === 'boolean' ? [String(rule.expectedValue)] : []
    }
    if (Array.isArray(rule.expectedValue)) return rule.expectedValue.map(String)
    if (typeof rule.expectedValue !== 'string') return []
    if (source.version.inputType === 'single_choice' && rule.operator === 'notEquals') {
      return source.options.filter((option) => option.optionId !== rule.expectedValue).map((option) => option.optionId)
    }
    return [rule.expectedValue]
  }

  const numeric = source && ['scale', 'number', 'duration'].includes(source.version.inputType)
  const comparisonOperators = source
    ? operatorOptionsFor(source.version.inputType).filter((operator) => operator.value !== 'isAnswered')
    : []

  return <div className="condition-builder">
    <label>
      Show this question when
      <select value={rule?.sourceTrackableId ?? ''} onChange={(event) => chooseSource(event.target.value)}>
        <option value="">Always visible</option>
        {candidates.map((item) => <option key={item.trackable.id} value={item.trackable.id}>{item.version.name}</option>)}
      </select>
    </label>
    {source && rule ? <>
      {!answeredOnly ? <div className="condition-preview">
        <p>Show when <strong>{source.version.name}</strong> is:</p>
        {categorical ? <AnswerChoiceButtons
          choices={source.version.inputType === 'boolean'
            ? [{ id: 'false', label: 'No' }, { id: 'true', label: 'Yes' }]
            : source.options.map((option) => ({ id: option.optionId, label: option.label, icon: option.icon ? iconGlyph(option.icon) : undefined }))}
          selectedIds={categoricalSelections()}
          multiple={source.version.inputType !== 'boolean'}
          label={`Answers to ${source.version.name} that show ${question.version.name}`}
          onChange={(selectedValues) => {
            if (source.version.inputType === 'boolean' || source.version.inputType === 'single_choice' || source.version.inputType === 'multi_select') {
              onChange(categoricalTriggerRule(source.trackable.id, source.version.inputType, selectedValues))
            }
          }}
        /> : null}
        {numeric ? <div className="condition-comparison">
          <label>Comparison<select value={rule.operator} onChange={(event) => chooseOperator(event.target.value as RuleOperator)}>{comparisonOperators.map((operator) => <option value={operator.value} key={operator.value}>{operator.label}</option>)}</select></label>
          <label>Value<input type="number" min={source.version.scaleMin} max={source.version.scaleMax} step={source.version.scaleStep} value={typeof rule.expectedValue === 'number' ? rule.expectedValue : ''} onChange={(event) => setExpectedValue(event.target.value === '' ? undefined : Number(event.target.value))} /></label>
        </div> : null}
        {source.version.inputType === 'time' ? <div className="condition-comparison"><label>Comparison<select value={rule.operator} onChange={(event) => chooseOperator(event.target.value as RuleOperator)}>{comparisonOperators.map((operator) => <option value={operator.value} key={operator.value}>{operator.label}</option>)}</select></label><label>Time<input type="time" value={typeof rule.expectedValue === 'string' ? rule.expectedValue : ''} onChange={(event) => setExpectedValue(event.target.value || undefined)} /></label></div> : null}
        {source.version.inputType === 'text' ? <div className="condition-comparison"><label>Match<select value={rule.operator} onChange={(event) => chooseOperator(event.target.value as RuleOperator)}>{comparisonOperators.map((operator) => <option value={operator.value} key={operator.value}>{operator.label}</option>)}</select></label><label>Text<input type="text" value={typeof rule.expectedValue === 'string' ? rule.expectedValue : ''} onChange={(event) => setExpectedValue(event.target.value || undefined)} /></label></div> : null}
      </div> : <p className="condition-answered-copy">Show once <strong>{source.version.name}</strong> has any answer.</p>}
      <details className="condition-advanced">
        <summary>Advanced condition</summary>
        <label className="condition-answered-toggle"><input type="checkbox" checked={answeredOnly} onChange={(event) => onChange(event.target.checked ? { sourceTrackableId: source.trackable.id, operator: 'isAnswered' } : blankRule(source))} />Show whenever this question is answered</label>
      </details>
    </> : null}
  </div>
}

function RoutineItemEditor({
  question,
  questions,
  index,
  onMove,
  onRemove,
  onSave,
}: {
  question: RoutineQuestion
  questions: readonly RoutineQuestion[]
  index: number
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  onSave: (changes: RoutineItemChanges) => Promise<void>
}) {
  const [baseline, setBaseline] = useState<ItemDraft>(() => itemDraft(question))
  const [draft, setDraft] = useState<ItemDraft>(() => itemDraft(question))
  const [open, setOpen] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [saveError, setSaveError] = useState('')
  const collapseTimer = useRef<number | undefined>(undefined)
  const resetTimer = useRef<number | undefined>(undefined)
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [baseline, draft])
  const valid = conditionIsComplete(draft.conditionalRule)

  useEffect(() => {
    const next = itemDraft(question)
    setBaseline(next)
    setDraft(next)
  }, [question])
  useEffect(() => () => {
    window.clearTimeout(collapseTimer.current)
    window.clearTimeout(resetTimer.current)
  }, [])

  function update(changes: Partial<ItemDraft>) {
    window.clearTimeout(resetTimer.current)
    window.clearTimeout(collapseTimer.current)
    setSaveState('idle')
    setSaveError('')
    setDraft((current) => ({ ...current, ...changes }))
  }

  async function save() {
    if (!dirty || !valid || saveState === 'saving') return
    setSaveState('saving')
    setSaveError('')
    try {
      await onSave({
        completionBehavior: draft.completionBehavior,
        trendTrackingMode: draft.trendTrackingMode,
        conditionalRule: draft.conditionalRule ?? null,
      })
      setBaseline(structuredClone(draft))
      setSaveState('saved')
      collapseTimer.current = window.setTimeout(() => setOpen(false), 350)
      resetTimer.current = window.setTimeout(() => setSaveState('idle'), 1800)
    } catch (reason) {
      setSaveState('idle')
      setSaveError(reason instanceof Error ? reason.message : 'Could not save these settings.')
      setOpen(true)
    }
  }

  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : 'Save Changes'
  return <article className={`routine-item${saveState === 'saved' ? ' routine-item--saved' : ''}`} style={{ '--routine-category-accent': effectiveCategoryColor(question.category) } as CSSProperties}>
    <div className="routine-item__top">
      <span className="emoji-icon" aria-hidden="true">{iconGlyph(question.trackable.icon)}</span>
      <div><h3>{question.version.name}</h3><small>{question.category.name} · {inputTypeLabel(question.version.inputType)}</small></div>
      <div className="routine-order">
        <button type="button" aria-label={`Move ${question.version.name} earlier`} disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
        <button type="button" aria-label={`Move ${question.version.name} later`} disabled={index === questions.length - 1} onClick={() => onMove(1)}>↓</button>
      </div>
    </div>
    <details
      className="routine-item__advanced"
      open={open}
      onToggle={(event) => {
        if (!event.currentTarget.open && dirty) { event.currentTarget.open = true; return }
        setOpen(event.currentTarget.open)
      }}
    >
      <summary>Question settings{dirty ? <span>Unsaved changes</span> : null}</summary>
      <div className="routine-item__advanced-body">
        <div className="routine-item__options">
          <label>Completion<select value={draft.completionBehavior} onChange={(event) => update({ completionBehavior: event.target.value as CompletionBehavior })}><option value="optional">Optional</option><option value="expected">Usual / expected</option></select></label>
          <label>Trend question<select value={draft.trendTrackingMode} onChange={(event) => update({ trendTrackingMode: event.target.value as TrendTrackingMode })}><option value="none">Off</option><option value="better_same_worse">Better / Same / Worse</option><option value="new_improving_same_worsening">New / Improving / Same / Worsening</option></select></label>
        </div>
        <ConditionEditor question={question} questions={questions} rule={draft.conditionalRule} onChange={(conditionalRule) => update({ conditionalRule })} />
        {!valid ? <p className="form-error">Choose at least one value before saving this condition.</p> : null}
        {saveError ? <p className="notice notice--error" role="alert">{saveError}</p> : null}
        <div className="routine-item__save-row">
          <button type="button" className={`primary-button item-save-button${saveState === 'saved' ? ' item-save-button--success' : ''}`} disabled={!dirty || !valid || saveState === 'saving'} onClick={() => void save()}>{saveLabel}</button>
        </div>
      </div>
    </details>
    <span className={`item-save-status${saveState === 'saved' ? ' item-save-status--success' : ''}`} role="status" aria-live="polite">{saveState === 'saved' ? `✓ ${question.version.name} settings saved.` : saveState === 'saving' ? `Saving ${question.version.name} settings…` : ''}</span>
    <button type="button" className="text-button text-button--danger" onClick={onRemove}>Remove from Routine</button>
  </article>
}

export function RoutineSettingsScreen() {
  const [configuration, setConfiguration] = useState<RoutineConfiguration | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => setConfiguration(await checkInEngine.getConfiguration()), [])
  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load routine.')) }, [load])

  async function act(action: () => Promise<unknown>) {
    try { setError(''); await action(); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update routine.') }
  }

  async function saveItem(itemId: string, changes: RoutineItemChanges) {
    setError('')
    await checkInEngine.updateItem(itemId, changes)
    await load()
  }

  if (!configuration) return <div className="screen trackables-loading">Loading Daily Check-In…</div>
  return <section className="screen routine-settings">
    <header className="subpage-header"><InlineBackHeader to="/settings" label="Tracking setup" ariaLabel="Back to Settings" /><div className="routine-heading-row"><div><h1>Daily Check-In</h1><p className="screen__description">Choose only what belongs in your regular daily flow. Removing a question never deletes its Trackable.</p></div>{configuration.routine ? <Link className="bubble-action" to="/settings/nightly-check-in/add" aria-label="Add Trackables to Daily Check-In">＋</Link> : null}</div></header>
    {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
    {!configuration.routine ? <div className="empty-state"><span aria-hidden="true">☾</span><h2>Build your daily routine</h2><p>Start with a few active Trackables. You can adjust the order and details anytime.</p>{configuration.availableTrackables.length === 0 ? <Link className="primary-button" to="/trackables/add">Add a Trackable first</Link> : <button className="primary-button" type="button" onClick={() => void act(() => checkInEngine.createNightlyRoutine())}>Create Daily Check-In</button>}</div> : <>
      <section className="routine-list">
        <div className="section-heading"><h2>Your Questions</h2><span>{configuration.questions.length}</span></div>
        {configuration.questions.length === 0 ? <p className="notice">Add at least one question below to begin checking in.</p> : configuration.questions.map((question, index) => <RoutineItemEditor
          key={question.item.id}
          question={question}
          questions={configuration.questions}
          index={index}
          onMove={(direction) => void act(() => checkInEngine.moveItem(question.item.id, direction))}
          onRemove={() => void act(() => checkInEngine.removeTrackable(question.item.id))}
          onSave={(changes) => saveItem(question.item.id, changes)}
        />)}
      </section>
      {configuration.questions.length > 0 ? <Link className="primary-button" to="/check-in">Open Today’s Check-In</Link> : null}
    </>}
  </section>
}

export function AddToDailyCheckInScreen() {
  const [configuration, setConfiguration] = useState<RoutineConfiguration | null>(null)
  const [search, setSearch] = useState(''); const [categoryId, setCategoryId] = useState('all')
  const load = useCallback(async () => setConfiguration(await checkInEngine.getConfiguration()), [])
  useEffect(() => { void load() }, [load])
  if (!configuration) return <div className="screen trackables-loading">Loading Trackables…</div>
  const selected = new Set(configuration.questions.map((item) => item.trackable.id))
  const items = [...configuration.questions, ...configuration.availableTrackables].filter((item) => (categoryId === 'all' || item.category.id === categoryId) && `${item.version.name} ${item.category.name}`.toLowerCase().includes(search.toLowerCase()))
  const categories = configuration.questions.concat(configuration.availableTrackables).map((item) => item.category).filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
  return <section className="screen routine-picker"><header className="subpage-header"><InlineBackHeader to="/settings/nightly-check-in" label="Daily Check-In" ariaLabel="Back to Daily Check-In" /><h1>Add to Daily Check-In</h1><p className="screen__description">Choose which Trackables belong in your Daily Check-In.</p></header><TrackableFilterControls categories={categories} search={search} categoryId={categoryId} onSearchChange={setSearch} onCategoryChange={setCategoryId} searchLabel="Search Daily Check-In Trackables" placeholder="Search Trackables" /><div className="routine-picker__list">{items.map((item) => <article className="preset-tile routine-picker__item" style={{ '--routine-category-accent': effectiveCategoryColor(item.category) } as CSSProperties} key={item.trackable.id}><span className="collection-card__icon">{iconGlyph(item.trackable.icon)}</span><div><h3>{item.version.name}</h3><p>{item.category.name}</p></div><button className={`tile-action${selected.has(item.trackable.id) ? ' is-added' : ''}`} type="button" onClick={() => void (selected.has(item.trackable.id) ? checkInEngine.removeTrackable(configuration.questions.find((question) => question.trackable.id === item.trackable.id)!.item.id) : checkInEngine.addTrackable(item.trackable.id)).then(load)}>{selected.has(item.trackable.id) ? 'Added' : 'Add'}</button></article>)}</div></section>
}
