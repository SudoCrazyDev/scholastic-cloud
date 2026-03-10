import clsx from 'clsx'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { FormBuilderFieldCard } from './FormBuilderFieldCard'
import type { FormBuilderDraft, FormBuilderField } from '../types'

const CANVAS_DROP_ID = 'form-builder-canvas'

export function getCanvasDropId(): string {
  return CANVAS_DROP_ID
}

interface FormBuilderCanvasProps {
  draft: FormBuilderDraft
  values: Record<string, string | number | boolean>
  onValueChange: (id: string, value: string | number | boolean) => void
  onColumnChange?: (id: string, column: 1 | 2) => void
  onRemoveField: (id: string) => void
}

export function FormBuilderCanvas({ draft, values, onValueChange, onColumnChange, onRemoveField }: FormBuilderCanvasProps) {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_DROP_ID })
  const { fields, twoColumnLayout } = draft

  const column1 = twoColumnLayout ? fields.filter((f) => f.column === 1) : fields
  const column2 = twoColumnLayout ? fields.filter((f) => f.column === 2) : []

  const renderFieldList = (list: FormBuilderField[]) => (
    <SortableContext items={list.map((f) => f.id)} strategy={verticalListSortingStrategy}>
      <div className="space-y-3">
        {list.map((field, index) => (
          <FormBuilderFieldCard
            key={field.id}
            field={field}
            index={index}
            twoColumnLayout={twoColumnLayout}
            values={values}
            onValueChange={onValueChange}
            onColumnChange={onColumnChange}
            onRemove={onRemoveField}
          />
        ))}
      </div>
    </SortableContext>
  )

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        'min-h-[320px] overflow-y-auto rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-4 transition-colors',
        isOver && 'border-blue-400 bg-blue-50/50'
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h4 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-1 text-sky-700">
              <DocumentTextIcon className="h-3.5 w-3.5" />
            </div>
            Form Canvas
          </h4>
          <p className="text-xs text-gray-500">
            {twoColumnLayout ? 'Two-column layout. Drag components from the left.' : 'Drag components from the left panel.'}
          </p>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-500">
          <div>
            <DocumentTextIcon className="mx-auto mb-2 h-10 w-10 text-gray-300" />
            <p>Drag form components here</p>
            <p className="mt-1 text-xs">Student model fields or general components</p>
          </div>
        </div>
      ) : twoColumnLayout ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-lg bg-white/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Column 1</p>
            {renderFieldList(column1)}
          </div>
          <div className="space-y-3 rounded-lg bg-white/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Column 2</p>
            {renderFieldList(column2)}
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-white/80 p-3">{renderFieldList(column1)}</div>
      )}
    </section>
  )
}
