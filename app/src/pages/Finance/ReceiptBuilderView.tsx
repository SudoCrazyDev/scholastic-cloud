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
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { receiptTemplateService } from '../../services/receiptTemplateService'
import type { ReceiptTemplate, ReceiptTemplateElement } from '../../types'

const ELEMENT_PALETTE: { type: ReceiptTemplateElement['type']; label: string }[] = [
  { type: 'institution_logo', label: 'Institution Logo' },
  { type: 'institution_name', label: 'Institution Name' },
  { type: 'institution_address', label: 'Institution Address' },
  { type: 'receipt_number', label: 'Receipt Number' },
  { type: 'payment_date', label: 'Payment Date' },
  { type: 'student_name', label: 'Student Name' },
  { type: 'student_lrn', label: 'Student LRN' },
  { type: 'grade_level', label: 'Grade Level' },
  { type: 'academic_year', label: 'Academic Year' },
  { type: 'fee_name', label: 'Fee Name' },
  { type: 'payment_amount', label: 'Payment Amount' },
  { type: 'payment_method', label: 'Payment Method' },
  { type: 'received_by', label: 'Received By' },
  { type: 'divider', label: 'Divider Line' },
  { type: 'custom_text', label: 'Custom Text' },
  { type: 'signature_line', label: 'Signature Line' },
  { type: 'spacer', label: 'Spacer' },
]

