import React, { useRef, useCallback, useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { X, Download, Loader2, Bug } from 'lucide-react'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import type { Student, Institution } from '@/types'
import type { CertificateRecord } from '@/services/certificateService'
import type { CanvasElement } from '@/pages/CertificateBuilder/components/CertificateCanvas'

const PAPER_PRESETS = {
  a4:     { portrait: { w: 794, h: 1123, pdf: 'a4' as const }, landscape: { w: 1123, h: 794, pdf: 'a4' as const } },
  letter: { portrait: { w: 816, h: 1056, pdf: 'letter' as const }, landscape: { w: 1056, h: 816, pdf: 'letter' as const } },
  legal:  { portrait: { w: 816, h: 1344, pdf: 'legal' as const }, landscape: { w: 1344, h: 816, pdf: 'legal' as const } },
} as const

type Paper = keyof typeof PAPER_PRESETS
type Orientation = 'portrait' | 'landscape'

interface CertificatePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  certificate: CertificateRecord
  student: Student
  institution?: Institution | null
}

function getStudentVariableValue(student: Student, variableKey: string): string {
  if (variableKey === 'extension') {
    const value = (student as unknown as Record<string, unknown>).ext_name
    return value != null ? String(value) : ''
  }
  if (variableKey === 'middle_initial') {
    const mn = (student as unknown as Record<string, unknown>).middle_name
    if (mn == null || String(mn).trim() === '') return ''
    return String(mn).trim().charAt(0).toUpperCase()
  }
  const value = (student as unknown as Record<string, unknown>)[variableKey]
  return value != null ? String(value) : ''
}

function resolveDisplayText(element: CanvasElement, student: Student, _institution?: Institution | null): string {
  const prefix = element.prefix ?? ''
  const suffix = element.suffix ?? ''

  // Student variables are the only ones that get dynamically resolved per-student.
  // The element.content always holds what the user typed/sees in the builder,
  // so for institution variables (and everything else) we just use content as-is.
  if (element.variableType === 'student' && element.variableKey) {
    const raw = getStudentVariableValue(student, element.variableKey)
    return `${prefix}${raw}${suffix}`
  }

  const content = element.content || ''
  if (element.variableType && element.variableKey && content) {
    return `${prefix}${content}${suffix}`
  }
  return content
}

/** Safely parse design_json — handles object, string, or double-encoded string */
function parseDesign(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed === 'string') {
        try { return JSON.parse(parsed) } catch { return {} }
      }
      return parsed
    } catch { return {} }
  }
  if (typeof raw === 'object' && raw !== null) return raw as Record<string, unknown>
  return {}
}

function StaticElement({ element, student, institution }: { element: CanvasElement; student: Student; institution?: Institution | null }) {
  if (element.hidden) return null

  const displayText = resolveDisplayText(element, student, institution)

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
  }

  const innerStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: element.width,
    height: element.height,
    minWidth: element.width,
    minHeight: element.height,
    transform: `rotate(${element.rotation || 0}deg)`,
    opacity: element.opacity || 1,
    zIndex: element.zIndex,
    boxSizing: 'border-box',
  }

  switch (element.type) {
    case 'text':
      return (
        <div style={wrapperStyle}>
          <div style={{
            ...innerStyle,
            fontFamily: element.fontFamily || 'Arial',
            fontSize: element.fontSize || 16,
            fontWeight: element.fontWeight || 'normal',
            fontStyle: element.fontStyle || 'normal',
            color: element.color || '#000000',
            textAlign: (element.textAlign as React.CSSProperties['textAlign']) || 'left',
            textDecoration: element.textDecoration || 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start',
            padding: '4px',
          }}>
            {displayText}
          </div>
        </div>
      )

    case 'paragraph':
      return (
        <div style={wrapperStyle}>
          <div style={{
            ...innerStyle,
            fontFamily: element.fontFamily || 'Arial',
            fontSize: element.fontSize || 14,
            fontWeight: element.fontWeight || 'normal',
            fontStyle: element.fontStyle || 'normal',
            color: element.color || '#000000',
            textAlign: (element.textAlign as React.CSSProperties['textAlign']) || 'left',
            textDecoration: element.textDecoration || 'none',
            lineHeight: '1.4',
            padding: '8px',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
          }}>
            {displayText}
          </div>
        </div>
      )

    case 'image':
      return (
        <div style={wrapperStyle}>
          <img
            src={
              element.variableType === 'institution' && element.variableKey === 'logo' && institution?.logo
                ? institution.logo
                : element.src || ''
            }
            alt={element.alt || ''}
            style={{
              ...innerStyle,
              objectFit: (element.objectFit as React.CSSProperties['objectFit']) || 'cover',
            }}
          />
        </div>
      )

    case 'rectangle':
      return (
        <div style={wrapperStyle}>
          <div style={{
            ...innerStyle,
            backgroundColor: element.fill || '#3B82F6',
            border: `${element.strokeWidth || 0}px solid ${element.stroke || 'transparent'}`,
            borderRadius: element.cornerRadius || 0,
          }} />
        </div>
      )

    case 'circle':
      return (
        <div style={wrapperStyle}>
          <div style={{
            ...innerStyle,
            backgroundColor: element.fill || '#10B981',
            border: `${element.strokeWidth || 0}px solid ${element.stroke || 'transparent'}`,
            borderRadius: '50%',
          }} />
        </div>
      )

    case 'qr': {
      const qrValue = element.variableType === 'student' && element.variableKey
        ? getStudentVariableValue(student, element.variableKey)
        : element.content || ''
      return (
        <div style={wrapperStyle}>
          <div style={{
            ...innerStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fff',
          }}>
            <QRCodeSVG
              value={qrValue || 'N/A'}
              size={Math.min(element.width, element.height)}
              level="M"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>
        </div>
      )
    }

    default:
      return (
        <div style={wrapperStyle}>
          <div style={{
            ...innerStyle,
            backgroundColor: element.fill || '#6B7280',
            border: `${element.strokeWidth || 0}px solid ${element.stroke || 'transparent'}`,
          }} />
        </div>
      )
  }
}

