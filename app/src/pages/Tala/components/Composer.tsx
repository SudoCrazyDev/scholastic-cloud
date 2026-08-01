import React, { useEffect, useRef, useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import clsx from 'clsx'

interface ComposerProps {
  disabled: boolean
  isStreaming: boolean
  placeholder: string
  onSend: (text: string) => void
  onStop: () => void
}

const MAX_HEIGHT = 200

export const Composer: React.FC<ComposerProps> = ({
  disabled,
  isStreaming,
  placeholder,
  onSend,
  onStop,
}) => {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Grow with the text up to a ceiling, then scroll — a teacher pasting a long
  // passage should not push the send button off the screen.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return

    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  const submit = () => {
    const text = value.trim()
    if (!text || disabled || isStreaming) return

    onSend(text)
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
          disabled ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-300 focus-within:border-zinc-400'
        )}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={event => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          className="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none disabled:cursor-not-allowed"
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-700"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={disabled || value.trim() === ''}
            aria-label="Send message"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-700 disabled:bg-zinc-200 disabled:text-zinc-400"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="mt-2 text-center text-xs text-zinc-400">
        Tala can be wrong. Check anything that goes to students or parents.
      </p>
    </div>
  )
}

export default Composer
