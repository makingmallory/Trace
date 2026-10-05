import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'

export interface ChartTooltipContent {
  id: string
  title: string
  lines: readonly string[]
  x: number
  y: number
}

export interface ChartTooltipController {
  rootRef: RefObject<HTMLDivElement | null>
  tooltip: ChartTooltipContent | null
  show: (content: ChartTooltipContent) => void
  dismiss: () => void
  markerProps: (content: ChartTooltipContent) => {
    tabIndex: number
    role: 'button'
    'aria-label': string
    onPointerEnter: () => void
    onFocus: () => void
    onClick: (event: MouseEvent) => void
    onKeyDown: (event: KeyboardEvent<SVGElement | HTMLButtonElement>) => void
  }
}

export function useChartTooltip(): ChartTooltipController {
  const rootRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<ChartTooltipContent | null>(null)
  const dismiss = () => setTooltip(null)
  useEffect(() => {
    const dismissOutside = (event: globalThis.PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) dismiss()
    }
    document.addEventListener('pointerdown', dismissOutside)
    return () => document.removeEventListener('pointerdown', dismissOutside)
  }, [])
  const show = (content: ChartTooltipContent) => setTooltip(content)
  const markerProps = (content: ChartTooltipContent) => ({
    tabIndex: 0 as const,
    role: 'button' as const,
    'aria-label': [content.title, ...content.lines].join('. '),
    onPointerEnter: () => show(content),
    onFocus: () => show(content),
    onClick: (event: MouseEvent) => { event.stopPropagation(); show(content) },
    onKeyDown: (event: KeyboardEvent<SVGElement | HTMLButtonElement>) => {
      if (event.key === 'Escape') { event.preventDefault(); dismiss() }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(content) }
    },
  })
  return { rootRef, tooltip, show, dismiss, markerProps }
}