export default function CertificatePreviewModal({ isOpen, onClose, certificate, student, institution }: CertificatePreviewModalProps) {
  const { isImpersonating } = useAuth()
  const canvasRef = useRef<HTMLDivElement>(null)
  const scaleWrapperRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [isOpen])

  // Parse and inspect the design data
  const rawDesignJson = certificate.design_json
  const design = parseDesign(rawDesignJson)
  const paper = (design.paper || 'a4') as Paper
  const orientation = (design.orientation || 'landscape') as Orientation
  const preset = PAPER_PRESETS[paper]?.[orientation] ?? PAPER_PRESETS.a4.landscape
  const rawElements: CanvasElement[] = Array.isArray(design.elements) ? (design.elements as CanvasElement[]) : []

  // Deduplicate elements by id
  const seenIds = new Set<string>()
  const elements = rawElements.filter((el) => {
    if (!el.id || seenIds.has(el.id)) return false
    seenIds.add(el.id)
    return true
  })

  // Find duplicate positions for debug
  const positionMap = new Map<string, CanvasElement[]>()
  rawElements.forEach((el) => {
    const key = `${Math.round(el.x)},${Math.round(el.y)}`
    if (!positionMap.has(key)) positionMap.set(key, [])
    positionMap.get(key)!.push(el)
  })
  const duplicatePositions = [...positionMap.entries()].filter(([, els]) => els.length > 1)

  const studentFullName = [student.last_name, student.first_name, student.middle_name, student.ext_name].filter(Boolean).join(' ')

  const handleDownload = useCallback(async () => {
    if (!canvasRef.current || downloading) return
    setDownloading(true)

    const wrapper = scaleWrapperRef.current
    const savedTransform = wrapper?.style.transform || ''
    try {
      if (wrapper) wrapper.style.transform = 'none'

      const canvas = await html2canvas(canvasRef.current, {
        background: '#ffffff',
        scale: 2,
      } as Parameters<typeof html2canvas>[1])

      if (wrapper) wrapper.style.transform = savedTransform

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation, unit: 'pt', format: preset.pdf })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      pdf.addImage(imgData, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST')
      pdf.save(`${certificate.title} - ${studentFullName}.pdf`)
      toast.success('Certificate downloaded!')
    } catch (err) {
      console.error('PDF export error:', err)
      toast.error('Failed to generate PDF')
      if (wrapper) wrapper.style.transform = savedTransform
    } finally {
      setDownloading(false)
    }
  }, [downloading, orientation, preset.pdf, certificate.title, studentFullName])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const previewScale = Math.min(720 / preset.w, 1)

  return ReactDOM.createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-200 ${visible ? 'bg-black/50 backdrop-blur-sm' : 'bg-transparent'}`}
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden transition-all duration-200 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{certificate.title}</h2>
            <p className="text-sm text-gray-500 truncate">
              for {studentFullName} &middot; {paper.toUpperCase()} {orientation} ({preset.w}&times;{preset.h})
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {isImpersonating && (
              <button
                onClick={() => setShowDebug(!showDebug)}
                className={`p-2 rounded-lg transition-colors ${showDebug ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                title="Toggle debug info"
              >
                <Bug className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Debug panel — impersonating only */}
        {isImpersonating && showDebug && (
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 text-xs font-mono overflow-auto max-h-64 flex-shrink-0">
            <p className="font-bold text-amber-800 mb-2">Debug Info</p>
            <div className="space-y-1 text-amber-900">
              <p><b>design_json type:</b> {typeof rawDesignJson} {typeof rawDesignJson === 'string' ? `(length: ${rawDesignJson.length})` : ''}</p>
              <p><b>design_json top-level keys:</b> {typeof rawDesignJson === 'object' && rawDesignJson ? Object.keys(rawDesignJson as object).join(', ') : 'N/A'}</p>
              <p><b>Parsed design keys:</b> {Object.keys(design).join(', ')}</p>
              <p><b>Paper:</b> {String(design.paper)} → resolved: {paper}</p>
              <p><b>Orientation:</b> {String(design.orientation)} → resolved: {orientation}</p>
              <p><b>Canvas size:</b> {preset.w}×{preset.h} (PDF format: {preset.pdf})</p>
              <p><b>bgColor:</b> {String(design.bgColor)}</p>
              <p><b>bgImage:</b> {design.bgImage ? `set (${String(design.bgImage).substring(0, 60)}...)` : 'none'}</p>
              <p><b>Raw elements count:</b> {rawElements.length}</p>
              <p><b>After dedup count:</b> {elements.length}</p>
              <p><b>Removed by dedup:</b> {rawElements.length - elements.length}</p>

              {duplicatePositions.length > 0 && (
                <div className="mt-2 p-2 bg-red-100 rounded border border-red-300">
                  <p className="font-bold text-red-800">Elements sharing same position ({duplicatePositions.length} positions):</p>
                  {duplicatePositions.map(([pos, els]) => (
                    <div key={pos} className="ml-2 mt-1">
                      <p className="text-red-700">Position ({pos}): {els.length} elements</p>
                      {els.map((el) => (
                        <p key={el.id} className="ml-4 text-red-600">
                          id={el.id?.slice(0, 8)} type={el.type} {el.width}×{el.height}
                          {el.variableKey ? ` var=${el.variableKey}` : ''}
                          {el.content ? ` content="${el.content.slice(0, 30)}"` : ''}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <details className="mt-2">
                <summary className="cursor-pointer text-amber-700 hover:text-amber-900">All elements ({elements.length})</summary>
                <table className="mt-1 w-full text-[10px]">
                  <thead>
                    <tr className="text-left border-b border-amber-300">
                      <th className="pr-2">#</th><th className="pr-2">ID</th><th className="pr-2">Type</th>
                      <th className="pr-2">X,Y</th><th className="pr-2">W×H</th><th className="pr-2">zIndex</th>
                      <th className="pr-2">Var</th><th>Content</th>
                    </tr>
                  </thead>
                  <tbody>
                    {elements.map((el, i) => (
                      <tr key={el.id || i} className="border-b border-amber-200/50">
                        <td className="pr-2">{i}</td>
                        <td className="pr-2">{el.id?.slice(0, 8)}</td>
                        <td className="pr-2">{el.type}</td>
                        <td className="pr-2">{Math.round(el.x)},{Math.round(el.y)}</td>
                        <td className="pr-2">{Math.round(el.width)}×{Math.round(el.height)}</td>
                        <td className="pr-2">{el.zIndex}</td>
                        <td className="pr-2">{el.variableType ? `${el.variableType}.${el.variableKey}` : '-'}</td>
                        <td className="truncate max-w-[200px]">{el.content?.slice(0, 40) || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>

              <details className="mt-1">
                <summary className="cursor-pointer text-amber-700 hover:text-amber-900">Raw design_json (first 2000 chars)</summary>
                <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] bg-amber-100 p-2 rounded max-h-40 overflow-auto">
                  {JSON.stringify(rawDesignJson, null, 2).slice(0, 2000)}
                </pre>
              </details>
            </div>
          </div>
        )}

        {/* Preview */}
        <div className="flex-1 overflow-auto p-6 bg-gray-100 flex items-start justify-center">
          <div ref={scaleWrapperRef} style={{ transform: `scale(${previewScale})`, transformOrigin: 'top center', flexShrink: 0 }}>
            <div
              ref={canvasRef}
              style={{
                width: preset.w,
                height: preset.h,
                backgroundColor: design.bgColor ? String(design.bgColor) : '#ffffff',
                backgroundImage: design.bgImage ? `url(${String(design.bgImage)})` : undefined,
                backgroundSize: design.bgImage
                  ? (design.bgImageObjectFit === 'fill' ? '100% 100%' : String(design.bgImageObjectFit || 'cover'))
                  : undefined,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                borderRadius: 4,
              }}
            >
              {elements.map((el, idx) => (
                <StaticElement key={el.id || `el-${idx}`} element={el} student={student} institution={institution} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
