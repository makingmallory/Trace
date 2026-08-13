export function toggleAnswerChoice(selectedIds: readonly string[], choiceId: string, multiple: boolean): readonly string[] {
  const selected = selectedIds.includes(choiceId)
  return multiple
    ? selected ? selectedIds.filter((id) => id !== choiceId) : [...selectedIds, choiceId]
    : selected ? [] : [choiceId]
}
