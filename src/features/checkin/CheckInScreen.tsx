import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { OccurrenceConflictError, type CheckInSnapshot, type RoutineQuestion, type SavedAnswer } from '../../domain/checkin/CheckInEngine.ts'
import { checkInEngine } from './checkInEngine.ts'
import { QuestionInput } from './QuestionInput.tsx'
import { iconGlyph } from '../../presets/iconLibrary.ts'
import { shouldReturnHomeAfterCompletion } from './checkInNavigation.ts'
import { evaluateConditionalRule } from '../../domain/checkin/conditionalRules.ts'

export function CheckInScreen() {
  const navigate = useNavigate()
  const { localDate = '' } = useParams()
  const historical = /^\d{4}-\d{2}-\d{2}$/.test(localDate)
  const [snapshot, setSnapshot] = useState<CheckInSnapshot | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [completionSaving, setCompletionSaving] = useState(false)
  const [hasCompletedEdits, setHasCompletedEdits] = useState(false)
  const [warning, setWarning] = useState<readonly string[]>([])
  const [savedMessage, setSavedMessage] = useState('')
  const messageTimer = useRef<number | undefined>(undefined)

  useEffect(() => { void checkInEngine.getOrCreateToday(historical ? localDate : undefined).then(setSnapshot).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not open Check-In.')) }, [historical, localDate])
  useEffect(() => () => window.clearTimeout(messageTimer.current), [])

  const groups = useMemo(() => {
    const result = new Map<string, RoutineQuestion[]>()
    for (const question of snapshot?.visibleQuestions ?? []) result.set(question.category.name, [...(result.get(question.category.name) ?? []), question])
    return [...result.entries()]
  }, [snapshot])

  function flash(message: string) {
    window.clearTimeout(messageTimer.current)
    setSavedMessage(message)
    messageTimer.current = window.setTimeout(() => setSavedMessage(''), 2200)
  }

  async function save(trackableId: string, answer: SavedAnswer) {
    if (!snapshot) return
    const editingCompleted = snapshot.record.status === 'completed'
    setSaving(true)
    setError('')
    setSavedMessage('')
    try {
      setSnapshot(await checkInEngine.saveAnswer(snapshot.record.id, trackableId, answer))
      if (editingCompleted) setHasCompletedEdits(true)
      flash(editingCompleted ? 'Changes saved locally' : 'Saved locally')
    } catch (reason) {
      if (reason instanceof OccurrenceConflictError && window.confirm(`${reason.trackableName} was already logged today. Remove the existing ${reason.recordIds.length === 1 ? 'entry' : 'entries'} and save No?`)) {
        try { setSnapshot(await checkInEngine.resolveQuickLogNo(snapshot.record.id, trackableId)); flash('Existing entry removed and No saved'); return }
        catch (conflictReason) { setError(conflictReason instanceof Error ? conflictReason.message : 'Could not resolve this conflict.'); return }
      }
      setError(reason instanceof Error ? reason.message : 'Could not save this answer.')
    } finally {
      setSaving(false)
    }
  }

  async function finish(confirm = false) {
    if (!snapshot) return
    const editingCompleted = snapshot.record.status === 'completed'
    setCompletionSaving(true)
    setError('')
    setSavedMessage('')
    try {
      const result = await checkInEngine.complete(snapshot.record.id, confirm)
      setSnapshot(result.snapshot)
      if (!result.completed) {
        setWarning(result.expectedUnanswered.map((question) => question.version.name))
        return
      }
      setWarning([])
      setHasCompletedEdits(false)
      if (editingCompleted) flash('Changes saved')
      if (shouldReturnHomeAfterCompletion(historical, editingCompleted, result.completed)) navigate('/', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not finish this Check-In.')
    } finally {
      setCompletionSaving(false)
    }
  }

  if (error && !snapshot) return <section className="screen"><header className="subpage-header"><Link className="back-link" to={historical ? `/history?date=${localDate}` : '/'}>← {historical ? 'History' : 'Home'}</Link><p className="eyebrow">Daily Check-In</p><h1>Set up your questions</h1><p className="screen__description">{error}</p></header><Link className="primary-button" to="/settings/nightly-check-in">Configure Daily Check-In</Link></section>
  if (!snapshot) return <div className="screen trackables-loading">Opening today’s Check-In…</div>

  const completed = snapshot.record.status === 'completed'
  const primaryLabel = completionSaving
    ? completed ? 'Saving changes…' : 'Finishing…'
    : completed
      ? hasCompletedEdits ? 'Save Changes' : '✓ Completed'
      : 'Finish Check-In'
  const statusDetail = saving
    ? completed ? 'Saving changes…' : 'Saving locally…'
    : savedMessage

  return <section className="screen checkin-screen">
    <header className="checkin-header"><div><Link className="back-link" to={historical ? `/history?date=${snapshot.record.localDate}` : '/'}>← {historical ? 'History' : 'Home'}</Link><p className="eyebrow">{historical ? 'Editing past date' : snapshot.record.localDate}</p><h1>Daily Check-In</h1><p className="screen__description">{historical ? `Editing ${snapshot.record.localDate}. Changes stay attached to this original Check-In.` : completed ? 'Today is complete. You can still edit any answer below.' : 'One gentle scroll. Every answer saves to this device as you go.'}</p></div><Link className="manage-link" to="/settings/nightly-check-in">Edit Questions</Link></header>
    <div className="save-status" role="status" aria-live="polite">
      <span className={`status-dot status-dot--${snapshot.record.status}`} aria-hidden="true" />
      <strong>{completed ? '✓ Completed' : 'Draft'}</strong>
      {statusDetail ? <span className="save-status__detail">{statusDetail}</span> : null}
    </div>
    {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
    <form className="checkin-form" onSubmit={(event) => { event.preventDefault(); void finish() }}>
      <div className="section-heading"><h2>Usual Questions</h2></div>
      {groups.map(([category, questions]) => <section className="checkin-category" key={category}><h2>{category}</h2><div className="question-stack">{questions.map((question) => {
        const observation = snapshot.observations.find((item) => item.trackableId === question.trackable.id)
        const selections = observation ? snapshot.selections.filter((item) => item.observationId === observation.id) : []
        const quickLogCount = snapshot.quickLogSummaries[question.trackable.id]
        const fieldInputs = (question.fields ?? []).filter(({ field }) => {
          return evaluateConditionalRule(field.conditionalRule, snapshot.effectiveAnswers)
        })
        return <article className="question-card" key={question.item.id}><div className="question-card__heading"><span className="emoji-icon" aria-hidden="true">{iconGlyph(question.trackable.icon)}</span><div><h3 id={`question-${question.item.id}`}>{question.version.name}</h3>{question.version.description ? <p>{question.version.description}</p> : null}{quickLogCount ? <p>{quickLogCount} logged today</p> : null}</div>{question.item.completionBehavior === 'expected' ? <small>Usual</small> : null}</div><QuestionInput question={question} observation={observation} selections={selections} prefill={snapshot.defaultAnswers[question.trackable.id]} disabled={saving || completionSaving} onSave={(answer) => void save(question.trackable.id, answer)} />{fieldInputs.length ? <div className="structured-fields">{fieldInputs.map((field) => { const fieldObservation = snapshot.observations.find((item) => item.trackableId === field.trackable.id); const fieldSelections = fieldObservation ? snapshot.selections.filter((item) => item.observationId === fieldObservation.id) : []; const fieldQuestion = { ...question, item: { ...question.item, id: `${question.item.id}-${field.field.id}` }, trackable: field.trackable, version: field.version, options: field.options, category: field.category }; return <div key={field.field.id}><h4 id={`question-${question.item.id}-${field.field.id}`}>{field.version.name}{field.field.required ? ' *' : ''}</h4><QuestionInput question={fieldQuestion} observation={fieldObservation} selections={fieldSelections} disabled={saving || completionSaving} onSave={(answer) => void save(field.trackable.id, answer)} /></div> })}</div> : null}</article>
      })}</div></section>)}
      {snapshot.loggedToday.length ? <section className="checkin-category"><h2>Logged Today</h2><p className="screen__description">For review only—nothing else to answer.</p><div className="question-stack">{snapshot.loggedToday.map((item) => <Link className="question-card" key={item.trackable.id} to={`/history/quick-log/${encodeURIComponent(item.recordId)}/edit`}><div className="question-card__heading"><span className="emoji-icon" aria-hidden="true">{iconGlyph(item.trackable.icon)}</span><div><h3>{item.version.name}</h3><p>{item.timing ? item.timing.replace(/\b\w/g, (letter) => letter.toUpperCase()) : `${item.count} ${item.count === 1 ? 'entry' : 'entries'}`}</p></div></div></Link>)}</div></section> : null}
      {warning.length > 0 ? <div className="completion-warning" role="alert"><h2>Finish with unanswered questions?</h2><p>You left {warning.length} usual {warning.length === 1 ? 'question' : 'questions'} unanswered: {warning.join(', ')}.</p><p>That’s okay—unanswered stays unknown.</p><div><button type="button" className="secondary-button" onClick={() => setWarning([])}>Keep Checking In</button><button type="button" className="primary-button" onClick={() => void finish(true)}>Finish Anyway</button></div></div> : null}
      <button type="submit" className={`primary-button finish-button${completed && !hasCompletedEdits && !completionSaving ? ' finish-button--complete' : ''}`} disabled={saving || completionSaving || (completed && !hasCompletedEdits)}>{primaryLabel}</button>
    </form>
  </section>
}
