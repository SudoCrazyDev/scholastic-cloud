import React, { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import clsx from 'clsx'

interface MessageComposerProps {
  disabled: boolean
  sending: boolean
  placeholder: string
  onSend: (body: string) => void
}

const MAX_HEIGHT = 160
const MAX_LENGTH = 4000

export const MessageComposer: React.FC<MessageComposerProps> = ({
  disabled,
  sending,
  placeholder,
  onSend,
}) => {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Grow with the text up to a ceiling, then scroll.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return

    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  const submit = () => {
    const body = value.trim()
    if (!body || disabled || sending) return

    onSend(body)
    setValue('')
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter breaks the line. IME composition is left alone,
    // or typing Filipino with an input method would send half a word.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-zinc-200 bg-white px-4 py-3 sm:px-6">
      <div
        className={clsx(
          'flex items-end gap-2 rounded-2xl border bg-white px-3 py-2 transition-colors',
          disabled ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-300 focus-within:border-zinc-400',
        )}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          maxLength={MAX_LENGTH}
          placeholder={placeholder}
          onChange={event => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          className="max-h-[160px] flex-1 resize-none bg-transparent py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none disabled:cursor-not-allowed"
        />

        <button
          type="button"
          onClick={submit}
          disabled={disabled || sending || value.trim() === ''}
          aria-label="Send message"
          className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-700 disabled:bg-zinc-200 disabled:text-zinc-400"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default MessageComposer
