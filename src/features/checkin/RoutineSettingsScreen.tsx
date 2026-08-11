import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
            : source.options.map((option) => ({ id: option.optionId, label: option.label, icon: option.icon?.value }))}
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

  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : 'Save changes'
  return <article className={`routine-item${saveState === 'saved' ? ' routine-item--saved' : ''}`}>
    <div className="routine-item__top">
      <span aria-hidden="true">{question.trackable.icon?.value ?? '✦'}</span>
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
    <button type="button" className="text-button text-button--danger" onClick={onRemove}>Remove from routine</button>
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

  if (!configuration) return <div className="screen trackables-loading">Loading Nightly Check-In…</div>
  return <section className="screen routine-settings">
    <header className="subpage-header"><Link className="back-link" to="/settings">← Settings</Link><p className="eyebrow">Tracking setup</p><h1>Nightly Check-In</h1><p className="screen__description">Choose only what belongs in your regular evening flow. Removing a question never deletes its Trackable.</p></header>
    {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
    {!configuration.routine ? <div className="empty-state"><span aria-hidden="true">☾</span><h2>Build your nightly routine</h2><p>Start with a few active Trackables. You can adjust the order and details anytime.</p>{configuration.availableTrackables.length === 0 ? <Link className="primary-button" to="/trackables/add">Add a Trackable first</Link> : <button className="primary-button" type="button" onClick={() => void act(() => checkInEngine.createNightlyRoutine())}>Create Nightly Check-In</button>}</div> : <>
      <section className="routine-list">
        <div className="section-heading"><h2>Your questions</h2><span>{configuration.questions.length}</span></div>
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
      <section className="routine-add"><div className="section-heading"><h2>Add active Trackables</h2><span>{configuration.availableTrackables.length}</span></div>{configuration.availableTrackables.length === 0 ? <p className="notice">All active Trackables are already included.</p> : <div className="routine-add__grid">{configuration.availableTrackables.map((question) => <button type="button" key={question.trackable.id} onClick={() => void act(() => checkInEngine.addTrackable(question.trackable.id))}><span aria-hidden="true">{question.trackable.icon?.value ?? '✦'}</span><span>{question.version.name}<small>{question.category.name}</small></span><b aria-hidden="true">＋</b></button>)}</div>}</section>
      {configuration.questions.length > 0 ? <Link className="primary-button" to="/check-in">Open today’s Check-In</Link> : null}
    </>}
  </section>
}
