import type { CSSProperties } from 'react'
import type { ChartTooltipContent } from './chartTooltipInteraction.ts'

export function ChartTooltip({ tooltip }: { tooltip: ChartTooltipContent | null }) {
  if (!tooltip) return null
  const horizontal = tooltip.x < 18 ? ' chart-tooltip--left' : tooltip.x > 82 ? ' chart-tooltip--right' : ''
  const vertical = tooltip.y < 34 ? ' chart-tooltip--below' : ''
  return <div className={`chart-tooltip${horizontal}${vertical}`} role="status" style={{ '--chart-tooltip-x': `${tooltip.x}%`, '--chart-tooltip-y': `${tooltip.y}%` } as CSSProperties}>
    <strong>{tooltip.title}</strong>
    {tooltip.lines.map((line) => <span key={line}>{line}</span>)}
  </div>
}
