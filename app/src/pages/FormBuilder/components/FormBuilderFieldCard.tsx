import clsx from 'clsx'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TrashIcon, Bars3Icon } from '@heroicons/react/24/outline'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { Button } from '@/components/button'
import type { FormBuilderField } from '../types'
import { STUDENT_FIELD_LABELS, GENERAL_COMPONENT_LABELS } from '../types'

const RELIGION_OPTIONS = [
  { value: 'Islam', label: 'Islam' },
  { value: 'Catholic', label: 'Catholic' },
  { value: 'Iglesia Ni Cristo', label: 'Iglesia Ni Cristo' },
  { value: 'Baptists', label: 'Baptists' },
  { value: 'Others', label: 'Others' },
]

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

interface FormBuilderFieldCardProps {
  field: FormBuilderField
  index: number
  twoColumnLayout: boolean
  values: Record<string, string | number | boolean>
  onValueChange: (id: string, value: string | number | boolean) => void
  onColumnChange?: (id: string, column: 1 | 2) => void
  onRemove: (id: string) => void
}

function getLabel(field: FormBuilderField): string {
  if (field.label) return field.label
  if (field.studentField) return STUDENT_FIELD_LABELS[field.studentField]
  if (field.generalType) return GENERAL_COMPONENT_LABELS[field.generalType]
  return 'Field'
}

export function FormBuilderFieldCard({ field, index: _index, twoColumnLayout, values, onValueChange, onColumnChange, onRemove }: FormBuilderFieldCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
  const value = values[field.id]
  const label = getLabel(field)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const target = e.target
    if (target.type === 'checkbox') {
      onValueChange(field.id, (target as HTMLInputElement).checked)
    } else if (target.type === 'number') {
      onValueChange(field.id, Number((target as HTMLInputElement).value) || 0)
    } else {
      onValueChange(field.id, target.value)
    }
  }

  const renderInput = () => {
    if (field.studentField) {
      switch (field.studentField) {
        case 'first_name':
        case 'middle_name':
        case 'last_name':
        case 'ext_name':
          return (
            <Input
              type="text"
              value={String(value ?? '')}
              onChange={handleChange}
              placeholder={field.placeholder}
              label={label}
            />
          )
        case 'lrn':
          return (
            <Input
              type="text"
              value={String(value ?? '')}
              onChange={handleChange}
              placeholder="12-digit LRN"
              maxLength={12}
              label={label}
            />
          )
        case 'gender':
          return (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
              <Select
                value={String(value ?? '')}
                onChange={handleChange}
                options={GENDER_OPTIONS}
                placeholder="Select gender"
              />
            </div>
          )
        case 'religion':
          return (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
              <Select
                value={String(value ?? '')}
                onChange={handleChange}
                options={RELIGION_OPTIONS}
                placeholder="Select religion"
              />
            </div>
          )
        case 'birthdate':
          return (
            <Input
              type="date"
              value={String(value ?? '')}
              onChange={handleChange}
              label={label}
            />
          )
        case 'profile_picture':
          return (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
              <input
                type="file"
                accept="image/*"
                className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
          )
        case 'is_active':
          return (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`${field.id}-active`}
                checked={Boolean(value)}
                onChange={(e) => onValueChange(field.id, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor={`${field.id}-active`} className="text-sm font-medium text-gray-700">
                {label}
              </label>
            </div>
          )
        default:
          return (
            <Input
              type="text"
              value={String(value ?? '')}
              onChange={handleChange}
              label={label}
            />
          )
      }
    }

    if (field.generalType) {
      switch (field.generalType) {
        case 'text_input':
          return (
            <Input
              type="text"
              value={String(value ?? '')}
              onChange={handleChange}
              placeholder={field.placeholder ?? 'Enter text'}
              label={label}
            />
          )
        case 'text_editor':
          return (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
              <Textarea
                value={String(value ?? '')}
                onChange={handleChange}
                placeholder={field.placeholder ?? 'Enter content...'}
                rows={4}
                className="w-full"
              />
            </div>
          )
        case 'number':
          return (
            <Input
              type="number"
              value={value !== undefined && value !== '' ? Number(value) : ''}
              onChange={handleChange}
              placeholder={field.placeholder ?? '0'}
              label={label}
            />
          )
        case 'date':
          return (
            <Input
              type="date"
              value={String(value ?? '')}
              onChange={handleChange}
              label={label}
            />
          )
        case 'time':
          return (
            <Input
              type="time"
              value={String(value ?? '')}
              onChange={handleChange}
              label={label}
            />
          )
        case 'datetime':
          return (
            <Input
              type="datetime-local"
              value={String(value ?? '')}
              onChange={handleChange}
              label={label}
            />
          )
        case 'checkbox':
          return (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`${field.id}-cb`}
                checked={Boolean(value)}
                onChange={(e) => onValueChange(field.id, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor={`${field.id}-cb`} className="text-sm font-medium text-gray-700">
                {label}
              </label>
            </div>
          )
        case 'select':
          return (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
              <Select
                value={String(value ?? '')}
                onChange={handleChange}
                options={[{ value: '', label: field.placeholder ?? 'Select...' }]}
              />
            </div>
          )
        case 'file_upload':
          return (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
              <input
                type="file"
                className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
          )
        case 'heading':
          return (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Heading</label>
              <input
                type="text"
                value={String(value ?? '')}
                onChange={handleChange}
                placeholder="Heading text"
                className="w-full rounded border border-gray-300 px-3 py-2 text-lg font-semibold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )
        case 'paragraph':
          return (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Paragraph</label>
              <Textarea
                value={String(value ?? '')}
                onChange={handleChange}
                placeholder="Paragraph text"
                rows={3}
                className="w-full"
              />
            </div>
          )
        case 'divider':
          return (
            <div className="py-2">
              <hr className="border-gray-200" />
            </div>
          )
        default:
          return (
            <Input
              type="text"
              value={String(value ?? '')}
              onChange={handleChange}
              label={label}
            />
          )
      }
    }

    return null
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'rounded-xl border border-gray-200 bg-white p-4 shadow-sm',
        isDragging && 'opacity-60 shadow-md'
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="cursor-grab rounded border border-gray-200 p-1.5 text-gray-500 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
        >
          <Bars3Icon className="h-4 w-4" />
        </button>
        <span className="text-xs font-medium text-gray-500">
          {field.studentField ? `Student · ${STUDENT_FIELD_LABELS[field.studentField]}` : field.generalType ? `General · ${GENERAL_COMPONENT_LABELS[field.generalType]}` : 'Field'}
        </span>
        <div className="flex items-center gap-1">
          {twoColumnLayout && onColumnChange && (
            <select
              value={field.column}
              onChange={(e) => onColumnChange(field.id, Number(e.target.value) as 1 | 2)}
              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600"
              title="Column"
            >
              <option value={1}>Col 1</option>
              <option value={2}>Col 2</option>
            </select>
          )}
          <Button
            type="button"
            variant="ghost"
            color="danger"
            size="sm"
            onClick={() => onRemove(field.id)}
            className="shrink-0"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {renderInput()}
    </div>
  )
}
