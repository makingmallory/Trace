import type { InputType, Observation, ObservationAnswer } from '../../domain/models/index.ts'

export function questionControlKind(inputType: InputType): 'buttons' | 'number' | 'time' | 'text' {
  if (inputType === 'scale' || inputType === 'boolean' || inputType === 'single_choice' || inputType === 'multi_select') return 'buttons'
  if (inputType === 'number' || inputType === 'duration') return 'number'
  return inputType
}

export function answerFromInput(inputType: InputType, rawValue: string, unit?: string): ObservationAnswer {
  if (rawValue === '') return { state: 'unanswered' }
  if (inputType === 'number') return { state: 'answered', value: { kind: 'number', value: Number(rawValue), ...(unit ? { unit } : {}) } }
  if (inputType === 'duration') return { state: 'answered', value: { kind: 'duration', value: Number(rawValue), unit: 'minutes' } }
  if (inputType === 'time') return { state: 'answered', value: { kind: 'time', value: rawValue } }
  return { state: 'answered', value: { kind: 'text', value: rawValue } }
}

export function scalarInputValue(observation: Observation | undefined): string | number {
  if (!observation || observation.answer.state !== 'answered') return ''
  const value = observation.answer.value
  return value.kind === 'choice' || value.kind === 'boolean' ? '' : value.value
}
