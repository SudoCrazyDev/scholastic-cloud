import { useMemo, useRef, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { toast } from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { IdentificationIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/button'
import { Select } from '@/components/select'
import IdCardCanvas, { type StudentContext } from '@/pages/IdCardBuilder/components/IdCardCanvas'
import { parseDesign, CARD_PRESETS, type SideDesign } from '@/pages/IdCardBuilder/idCardDesignUtils'
import { useIdCardTemplates } from '@/hooks/useIdCardTemplates'
import { classSectionService } from '@/services/classSectionService'
import type { Student } from '@/types'

interface StudentIdCardPrintProps {
  student: Student
}

const PREVIEW_WIDTH = 230

export function StudentIdCardPrint({ student }: StudentIdCardPrintProps) {
  const navigate = useNavigate()
  const { data: listResp, isLoading } = useIdCardTemplates()
  const templates = (listResp?.data ?? []) as Array<{ id: string | number; title: string; design_json: unknown }>

  const [selectedId, setSelectedId] = useState<string>('')
  const [exporting, setExporting] = useState(false)

  // Default to the first template once loaded
  useEffect(() => {
    if (!selectedId && templates.length) setSelectedId(String(templates[0].id))
  }, [templates, selectedId])

  const selected = templates.find((t) => String(t.id) === selectedId)
  const design = useMemo(() => parseDesign(selected?.design_json), [selected])
  const preset = CARD_PRESETS[design.card.size][design.card.orientation]
  const previewScale = PREVIEW_WIDTH / preset.w

  // Resolve grade level + section title from the student's current section
  const { data: studentContext } = useQuery<StudentContext>({
    queryKey: ['id-card-student-context', student.id, student.student_section_id],
    queryFn: async () => {
      if (!student.student_section_id) return {}
      const resp = await classSectionService.getClassSection(student.student_section_id)
      const sec = resp?.data
      return { gradeLevel: sec?.grade_level, sectionTitle: sec?.title }
    },
    enabled: !!student.student_section_id,
  })

  const frontRef = useRef<HTMLDivElement | null>(null)
  const backRef = useRef<HTMLDivElement | null>(null)

  const renderSide = (side: SideDesign, scale: number) => (
    <div
      style={{
        width: preset.w,
        height: preset.h,
        backgroundColor: side.bgColor,
        backgroundImage: side.bgImage ? `url(${side.bgImage})` : undefined,
        backgroundSize: side.bgImage ? (side.bgImageObjectFit === 'fill' ? '100% 100%' : side.bgImageObjectFit) : undefined,
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        position: 'relative',
      }}
    >
      <IdCardCanvas
        width={preset.w}
        height={preset.h}
        scale={scale}
        elements={side.elements}
        selectedElementIds={[]}
        onSelect={() => {}}
        onChange={() => {}}
        onInteractionStart={() => {}}
        onChangeEnd={() => {}}
        showGrid={false}
        snappingEnabled={false}
        previewStudent={student}
        studentContext={studentContext}
        readOnly
      />
    </div>
  )

  const handleExport = async () => {
    const front = frontRef.current
    const back = backRef.current
    if (!front || !back || !selected) return
    setExporting(true)
    try {
      const opts = { backgroundColor: '#ffffff', scale: 3, useCORS: true } as Parameters<typeof html2canvas>[1]
      const frontCanvas = await html2canvas(front, opts)
      const backCanvas = await html2canvas(back, opts)

      const orientation = design.card.orientation
      const pdf = new jsPDF({ orientation, unit: 'pt', format: [preset.pw, preset.ph] })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      pdf.addImage(frontCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH, undefined, 'FAST')
      pdf.addPage([preset.pw, preset.ph], orientation)
      pdf.addImage(backCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH, undefined, 'FAST')
      pdf.save(`${student.last_name}-${student.first_name}-id-card.pdf`)
      toast.success('ID card exported (front + back)')
    } catch (err) {
      console.error('ID card export error:', err)
      toast.error('Failed to export. The template image may block cross-origin capture.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <IdentificationIcon className="w-5 h-5 text-indigo-600" />
        <h3 className="text-base font-semibold text-gray-900">Print ID Card</h3>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading templates...
        </div>
      ) : templates.length === 0 ? (
        <div className="text-sm text-gray-500">
          <p className="mb-3">No ID templates yet. Design one first in the Student ID Builder.</p>
          <Button variant="outline" size="sm" onClick={() => navigate('/id-card-builder/new')}>
            Open ID Builder
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="max-w-sm">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Template</label>
            <Select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              options={templates.map((t) => ({ value: String(t.id), label: t.title }))}
            />
          </div>

          {selected && (
            <>
              <div className="flex flex-wrap gap-6">
                {(['front', 'back'] as const).map((sideKey) => (
                  <div key={sideKey} className="flex flex-col items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{sideKey}</span>
                    <div
                      className="shadow-lg rounded-lg overflow-hidden ring-1 ring-gray-200"
                      style={{ width: preset.w * previewScale, height: preset.h * previewScale }}
                    >
                      <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', width: preset.w, height: preset.h }}>
                        {renderSide(design[sideKey], previewScale)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleExport}
                  disabled={exporting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowDownTrayIcon className="w-4 h-4 mr-2" />}
                  {exporting ? 'Preparing...' : 'Download / Print PDF'}
                </Button>
                {!student.profile_picture && (
                  <span className="text-xs text-amber-600">This student has no profile photo — the photo area will be blank.</span>
                )}
              </div>

              {/* Off-screen full-size render for crisp PDF capture (zero layout footprint) */}
              <div aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                <div ref={frontRef} style={{ position: 'absolute', top: 0, left: 0 }}>{renderSide(design.front, 1)}</div>
                <div ref={backRef} style={{ position: 'absolute', top: 0, left: 0 }}>{renderSide(design.back, 1)}</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
