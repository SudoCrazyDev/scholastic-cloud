import clsx from 'clsx'
import { useDraggable } from '@dnd-kit/core'
import type { StudentFieldKey, GeneralComponentType } from '../types'
import { STUDENT_FIELD_LABELS, GENERAL_COMPONENT_LABELS } from '../types'
import {
  UserIcon,
  DocumentTextIcon,
  CalendarIcon,
  ClockIcon,
  PhotoIcon,
  CheckCircleIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline'
import type { ComponentType, SVGProps } from 'react'

const FORM_PALETTE_PREFIX = 'form-palette::'

export function formPaletteIdStudent(field: StudentFieldKey): string {
  return `${FORM_PALETTE_PREFIX}student::${field}`
}

export function formPaletteIdGeneral(type: GeneralComponentType): string {
  return `${FORM_PALETTE_PREFIX}general::${type}`
}

export function parsePaletteId(id: string): { kind: 'student'; field: StudentFieldKey } | { kind: 'general'; type: GeneralComponentType } | null {
  if (!id.startsWith(FORM_PALETTE_PREFIX)) return null
  const rest = id.slice(FORM_PALETTE_PREFIX.length)
  if (rest.startsWith('student::')) {
    return { kind: 'student', field: rest.slice(9) as StudentFieldKey }
  }
  if (rest.startsWith('general::')) {
    return { kind: 'general', type: rest.slice(9) as GeneralComponentType }
  }
  return null
}

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>
type PaletteItem =
  | { kind: 'student'; field: StudentFieldKey; label: string; accentClass: string; Icon: IconComponent }
  | { kind: 'general'; type: GeneralComponentType; label: string; accentClass: string; Icon: IconComponent }

const STUDENT_PALETTE_ITEMS: PaletteItem[] = [
  { kind: 'student', field: 'first_name', label: STUDENT_FIELD_LABELS.first_name, accentClass: 'text-blue-700 bg-blue-100 border-blue-200', Icon: UserIcon },
  { kind: 'student', field: 'middle_name', label: STUDENT_FIELD_LABELS.middle_name, accentClass: 'text-blue-700 bg-blue-100 border-blue-200', Icon: UserIcon },
  { kind: 'student', field: 'last_name', label: STUDENT_FIELD_LABELS.last_name, accentClass: 'text-blue-700 bg-blue-100 border-blue-200', Icon: UserIcon },
  { kind: 'student', field: 'ext_name', label: STUDENT_FIELD_LABELS.ext_name, accentClass: 'text-blue-700 bg-blue-100 border-blue-200', Icon: UserIcon },
  { kind: 'student', field: 'lrn', label: STUDENT_FIELD_LABELS.lrn, accentClass: 'text-indigo-700 bg-indigo-100 border-indigo-200', Icon: DocumentTextIcon },
  { kind: 'student', field: 'gender', label: STUDENT_FIELD_LABELS.gender, accentClass: 'text-violet-700 bg-violet-100 border-violet-200', Icon: UserIcon },
  { kind: 'student', field: 'religion', label: STUDENT_FIELD_LABELS.religion, accentClass: 'text-violet-700 bg-violet-100 border-violet-200', Icon: UserIcon },
  { kind: 'student', field: 'birthdate', label: STUDENT_FIELD_LABELS.birthdate, accentClass: 'text-amber-700 bg-amber-100 border-amber-200', Icon: CalendarIcon },
  { kind: 'student', field: 'profile_picture', label: STUDENT_FIELD_LABELS.profile_picture, accentClass: 'text-pink-700 bg-pink-100 border-pink-200', Icon: PhotoIcon },
  { kind: 'student', field: 'is_active', label: STUDENT_FIELD_LABELS.is_active, accentClass: 'text-emerald-700 bg-emerald-100 border-emerald-200', Icon: CheckCircleIcon },
]

const GENERAL_PALETTE_ITEMS: PaletteItem[] = [
  { kind: 'general', type: 'text_input', label: GENERAL_COMPONENT_LABELS.text_input, accentClass: 'text-slate-700 bg-slate-100 border-slate-200', Icon: DocumentTextIcon },
  { kind: 'general', type: 'text_editor', label: GENERAL_COMPONENT_LABELS.text_editor, accentClass: 'text-slate-700 bg-slate-100 border-slate-200', Icon: DocumentTextIcon },
  { kind: 'general', type: 'number', label: GENERAL_COMPONENT_LABELS.number, accentClass: 'text-sky-700 bg-sky-100 border-sky-200', Icon: DocumentTextIcon },
  { kind: 'general', type: 'date', label: GENERAL_COMPONENT_LABELS.date, accentClass: 'text-amber-700 bg-amber-100 border-amber-200', Icon: CalendarIcon },
  { kind: 'general', type: 'time', label: GENERAL_COMPONENT_LABELS.time, accentClass: 'text-amber-700 bg-amber-100 border-amber-200', Icon: ClockIcon },
  { kind: 'general', type: 'datetime', label: GENERAL_COMPONENT_LABELS.datetime, accentClass: 'text-amber-700 bg-amber-100 border-amber-200', Icon: CalendarIcon },
  { kind: 'general', type: 'checkbox', label: GENERAL_COMPONENT_LABELS.checkbox, accentClass: 'text-emerald-700 bg-emerald-100 border-emerald-200', Icon: CheckCircleIcon },
  { kind: 'general', type: 'select', label: GENERAL_COMPONENT_LABELS.select, accentClass: 'text-violet-700 bg-violet-100 border-violet-200', Icon: DocumentTextIcon },
  { kind: 'general', type: 'file_upload', label: GENERAL_COMPONENT_LABELS.file_upload, accentClass: 'text-pink-700 bg-pink-100 border-pink-200', Icon: PhotoIcon },
  { kind: 'general', type: 'heading', label: GENERAL_COMPONENT_LABELS.heading, accentClass: 'text-gray-700 bg-gray-100 border-gray-200', Icon: DocumentTextIcon },
  { kind: 'general', type: 'paragraph', label: GENERAL_COMPONENT_LABELS.paragraph, accentClass: 'text-gray-700 bg-gray-100 border-gray-200', Icon: DocumentTextIcon },
  { kind: 'general', type: 'divider', label: GENERAL_COMPONENT_LABELS.divider, accentClass: 'text-gray-600 bg-gray-100 border-gray-200', Icon: Bars3Icon },
]

interface FormBuilderPaletteCardProps {
  item: PaletteItem
  id: string
}

export function FormBuilderPaletteCard({ item, id }: FormBuilderPaletteCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const { label, accentClass, Icon } = item

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={clsx(
        'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left transition hover:border-gray-300 hover:bg-gray-50',
        isDragging && 'opacity-50'
      )}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-3">
        <div className={clsx('rounded-lg border p-1.5', accentClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm font-medium text-gray-800">{label}</span>
        <div className="ml-auto rounded border border-gray-200 bg-gray-50 p-1 text-gray-400">
          <Bars3Icon className="h-3.5 w-3.5" />
        </div>
      </div>
    </button>
  )
}

export function FormBuilderPalette() {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-blue-700">Student</span>
          Student Model
        </h4>
        <p className="text-xs text-gray-500">Fields bound to Student attributes.</p>
        <div className="mt-3 space-y-2">
          {STUDENT_PALETTE_ITEMS.map((item) => (
            <FormBuilderPaletteCard
              key={item.kind === 'student' ? item.field : item.type}
              item={item}
              id={item.kind === 'student' ? formPaletteIdStudent(item.field) : formPaletteIdGeneral(item.type)}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-gray-700">General</span>
          General Components
        </h4>
        <p className="text-xs text-gray-500">No model relation — use for any form.</p>
        <div className="mt-3 space-y-2">
          {GENERAL_PALETTE_ITEMS.map((item) => (
            <FormBuilderPaletteCard
              key={item.kind === 'general' ? item.type : item.field}
              item={item}
              id={item.kind === 'general' ? formPaletteIdGeneral(item.type) : formPaletteIdStudent(item.field)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
