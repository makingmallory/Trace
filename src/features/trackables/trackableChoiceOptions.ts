import type { JsonValue } from '../../domain/models/index.ts'
import type { OptionDraft, TrackableDraft } from '../../domain/trackables/TrackableEngine.ts'

export function addChoiceOption(options: readonly OptionDraft[], optionId: string): readonly OptionDraft[] {
  return [...options, { optionId, label: '' }]
}

export function updateChoiceOption(options: readonly OptionDraft[], optionId: string, label: string): readonly OptionDraft[] {
  return options.map((option) => option.optionId === optionId ? { ...option, label } : option)
}

export function removeChoiceOption(options: readonly OptionDraft[], optionId: string): readonly OptionDraft[] {
  return options.filter((option) => option.optionId !== optionId)
}

export function moveChoiceOption(options: readonly OptionDraft[], optionId: string, direction: -1 | 1): readonly OptionDraft[] {
  const index = options.findIndex((option) => option.optionId === optionId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= options.length) return options
  const next = [...options]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function choiceIsOrdered(configuration: Readonly<Record<string, JsonValue>> | undefined): boolean {
  return Array.isArray(configuration?.orderedOptionIds)
}

export function choiceAnalysisConfiguration(draft: Pick<TrackableDraft, 'configuration' | 'inputType' | 'options'>, ordered: boolean): Readonly<Record<string, JsonValue>> {
  const { analysisMeasurementType: _measurement, orderedOptionIds: _order, ...rest } = draft.configuration ?? {}
  if (!ordered) return rest
  const orderedOptionIds = (draft.options ?? []).flatMap((option) => option.optionId ? [option.optionId] : [])
  return { ...rest, orderedOptionIds, ...(draft.inputType === 'single_choice' ? { analysisMeasurementType: 'ordinal' } : {}) }
}

export function removeChoiceFromDefault(defaultAnswer: TrackableDraft['defaultAnswer'], optionId: string): TrackableDraft['defaultAnswer'] {
  if (!defaultAnswer) return undefined
  const selectedOptionIds = (defaultAnswer.selectedOptionIds ?? []).filter((id) => id !== optionId)
  return selectedOptionIds.length ? { ...defaultAnswer, selectedOptionIds } : undefined
}
