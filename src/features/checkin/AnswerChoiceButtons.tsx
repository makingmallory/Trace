export interface AnswerChoice {
  id: string
  label: string
  icon?: string
}

export function AnswerChoiceButtons({
  choices,
  selectedIds,
  multiple,
  labelledBy,
  label,
  disabled = false,
  onChange,
}: {
  choices: readonly AnswerChoice[]
  selectedIds: readonly string[]
  multiple: boolean
  labelledBy?: string
  label?: string
  disabled?: boolean
  onChange: (selectedIds: readonly string[]) => void
}) {
  return <div className="answer-buttons" role="group" aria-labelledby={labelledBy} aria-label={label}>
    {choices.map((choice) => {
      const selected = selectedIds.includes(choice.id)
      return <button
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        key={choice.id}
        onClick={() => onChange(multiple
          ? selected ? selectedIds.filter((id) => id !== choice.id) : [...selectedIds, choice.id]
          : selected ? [] : [choice.id])}
      >
        {choice.icon ? <span className="emoji-icon" aria-hidden="true">{choice.icon}</span> : null}
        <span>{choice.label}</span>
      </button>
    })}
  </div>
}
