import data from '@emoji-mart/data'
import { Picker } from 'emoji-mart'
import { useEffect, useRef } from 'react'

interface EmojiMartValue { native?: string; skins?: readonly { native?: string }[] }

export function TraceEmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const hostElement = host.current
    const element = new Picker({
      data, set: 'native', theme: 'light', previewPosition: 'none', skinTonePosition: 'search', perLine: 8,
      emojiButtonSize: 34, emojiSize: 22, maxFrequentRows: 2,
      onEmojiSelect: (emoji: EmojiMartValue) => {
        const native = emoji.native ?? emoji.skins?.[0]?.native
        if (native) onSelectRef.current(native)
      },
    })
    hostElement?.replaceChildren(element as unknown as Node)
    return () => hostElement?.replaceChildren()
  }, [])

  return <div className="trace-emoji-picker"><div className="trace-emoji-picker__mart" ref={host} /></div>
}
