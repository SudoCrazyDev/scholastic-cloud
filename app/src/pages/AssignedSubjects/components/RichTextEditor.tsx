import React, { useEffect, useRef } from 'react'
import Quill from 'quill'
import clsx from 'clsx'
import 'quill/dist/quill.snow.css'

interface RichTextEditorProps {
  value: string
  onChange?: (html: string) => void
  editable?: boolean
  placeholder?: string
  /** Shorter default height (matches a small textarea) for inline forms. */
  compact?: boolean
  /**
   * Enables the image toolbar button. Receives the picked file, uploads it,
   * and resolves to the public URL to embed — or null to cancel (e.g. after
   * showing an error toast).
   */
  onImageUpload?: (file: File) => Promise<string | null>
}

const TOOLBAR = [
  [{ header: [1, 2, false] }],
  ['bold', 'italic'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link'],
]

const TOOLBAR_WITH_IMAGE = [...TOOLBAR.slice(0, -1), ['link', 'image']]

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

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
  compact = false,
  onImageUpload,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)
  const onChangeRef = useRef(onChange)
  const onImageUploadRef = useRef(onImageUpload)
  const settingRef = useRef(false)
  onChangeRef.current = onChange
  onImageUploadRef.current = onImageUpload

  // Create the Quill instance once. Wipe the host first so a prior
  // StrictMode dev pass (setup → cleanup → setup) can't leave a second editor.
  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    host.innerHTML = ''
    const editorEl = document.createElement('div')
    host.appendChild(editorEl)

    const withImage = Boolean(onImageUploadRef.current)
    const quill = new Quill(editorEl, {
      theme: 'snow',
      placeholder,
      readOnly: !editable,
      modules: {
        toolbar: editable
          ? {
              container: withImage ? TOOLBAR_WITH_IMAGE : TOOLBAR,
              handlers: withImage
                ? {
                    image: () => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = IMAGE_ACCEPT
                      input.onchange = async () => {
                        const file = input.files?.[0]
                        const upload = onImageUploadRef.current
                        if (!file || !upload) return
                        const range = quill.getSelection(true)
                        const url = await upload(file)
                        if (!url || quillRef.current !== quill) return
                        quill.insertEmbed(range.index, 'image', url, 'user')
                        quill.setSelection(range.index + 1)
                      }
                      input.click()
                    },
                  }
                : {},
            }
          : false,
      },
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
    <div
      className={clsx(
        'lesson-quill',
        !editable && 'lesson-quill--readonly',
        compact && 'lesson-quill--compact'
      )}
    >
      <div ref={containerRef} />
    </div>
  )
}

export default RichTextEditor
