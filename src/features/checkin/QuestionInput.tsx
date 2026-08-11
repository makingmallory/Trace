import { useEffect, useState } from 'react'
import type { Observation, ObservationAnswer, ObservationOptionSelection } from '../../domain/models/index.ts'
import type { RoutineQuestion, SavedAnswer } from '../../domain/checkin/CheckInEngine.ts'
import { answerFromInput, scalarInputValue } from './questionInput.ts'
import { AnswerChoiceButtons } from './AnswerChoiceButtons.tsx'

interface Props {
  question: RoutineQuestion
  observation?: Observation
  selections: readonly ObservationOptionSelection[]
  disabled?: boolean
  onSave: (answer: SavedAnswer) => void
}

function trendChoices(mode: RoutineQuestion['item']['trendTrackingMode']): readonly string[] {
  if (mode === 'better_same_worse') return ['Better', 'Same', 'Worse']
  if (mode === 'new_improving_same_worsening') return ['New', 'Improving', 'Same', 'Worsening']
  return []
}

export function QuestionInput({ question, observation, selections, disabled = false, onSave }: Props) {
  const { version, options } = question
  const currentAnswer: ObservationAnswer = observation?.answer ?? { state: 'unanswered' }
  const selectedIds = selections.map((selection) => selection.optionId)
  const save = (answer: ObservationAnswer, nextSelections: readonly string[] = selectedIds, trendValue = observation?.trendValue) => onSave({ answer, selectedOptionIds: nextSelections, trendValue })
  const labelId = `question-${question.item.id}`
  const [draftValue, setDraftValue] = useState<string | number>(() => scalarInputValue(observation))
  useEffect(() => setDraftValue(scalarInputValue(observation)), [observation])

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
    control = <AnswerChoiceButtons choices={options.map((option) => ({ id: option.optionId, label: option.label, icon: option.icon?.value }))} selectedIds={selectedIds} multiple={false} labelledBy={labelId} disabled={disabled} onChange={(next) => save(next.length ? { state: 'answered', value: { kind: 'choice', value: null } } : { state: 'unanswered' }, next)} />
  } else if (version.inputType === 'multi_select') {
    control = <AnswerChoiceButtons choices={options.map((option) => ({ id: option.optionId, label: option.label, icon: option.icon?.value }))} selectedIds={selectedIds} multiple labelledBy={labelId} disabled={disabled} onChange={(next) => save(next.length ? { state: 'answered', value: { kind: 'choice', value: null } } : { state: 'unanswered' }, next)} />
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
      {currentAnswer.state === 'answered' ? <button type="button" className="text-button" disabled={disabled} onClick={() => save({ state: 'unanswered' }, [])}>Clear answer</button> : <span className="unanswered-label">Not answered</span>}
    </div>
    {trends.length > 0 ? <fieldset className="trend-question" disabled={disabled}><legend>Compared with yesterday?</legend><div className="answer-buttons answer-buttons--compact">{trends.map((trend) => <button type="button" aria-pressed={observation?.trendValue === trend} key={trend} onClick={() => save(currentAnswer, selectedIds, trend)}>{trend}</button>)}</div></fieldset> : null}
  </div>
}
