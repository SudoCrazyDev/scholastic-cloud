import React, { useEffect, useState } from 'react'
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { studentDocumentService } from '../../../services/studentDocumentService'
import type { StudentDocument } from '../../../types'

interface Props {
  studentId: string
  document: StudentDocument
  onClose: () => void
}

type ReaderResult = {
  type: 'image' | 'pdf'
  text: string
  totalPages?: number
}

export function CrossCheckModal({ studentId, document, onClose }: Props) {
  const [result, setResult] = useState<ReaderResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isPdf = document.mime_type === 'application/pdf'

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await studentDocumentService.crossCheck(studentId, document.id)
        if (!cancelled) {
          if (response.success) {
            setResult(response.data)
          } else {
            setError(response.error ?? 'Extraction failed.')
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.response?.data?.error ?? 'Failed to reach document reader service.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [studentId, document.id])

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  // Parse text into labeled fields if possible (key: value lines)
  const parseStructuredData = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const fields: { label: string; value: string }[] = []
    const raw: string[] = []

    for (const line of lines) {
      const colonIdx = line.indexOf(':')
      if (colonIdx > 0 && colonIdx < 60) {
        const label = line.slice(0, colonIdx).trim()
        const value = line.slice(colonIdx + 1).trim()
        if (label && value) {
          fields.push({ label, value })
          continue
        }
      }
      raw.push(line)
    }

    return { fields, raw }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <MagnifyingGlassIcon className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-gray-900">Cross Check — {document.file_name}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left: File Preview */}
          <div className="w-1/2 border-r border-gray-200 overflow-auto bg-gray-50 flex items-start justify-center p-4">
            {isPdf ? (
              <iframe
                src={document.url}
                title="Document preview"
                className="w-full h-full min-h-[500px] rounded border border-gray-200"
              />
            ) : (
              <img
                src={document.url}
                alt={document.file_name}
                className="max-w-full rounded border border-gray-200 shadow-sm"
              />
            )}
          </div>

          {/* Right: Extracted Data */}
          <div className="w-1/2 overflow-auto p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Extracted Data
            </h3>

            {loading && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
                <span className="text-sm">Reading document...</span>
              </div>
            )}

            {error && !loading && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {result && !loading && (() => {
              const { fields, raw } = parseStructuredData(result.text)

              return (
                <div className="space-y-4">
                  {result.totalPages && (
                    <p className="text-xs text-gray-400">PDF — {result.totalPages} page{result.totalPages !== 1 ? 's' : ''}</p>
                  )}

                  {fields.length > 0 && (
                    <dl className="space-y-3">
                      {fields.map((f, i) => (
                        <div key={i} className="grid grid-cols-[auto_1fr] gap-x-3 items-start">
                          <dt className="text-xs font-medium text-gray-500 whitespace-nowrap pt-0.5">{f.label}</dt>
                          <dd className="text-sm text-gray-900 break-words">{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {raw.length > 0 && (
                    <div className={fields.length > 0 ? 'border-t border-gray-100 pt-4' : ''}>
                      {fields.length > 0 && (
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Additional text</p>
                      )}
                      <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-mono text-xs">
                        {raw.join('\n')}
                      </div>
                    </div>
                  )}

                  {fields.length === 0 && raw.length === 0 && (
                    <p className="text-sm text-gray-400 italic">No text could be extracted from this document.</p>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