function SortableItem({
  element,
  onRemove,
  onUpdateContent,
}: {
  element: ReceiptTemplateElement
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

  const renderPreview = () => {
    switch (element.type) {
      case 'institution_logo':
        return <div className="w-12 h-12 bg-gray-200 rounded mx-auto flex items-center justify-center text-xs text-gray-500">Logo</div>
      case 'institution_name':
        return <p className="text-center font-bold text-sm">Institution Name</p>
      case 'institution_address':
        return <p className="text-center text-xs text-gray-500">Institution Address</p>
      case 'receipt_number':
        return <p className="text-xs"><span className="font-medium">Receipt #:</span> RCPT-XXXXXX</p>
      case 'payment_date':
        return <p className="text-xs"><span className="font-medium">Date:</span> 2026-03-06</p>
      case 'student_name':
        return <p className="text-xs"><span className="font-medium">Student:</span> Juan Dela Cruz</p>
      case 'student_lrn':
        return <p className="text-xs"><span className="font-medium">LRN:</span> 123456789012</p>
      case 'grade_level':
        return <p className="text-xs"><span className="font-medium">Grade:</span> Grade 1</p>
      case 'academic_year':
        return <p className="text-xs"><span className="font-medium">S.Y.:</span> 2025-2026</p>
      case 'fee_name':
        return <p className="text-xs"><span className="font-medium">Fee:</span> Tuition Fee</p>
      case 'payment_amount':
        return <p className="text-sm font-bold text-center">PHP 1,000.00</p>
      case 'payment_method':
        return <p className="text-xs"><span className="font-medium">Method:</span> Cash</p>
      case 'received_by':
        return <p className="text-xs"><span className="font-medium">Received by:</span> Cashier Name</p>
      case 'divider':
        return <hr className="border-dashed border-gray-400" />
      case 'custom_text':
        return (
          <input
            type="text"
            value={element.content || ''}
            onChange={(e) => onUpdateContent(e.target.value)}
            placeholder="Enter custom text..."
            className="w-full text-xs border-0 border-b border-dashed border-gray-300 focus:border-indigo-500 focus:ring-0 bg-transparent px-0 py-0.5"
          />
        )
      case 'signature_line':
        return (
          <div className="pt-6 text-center">
            <div className="border-t border-gray-400 w-40 mx-auto" />
            <p className="text-xs text-gray-500 mt-1">Signature</p>
          </div>
        )
      case 'spacer':
        return <div className="h-4" />
      default:
        return <p className="text-xs text-gray-400">{element.type}</p>
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="group flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-2 hover:border-indigo-200 hover:shadow-sm transition-all">
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing shrink-0 mt-1 text-gray-400 hover:text-gray-600"
        title="Drag to reorder"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">{renderPreview()}</div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
        title="Remove element"
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

const ReceiptBuilderView: React.FC = () => {
  const queryClient = useQueryClient()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('New Receipt Template')
  const [paperSize, setPaperSize] = useState('80mm')
  const [isDefault, setIsDefault] = useState(false)
  const [layout, setLayout] = useState<ReceiptTemplateElement[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const templatesQuery = useQuery({
    queryKey: ['receipt-templates'],
    queryFn: () => receiptTemplateService.getTemplates(),
  })

  const templates = useMemo(() => templatesQuery.data?.data || [], [templatesQuery.data?.data])

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: templateName,
        is_default: isDefault,
        paper_size: paperSize,
        layout,
      }
      if (selectedTemplateId) {
        return receiptTemplateService.updateTemplate(selectedTemplateId, payload)
      }
      return receiptTemplateService.createTemplate(payload)
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['receipt-templates'] })
      if (!selectedTemplateId && response.data?.id) {
        setSelectedTemplateId(response.data.id)
      }
      toast.success('Template saved.')
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Failed to save template.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => receiptTemplateService.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipt-templates'] })
      resetForm()
      toast.success('Template deleted.')
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Failed to delete.')
    },
  })

  const resetForm = useCallback(() => {
    setSelectedTemplateId(null)
    setTemplateName('New Receipt Template')
    setPaperSize('80mm')
    setIsDefault(false)
    setLayout([])
  }, [])

  const loadTemplate = useCallback((tpl: ReceiptTemplate) => {
    setSelectedTemplateId(tpl.id)
    setTemplateName(tpl.name)
    setPaperSize(tpl.paper_size)
    setIsDefault(tpl.is_default)
    setLayout(tpl.layout || [])
  }, [])

  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      loadTemplate(templates[0])
    }
  }, [templates, selectedTemplateId, loadTemplate])

  const addElement = (type: ReceiptTemplateElement['type'], label: string) => {
    const newElement: ReceiptTemplateElement = {
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      label,
      content: type === 'custom_text' ? '' : undefined,
    }
    setLayout((prev) => [...prev, newElement])
  }

  const removeElement = (id: string) => {
    setLayout((prev) => prev.filter((el) => el.id !== id))
  }

  const updateElementContent = (id: string, content: string) => {
    setLayout((prev) =>
      prev.map((el) => (el.id === id ? { ...el, content } : el))
    )
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setLayout((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id)
        const newIndex = items.findIndex((i) => i.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Receipt Builder</h2>
        <p className="text-sm text-gray-600">
          Design receipt layouts by dragging and dropping elements. Templates are saved per institution.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Saved Templates</h3>
            <div className="space-y-1">
              <button
                type="button"
                onClick={resetForm}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  !selectedTemplateId ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                + New Template
              </button>
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => loadTemplate(tpl)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedTemplateId === tpl.id
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tpl.name}
                  {tpl.is_default && (
                    <span className="ml-1 text-xs text-indigo-500">(default)</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Element Palette</h3>
            <p className="text-xs text-gray-500 mb-2">Click to add to canvas</p>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {ELEMENT_PALETTE.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => addElement(item.type, item.label)}
                  className="w-full text-left px-3 py-1.5 rounded text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Canvas</h3>
              <span className="text-xs text-gray-400">{layout.length} elements</span>
            </div>
            {layout.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg py-12 text-center">
                <p className="text-sm text-gray-400">
                  Click elements from the palette to add them here
                </p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={layout.map((el) => el.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {layout.map((element) => (
                      <SortableItem
                        key={element.id}
                        element={element}
                        onRemove={() => removeElement(element.id)}
                        onUpdateContent={(content) => updateElementContent(element.id, content)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Template Settings</h3>
            <Input
              label="Template Name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Standard Receipt"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Paper Size</label>
              <Select
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value)}
                options={[
                  { value: '80mm', label: '80mm (Thermal Printer)' },
                  { value: '58mm', label: '58mm (Small Thermal)' },
                  { value: 'A4', label: 'A4 (Standard)' },
                  { value: 'Letter', label: 'Letter' },
                  { value: 'Half-Letter', label: 'Half Letter' },
                ]}
                className="w-full"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Set as default template
            </label>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                onClick={() => saveMutation.mutate()}
                loading={saveMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {saveMutation.isPending ? 'Saving...' : selectedTemplateId ? 'Update Template' : 'Save Template'}
              </Button>
              {selectedTemplateId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (window.confirm('Delete this template?')) {
                      deleteMutation.mutate(selectedTemplateId)
                    }
                  }}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Live Preview</h3>
            <div
              className="border border-gray-300 rounded bg-white p-4 mx-auto overflow-hidden"
              style={{ maxWidth: paperSize === '58mm' ? '180px' : paperSize === '80mm' ? '250px' : '100%' }}
            >
              {layout.length === 0 ? (
                <p className="text-xs text-gray-400 text-center">Empty receipt</p>
              ) : (
                <div className="space-y-1">
                  {layout.map((el) => {
                    switch (el.type) {
                      case 'institution_logo':
                        return <div key={el.id} className="w-10 h-10 bg-gray-200 rounded mx-auto" />
                      case 'institution_name':
                        return <p key={el.id} className="text-center font-bold text-xs">School Name</p>
                      case 'institution_address':
                        return <p key={el.id} className="text-center text-[10px] text-gray-500">School Address</p>
                      case 'receipt_number':
                        return <p key={el.id} className="text-[10px]">Receipt #: RCPT-XXXXXX</p>
                      case 'payment_date':
                        return <p key={el.id} className="text-[10px]">Date: 2026-03-06</p>
                      case 'student_name':
                        return <p key={el.id} className="text-[10px]">Student: Juan Dela Cruz</p>
                      case 'student_lrn':
                        return <p key={el.id} className="text-[10px]">LRN: 123456789012</p>
                      case 'grade_level':
                        return <p key={el.id} className="text-[10px]">Grade: Grade 1</p>
                      case 'academic_year':
                        return <p key={el.id} className="text-[10px]">S.Y.: 2025-2026</p>
                      case 'fee_name':
                        return <p key={el.id} className="text-[10px]">Fee: Tuition Fee</p>
                      case 'payment_amount':
                        return <p key={el.id} className="text-xs font-bold text-center">PHP 1,000.00</p>
                      case 'payment_method':
                        return <p key={el.id} className="text-[10px]">Method: Cash</p>
                      case 'received_by':
                        return <p key={el.id} className="text-[10px]">Received by: Cashier</p>
                      case 'divider':
                        return <hr key={el.id} className="border-dashed border-gray-400 my-1" />
                      case 'custom_text':
                        return <p key={el.id} className="text-[10px] text-center">{el.content || 'Custom text'}</p>
                      case 'signature_line':
                        return (
                          <div key={el.id} className="pt-4 text-center">
                            <div className="border-t border-gray-400 w-24 mx-auto" />
                            <p className="text-[8px] text-gray-500 mt-0.5">Signature</p>
                          </div>
                        )
                      case 'spacer':
                        return <div key={el.id} className="h-2" />
                      default:
                        return null
                    }
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReceiptBuilderView
