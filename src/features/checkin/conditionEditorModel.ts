import type { ConditionalRule, InputType, RuleOperator } from '../../domain/models/index.ts'

export interface OperatorOption {
  value: RuleOperator
  label: string
}

const answered: OperatorOption = { value: 'isAnswered', label: 'Is answered' }

export function operatorOptionsFor(inputType: InputType): readonly OperatorOption[] {
  switch (inputType) {
    case 'boolean':
      return [{ value: 'equals', label: 'Is' }, answered]
    case 'scale':
    case 'number':
    case 'duration':
      return [
        { value: 'equals', label: 'Equals' },
        { value: 'greaterThan', label: 'Greater than' },
        { value: 'lessThan', label: 'Less than' },
        answered,
      ]
    case 'single_choice':
      return [
        { value: 'equals', label: 'Is' },
        { value: 'notEquals', label: 'Is not' },
        { value: 'anyOf', label: 'Is any of' },
        answered,
      ]
    case 'multi_select':
      return [
        { value: 'contains', label: 'Contains' },
        { value: 'containsAny', label: 'Contains any of' },
        answered,
      ]
    case 'time':
      return [
        { value: 'equals', label: 'Is' },
        { value: 'notEquals', label: 'Is not' },
        answered,
      ]
    case 'text':
      return [
        { value: 'equals', label: 'Is' },
        { value: 'notEquals', label: 'Is not' },
        { value: 'contains', label: 'Contains' },
        answered,
      ]
  }
}

export function isMultiValueOperator(operator: RuleOperator): boolean {
  return operator === 'anyOf' || operator === 'containsAny'
}

export function conditionIsComplete(rule: ConditionalRule | undefined): boolean {
  if (!rule) return true
  if (rule.operator === 'isAnswered') return true
  if (isMultiValueOperator(rule.operator)) return Array.isArray(rule.expectedValue) && rule.expectedValue.length > 0
  return rule.expectedValue !== undefined && rule.expectedValue !== ''
}

export function inputTypeLabel(inputType: InputType): string {
  const labels: Record<InputType, string> = {
    scale: 'Scale', boolean: 'Yes / No', single_choice: 'Single choice', multi_select: 'Multi-select',
    number: 'Number', duration: 'Duration', time: 'Time', text: 'Notes',
  }
  return labels[inputType]
}

export function categoricalTriggerRule(
  sourceTrackableId: string,
  inputType: Extract<InputType, 'boolean' | 'single_choice' | 'multi_select'>,
  selectedValues: readonly string[],
): ConditionalRule {
  if (inputType === 'boolean') {
    return {
      sourceTrackableId,
      operator: 'equals',
      expectedValue: selectedValues.length ? selectedValues[0] === 'true' : undefined,
    }
  }
  return {
    sourceTrackableId,
    operator: inputType === 'single_choice' ? 'anyOf' : 'containsAny',
    expectedValue: selectedValues,
  }
}
