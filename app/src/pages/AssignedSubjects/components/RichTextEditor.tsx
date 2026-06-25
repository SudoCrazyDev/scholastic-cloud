import React, { useEffect, useRef } from 'react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'

interface RichTextEditorProps {
  value: string
  onChange?: (html: string) => void
  editable?: boolean
  placeholder?: string
}

const TOOLBAR = [
  [{ header: [1, 2, false] }],
  ['bold', 'italic'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link'],
]

// Quill represents an empty editor as "<p><br></p>" — treat that as empty so
// blank descriptions store as "" (and placeholders show).
const normalize = (html: string) => (html === '<p><br></p>' ? '' : html)

/**
 * Quill (snow theme) rich text editor. With `editable={false}` it renders the
 * same content read-only (used by LessonContentViewer) with no toolbar/border.
 */
export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  editable = true,
  placeholder,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)
  const onChangeRef = useRef(onChange)
  const settingRef = useRef(false)
  onChangeRef.current = onChange

  // Create the Quill instance once. Wipe the host first so a prior
  // StrictMode dev pass (setup → cleanup → setup) can't leave a second editor.
  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    host.innerHTML = ''
    const editorEl = document.createElement('div')
    host.appendChild(editorEl)

    const quill = new Quill(editorEl, {
      theme: 'snow',
      placeholder,
      readOnly: !editable,
      modules: { toolbar: editable ? TOOLBAR : false },
    })
    quillRef.current = quill

    if (value) {
      settingRef.current = true
      quill.clipboard.dangerouslyPasteHTML(value)
      settingRef.current = false
    }

    quill.on('text-change', () => {
      if (settingRef.current) return
      onChangeRef.current?.(normalize(quill.root.innerHTML))
    })

    return () => {
      quillRef.current = null
      host.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes (read-only re-renders / programmatic resets),
  // but never while the user is actively typing.
  useEffect(() => {
    const quill = quillRef.current
    if (!quill || quill.hasFocus()) return
    if (normalize(value || '') === normalize(quill.root.innerHTML)) return
    settingRef.current = true
    quill.setContents([] as any)
    if (value) quill.clipboard.dangerouslyPasteHTML(value)
    settingRef.current = false
  }, [value])

  useEffect(() => {
    quillRef.current?.enable(editable)
  }, [editable])

  return (
    <div className={editable ? 'lesson-quill' : 'lesson-quill lesson-quill--readonly'}>
      <div ref={containerRef} />
    </div>
  )
}

export default RichTextEditor
