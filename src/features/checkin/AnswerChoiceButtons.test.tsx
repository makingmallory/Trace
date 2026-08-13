import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnswerChoiceButtons } from './AnswerChoiceButtons.tsx'
import { toggleAnswerChoice } from './answerChoiceSelection.ts'

describe('AnswerChoiceButtons', () => {
  it('renders long labels in full and preserves selected-state semantics', () => {
    const markup = renderToStaticMarkup(createElement(AnswerChoiceButtons, {
      choices: [{ id: 'programming', label: 'Programming and creative problem solving' }],
      selectedIds: ['programming'],
      multiple: false,
      label: 'Creativity',
      onChange: () => undefined,
    }))
    expect(markup).toContain('Programming and creative problem solving')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).not.toContain('…')
  })

  it('keeps Single Choice and Multi Choice selection behavior intact', () => {
    expect(toggleAnswerChoice([], 'programming', false)).toEqual(['programming'])
    expect(toggleAnswerChoice(['programming'], 'programming', false)).toEqual([])
    expect(toggleAnswerChoice(['writing'], 'programming', true)).toEqual(['writing', 'programming'])
    expect(toggleAnswerChoice(['writing', 'programming'], 'programming', true)).toEqual(['writing'])
  })
})
