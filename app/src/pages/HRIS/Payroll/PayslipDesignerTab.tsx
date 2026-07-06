import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TrashIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { ConfirmationModal } from '../../../components'
import { payrollService } from '../../../services/payrollService'
import type { PayslipTemplate, PayslipTemplateElement, PayslipTemplateElementType } from '../../../types'
import { errorMessage } from './helpers'
import { PayslipSheet } from './PayslipSheet'
import {
  PAYSLIP_ELEMENT_PALETTE,
  SAMPLE_PAYSLIP_LAYOUT,
  SAMPLE_SHEET_DATA,
} from './payslipSheetData'

const EDITABLE_CONTENT: Partial<Record<PayslipTemplateElementType, string>> = {
  title: 'Title text (e.g. PAY SLIP)',
  custom_text: 'Enter custom text…',
  pay_master: "Pay master's name (e.g. Lydia M. Gonzales)",
  signature_line: 'Signature label',
}

const paletteLabel = (type: PayslipTemplateElementType) =>
  PAYSLIP_ELEMENT_PALETTE.find((item) => item.type === type)?.label ?? type

function SortableElement({
  element,
  onRemove,
  onUpdateContent,
}: {
  element: PayslipTemplateElement
  onRemove: () => void
  onUpdateContent: (content: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: element.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const contentPlaceholder = EDITABLE_CONTENT[element.type]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 transition-all hover:border-indigo-200 hover:shadow-sm"
    >
      <div
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab text-gray-400 hover:text-gray-600 active:cursor-grabbing"
        title="Drag to reorder"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-700">{paletteLabel(element.type)}</p>
        {contentPlaceholder !== undefined && (
          <input
            type="text"
            value={element.content || ''}
            onChange={(e) => onUpdateContent(e.target.value)}
            placeholder={contentPlaceholder}
            className="mt-0.5 w-full border-0 border-b border-dashed border-gray-300 bg-transparent px-0 py-0.5 text-xs focus:border-indigo-500 focus:ring-0"
          />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-red-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
        title="Remove element"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

const PayslipDesignerTab: React.FC = () => {
  const queryClient = useQueryClient()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('New Payslip Template')
  const [paperSize, setPaperSize] = useState('Half-Letter')
  const [isDefault, setIsDefault] = useState(false)
  const [layout, setLayout] = useState<PayslipTemplateElement[]>([])
  const [deleting, setDeleting] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const templatesQuery = useQuery({
    queryKey: ['payslip-templates'],
    queryFn: () => payrollService.getPayslipTemplates(),
  })

  const templates = useMemo(() => templatesQuery.data?.data || [], [templatesQuery.data?.data])

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: templateName, is_default: isDefault, paper_size: paperSize, layout }
      return selectedTemplateId
        ? payrollService.updatePayslipTemplate(selectedTemplateId, payload)
        : payrollService.createPayslipTemplate(payload)
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['payslip-templates'] })
      if (!selectedTemplateId && response.data?.id) {
        setSelectedTemplateId(response.data.id)
      }
      toast.success('Template saved.')
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'Failed to save template.'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => payrollService.deletePayslipTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payslip-templates'] })
      setDeleting(false)
      resetForm()
      toast.success('Template deleted.')
    },
    onError: (err: unknown) => {
      setDeleting(false)
      toast.error(errorMessage(err, 'Failed to delete template.'))
    },
  })

  const resetForm = useCallback(() => {
    setSelectedTemplateId(null)
    setTemplateName('New Payslip Template')
    setPaperSize('Half-Letter')
    setIsDefault(false)
    setLayout([])
  }, [])

  const loadTemplate = useCallback((template: PayslipTemplate) => {
    setSelectedTemplateId(template.id)
    setTemplateName(template.name)
    setPaperSize(template.paper_size)
    setIsDefault(template.is_default)
    setLayout(template.layout || [])
  }, [])

  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      loadTemplate(templates[0])
    }
  }, [templates, selectedTemplateId, loadTemplate])

  const newId = () => `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const addElement = (type: PayslipTemplateElementType) => {
    setLayout((prev) => [
      ...prev,
      { id: newId(), type, content: type === 'title' ? 'PAY SLIP' : undefined },
    ])
  }

  const loadSampleLayout = () => {
    setLayout(SAMPLE_PAYSLIP_LAYOUT.map((element) => ({ ...element, id: newId() })))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setLayout((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Payslip Designer</h2>
        <p className="text-sm text-gray-500">
          Build your institution's payslip layout by adding and reordering elements. The default
          template is used when printing a payslip from a payroll period.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Saved Templates</h3>
            <div className="space-y-1">
              <button
                type="button"
                onClick={resetForm}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  !selectedTemplateId
                    ? 'bg-indigo-50 font-medium text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                + New Template
              </button>
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => loadTemplate(template)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selectedTemplateId === template.id
                      ? 'bg-indigo-50 font-medium text-indigo-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {template.name}
                  {template.is_default && <span className="ml-1 text-xs text-indigo-500">(default)</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Element Palette</h3>
            <p className="mb-2 text-xs text-gray-500">Click to add to the layout</p>
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {PAYSLIP_ELEMENT_PALETTE.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => addElement(item.type)}
                  className="w-full rounded px-3 py-1.5 text-left text-xs text-gray-700 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Layout</h3>
              <span className="text-xs text-gray-400">{layout.length} elements</span>
            </div>
            {layout.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-gray-200 py-10 text-center">
                <p className="mb-3 text-sm text-gray-400">
                  Click elements from the palette to add them here
                </p>
                <Button type="button" variant="outline" size="sm" onClick={loadSampleLayout}>
                  Start from the sample pay slip
                </Button>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={layout.map((element) => element.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {layout.map((element) => (
                      <SortableElement
                        key={element.id}
                        element={element}
                        onRemove={() => setLayout((prev) => prev.filter((item) => item.id !== element.id))}
                        onUpdateContent={(content) =>
                          setLayout((prev) =>
                            prev.map((item) => (item.id === element.id ? { ...item, content } : item))
                          )
                        }
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Template Settings</h3>
            <div className="space-y-4">
              <Input
                label="Template Name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Standard Pay Slip"
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Paper Size</label>
                <Select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value)}
                  options={[
                    { value: 'Half-Letter', label: 'Half Letter' },
                    { value: 'Quarter-A4', label: '1/4 A4' },
                    { value: 'A5', label: 'A5' },
                    { value: 'A4', label: 'A4 (Standard)' },
                    { value: 'Letter', label: 'Letter' },
                    { value: '80mm', label: '80mm (Thermal Printer)' },
                  ]}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Set as default template
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || layout.length === 0 || !templateName.trim()}
                >
                  {saveMutation.isPending
                    ? 'Saving…'
                    : selectedTemplateId
                      ? 'Update Template'
                      : 'Save Template'}
                </Button>
                {selectedTemplateId && (
                  <Button type="button" variant="outline" color="danger" onClick={() => setDeleting(true)}>
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Live Preview (sample data)</h3>
            {layout.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">Empty payslip</p>
            ) : (
              <div className="rounded-lg bg-gray-50 p-4">
                <PayslipSheet layout={layout} data={SAMPLE_SHEET_DATA} />
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => selectedTemplateId && deleteMutation.mutate(selectedTemplateId)}
        title="Delete payslip template"
        message={`Delete "${templateName}"? This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

export default PayslipDesignerTab
