import { useEffect, useState } from 'react'
import type { Observation, ObservationAnswer, ObservationOptionSelection } from '../../domain/models/index.ts'
import type { RoutineQuestion, SavedAnswer } from '../../domain/checkin/CheckInEngine.ts'
import { answerFromInput, scalarInputValue } from './questionInput.ts'
import { AnswerChoiceButtons } from './AnswerChoiceButtons.tsx'
import { iconGlyph } from '../../presets/iconLibrary.ts'

interface Props {
  question: RoutineQuestion
  observation?: Observation
  selections: readonly ObservationOptionSelection[]
  prefill?: SavedAnswer
  disabled?: boolean
  onSave: (answer: SavedAnswer) => void
}

function trendChoices(mode: RoutineQuestion['item']['trendTrackingMode']): readonly string[] {
  if (mode === 'better_same_worse') return ['Better', 'Same', 'Worse']
  if (mode === 'new_improving_same_worsening') return ['New', 'Improving', 'Same', 'Worsening']
  return []
}

export function QuestionInput({ question, observation, selections, prefill, disabled = false, onSave }: Props) {
  const { version, options } = question
  const currentAnswer: ObservationAnswer = observation?.answer ?? prefill?.answer ?? { state: 'unanswered' }
  const selectedIds = observation ? selections.map((selection) => selection.optionId) : [...(prefill?.selectedOptionIds ?? [])]
  const [customValue, setCustomValue] = useState(observation?.customChoiceValue ?? '')
  const [otherActive, setOtherActive] = useState(observation?.customChoiceValue !== undefined)
  const [promoteOther, setPromoteOther] = useState(false)
  const allowOther = version.configuration.allowOther === true
  const otherSelected = otherActive
  const save = (answer: ObservationAnswer, nextSelections: readonly string[] = selectedIds, trendValue = observation?.trendValue, customChoiceValue = observation?.customChoiceValue) => onSave({ answer, selectedOptionIds: [...new Set(nextSelections)], trendValue, customChoiceValue, promoteCustomChoice: Boolean(customChoiceValue && promoteOther) })
  const labelId = `question-${question.item.id}`
  const [draftValue, setDraftValue] = useState<string | number>(() => scalarInputValue(observation ?? (prefill ? { answer: prefill.answer } as Observation : undefined)))
  useEffect(() => setDraftValue(scalarInputValue(observation ?? (prefill ? { answer: prefill.answer } as Observation : undefined))), [observation, prefill])
  useEffect(() => setCustomValue(observation?.customChoiceValue ?? ''), [observation?.customChoiceValue])
  useEffect(() => setOtherActive(observation?.customChoiceValue !== undefined), [observation?.customChoiceValue])

  function changePromotion(checked: boolean) {
    setPromoteOther(checked)
    if (checked && customValue.trim()) onSave({ answer: { state: 'answered', value: { kind: 'choice', value: null } }, selectedOptionIds: selectedIds, trendValue: observation?.trendValue, customChoiceValue: customValue, promoteCustomChoice: true })
  }

  function clearOther(nextSelections: readonly string[]) {
    setOtherActive(false)
    setCustomValue('')
    setPromoteOther(false)
    onSave({
      answer: nextSelections.length ? { state: 'answered', value: { kind: 'choice', value: null } } : { state: 'unanswered' },
      selectedOptionIds: [...new Set(nextSelections)],
      trendValue: observation?.trendValue,
    })
  }

  function clearAnswer() {
    setOtherActive(false)
    setCustomValue('')
    setPromoteOther(false)
    onSave({ answer: { state: 'unanswered' }, selectedOptionIds: [], trendValue: observation?.trendValue })
  }

  let control
  if (version.inputType === 'scale') {
    const values: number[] = []
    for (let value = version.scaleMin ?? 0; value <= (version.scaleMax ?? 5); value += version.scaleStep ?? 1) values.push(value)
    const selected = currentAnswer.state === 'answered' && currentAnswer.value.kind === 'scale' ? currentAnswer.value.value : undefined
    control = <div className="answer-buttons answer-buttons--scale" role="group" aria-labelledby={labelId}>{values.map((value) => <button type="button" disabled={disabled} aria-pressed={selected === value} key={value} onClick={() => save({ state: 'answered', value: { kind: 'scale', value } })}>{value}</button>)}</div>
  } else if (version.inputType === 'boolean') {
    const selected = currentAnswer.state === 'answered' && currentAnswer.value.kind === 'boolean' ? currentAnswer.value.value : undefined
    control = <AnswerChoiceButtons choices={[{ id: 'false', label: 'No' }, { id: 'true', label: 'Yes' }]} selectedIds={selected === undefined ? [] : [String(selected)]} multiple={false} labelledBy={labelId} disabled={disabled} onChange={(next) => next.length ? save({ state: 'answered', value: { kind: 'boolean', value: next[0] === 'true' } }) : save({ state: 'unanswered' })} />
  } else if (version.inputType === 'single_choice') {
    const choices = [...options.map((option) => ({ id: option.optionId, label: option.label, icon: option.icon ? iconGlyph(option.icon) : undefined })), ...(allowOther ? [{ id: '__other__', label: 'Other' }] : [])]
    control = <><AnswerChoiceButtons choices={choices} selectedIds={otherSelected ? ['__other__'] : selectedIds} multiple={false} labelledBy={labelId} disabled={disabled} onChange={(next) => { if (next[0] === '__other__') { setOtherActive(true); setCustomValue(''); setPromoteOther(false); return } clearOther(next) }} />{otherSelected ? <div><label className="form-field"><span>Your answer</span><input value={customValue} required onChange={(event) => setCustomValue(event.target.value)} onBlur={() => { if (customValue.trim()) save({ state: 'answered', value: { kind: 'choice', value: null } }, [], observation?.trendValue, customValue) }} /></label><label><input type="checkbox" checked={promoteOther} onChange={(event) => changePromotion(event.target.checked)} /> Add this to my options</label></div> : null}</>
  } else if (version.inputType === 'multi_select') {
    const choices = [...options.map((option) => ({ id: option.optionId, label: option.label, icon: option.icon ? iconGlyph(option.icon) : undefined })), ...(allowOther ? [{ id: '__other__', label: 'Other' }] : [])]
    control = <><AnswerChoiceButtons choices={choices} selectedIds={[...selectedIds, ...(otherSelected ? ['__other__'] : [])]} multiple labelledBy={labelId} disabled={disabled} onChange={(next) => { const custom = next.includes('__other__'); const ids = next.filter((id) => id !== '__other__'); if (!custom) { clearOther(ids); return } if (!otherSelected) { setOtherActive(true); setCustomValue(''); setPromoteOther(false); return } if (customValue.trim()) save({ state: 'answered', value: { kind: 'choice', value: null } }, ids, observation?.trendValue, customValue) }} />{otherSelected ? <div><label className="form-field"><span>Your answer</span><input value={customValue} required onChange={(event) => setCustomValue(event.target.value)} onBlur={() => { if (customValue.trim()) save({ state: 'answered', value: { kind: 'choice', value: null } }, selectedIds, observation?.trendValue, customValue) }} /></label><label><input type="checkbox" checked={promoteOther} onChange={(event) => changePromotion(event.target.checked)} /> Add this to my options</label></div> : null}</>
  } else if (version.inputType === 'text') {
    control = <textarea disabled={disabled} id={`${labelId}-input`} aria-labelledby={labelId} rows={3} value={draftValue} placeholder="Optional notes" onChange={(event) => setDraftValue(event.target.value)} onBlur={() => save(answerFromInput('text', String(draftValue)))} />
  } else {
    const type = version.inputType === 'time' ? 'time' : 'number'
    control = <div className="answer-field"><input disabled={disabled} id={`${labelId}-input`} aria-labelledby={labelId} type={type} min={version.configuration.min as number | undefined} max={version.configuration.max as number | undefined} step={version.configuration.step as number | undefined} value={draftValue} onChange={(event) => { setDraftValue(event.target.value); if (version.inputType === 'time') save(answerFromInput('time', event.target.value)) }} onBlur={() => { if (version.inputType !== 'time') save(answerFromInput(version.inputType, String(draftValue), version.unit)) }} />{version.inputType === 'duration' ? <span>minutes</span> : version.unit ? <span>{version.unit}</span> : null}</div>
  }

  const trends = trendChoices(question.item.trendTrackingMode)
  return <div className="question-control">
    {control}
    <div className="question-actions">
      {currentAnswer.state === 'answered' ? <button type="button" className="text-button" disabled={disabled} onClick={clearAnswer}>Clear Answer</button> : <span className="unanswered-label">Not answered</span>}
    </div>
    {trends.length > 0 ? <fieldset className="trend-question" disabled={disabled}><legend>Compared with yesterday?</legend><div className="answer-buttons answer-buttons--compact">{trends.map((trend) => <button type="button" aria-pressed={observation?.trendValue === trend} key={trend} onClick={() => save(currentAnswer, selectedIds, trend)}>{trend}</button>)}</div></fieldset> : null}
  </div>
}
