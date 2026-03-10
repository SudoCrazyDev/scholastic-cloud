import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { nanoid } from 'nanoid'
import { FormBuilderPalette, parsePaletteId } from './components/FormBuilderPaletteCard'
import { FormBuilderCanvas, getCanvasDropId } from './components/FormBuilderCanvas'
import type { FormBuilderDraft, FormBuilderField, StudentFieldKey, GeneralComponentType } from './types'
import { STUDENT_FIELD_LABELS, GENERAL_COMPONENT_LABELS } from './types'
import { Input } from '@/components/input'
import { Switch } from '@/components/switch'
import { LayoutGrid, LayoutList, FileText } from 'lucide-react'

const CANVAS_DROP_ID = getCanvasDropId()

function createEmptyDraft(): FormBuilderDraft {
  return {
    title: '',
    twoColumnLayout: false,
    fields: [],
  }
}

function createField(
  column: 1 | 2,
  studentField?: StudentFieldKey,
  generalType?: GeneralComponentType
): FormBuilderField {
  return {
    id: nanoid(),
    column,
    studentField,
    generalType,
  }
}

export default function FormBuilderPage() {
  const [draft, setDraft] = useState<FormBuilderDraft>(createEmptyDraft)
  const [values, setValues] = useState<Record<string, string | number | boolean>>({})
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const addField = useCallback(
    (column: 1 | 2, studentField?: StudentFieldKey, generalType?: GeneralComponentType, insertIndex?: number) => {
      setDraft((prev) => {
        const newField = createField(column, studentField, generalType)
        if (insertIndex != null && insertIndex >= 0 && insertIndex <= prev.fields.length) {
          const next = [...prev.fields]
          next.splice(insertIndex, 0, newField)
          return { ...prev, fields: next }
        }
        return { ...prev, fields: [...prev.fields, newField] }
      })
    },
    []
  )

  const removeField = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== id),
    }))
    setValues((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const setValue = useCallback((id: string, value: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [id]: value }))
  }, [])

  const setColumn = useCallback((id: string, column: 1 | 2) => {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.id === id ? { ...f, column } : f)),
    }))
  }, [])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)
    if (!event.over) return

    const activeId = String(event.active.id)
    const overId = String(event.over.id)

    const parsed = parsePaletteId(activeId)
    if (parsed) {
      const column: 1 | 2 = 1
      const insertIndex = overId === CANVAS_DROP_ID ? undefined : draft.fields.findIndex((f) => f.id === overId)
      if (parsed.kind === 'student') {
        addField(column, parsed.field, undefined, insertIndex !== -1 ? insertIndex : undefined)
      } else {
        addField(column, undefined, parsed.type, insertIndex !== -1 ? insertIndex : undefined)
      }
      return
    }

    const oldIndex = draft.fields.findIndex((f) => f.id === activeId)
    const newIndex = draft.fields.findIndex((f) => f.id === overId)
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

    setDraft((prev) => ({
      ...prev,
      fields: arrayMove(prev.fields, oldIndex, newIndex),
    }))
  }

  const activeDragParsed = activeDragId ? parsePaletteId(activeDragId) : null

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Form Builder</h1>
        <p className="mt-1 text-sm text-gray-500">
          Drag and drop Student model fields or general components. Toggle two-column layout to split the form.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="min-w-[200px]">
          <Input
            label="Form title"
            placeholder="e.g. Student Registration"
            value={draft.title}
            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          />
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <LayoutList className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Single column</span>
          <Switch
            checked={draft.twoColumnLayout}
            onChange={(checked) => setDraft((prev) => ({ ...prev, twoColumnLayout: Boolean(checked) }))}
          />
          <span className="text-sm font-medium text-gray-700">Two columns</span>
          <LayoutGrid className="h-4 w-4 text-gray-500" />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-1.5 text-indigo-700">
                <FileText className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Components</h2>
            </div>
            <p className="text-xs text-gray-500">Drag a component into the canvas.</p>
            <div className="mt-4">
              <FormBuilderPalette />
            </div>
          </aside>

          <FormBuilderCanvas
            draft={draft}
            values={values}
            onValueChange={setValue}
            onColumnChange={draft.twoColumnLayout ? setColumn : undefined}
            onRemoveField={removeField}
          />
        </div>

        <DragOverlay>
          {activeDragParsed ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-800 shadow-lg">
              {activeDragParsed.kind === 'student'
                ? STUDENT_FIELD_LABELS[activeDragParsed.field]
                : GENERAL_COMPONENT_LABELS[activeDragParsed.type]}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
