import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Select } from '../../../components/select'
import { groupLearnersByGender, learnerListName } from './matatagRoster'
import type {
  MatatagDescriptor,
  MatatagDescriptorDefinition,
  MatatagGrid as MatatagGridData,
  MatatagGridColumn,
  MatatagMacroSkillDefinition,
} from '../../../types'

interface Props {
  grid: MatatagGridData
  columns: MatatagGridColumn[]
  descriptors: MatatagDescriptorDefinition[]
  macroSkills: MatatagMacroSkillDefinition[]
  failedKeys: Set<string>
  readOnly: boolean
  /** Index into `columns`. Owned by the tab so it survives a panel switch. */
  index: number
  onIndexChange: (index: number) => void
  onSet: (studentId: string, slotId: string, descriptor: MatatagDescriptor | null) => void
}

/**
 * One competency, the whole class, no horizontal scrolling.
 *
 * ## Why this exists alongside the grid
 *
 * Term 3 Reading & Literacy is 91 competencies wide. At the narrowest a
 * one-letter cell can legibly be, that is roughly 3,000 pixels of table, and
 * no amount of tightening changes the arithmetic — a learners x competencies
 * matrix on a 1366-pixel school laptop scrolls sideways or it does not fit.
 *
 * The grid is still the right tool for reviewing a class at a glance, and for
 * a teacher migrating a block of marks out of DepEd's workbook. But it is the
 * wrong tool for the thing an adviser actually spends the afternoon doing,
 * which is working through the class one competency at a time. Transposed that
 * way the screen needs exactly one column of marks, so it fits on any screen,
 * the competency text is readable in full instead of hiding behind a cell, and
 * the targets are buttons a tired person can hit rather than 32-pixel squares.
 *
 * ## The same write path
 *
 * Every mark here goes through the same `onSet` the grid uses, so it inherits
 * the debounced batch, the optimistic cache patch, the failed-cell marking and
 * Retry. Switching views mid-afternoon changes nothing about what is saved.
 */
export function MatatagFocusList({
  grid,
  columns,
  descriptors,
  macroSkills,
  failedKeys,
  readOnly,
  index,
  onIndexChange,
  onSet,
}: Props) {
  const groups = useMemo(() => groupLearnersByGender(grid.learners), [grid.learners])

  // Clamped rather than trusted: the tab keeps this index across an area or
  // term change, and Term 3 holds more competencies than Term 1.
  const safeIndex = Math.min(Math.max(index, 0), Math.max(columns.length - 1, 0))
  const column = columns[safeIndex]

  const skill = useMemo(
    () => (column?.macro_skill ? macroSkills.find(s => s.key === column.macro_skill) : undefined),
    [column, macroSkills]
  )

  const domain = useMemo(
    () => grid.domains.find(d => d.id === column?.domain_id),
    [grid.domains, column]
  )

  const marked = useMemo(() => {
    if (!column) return 0

    return grid.learners.filter(learner => grid.ratings[`${learner.student_id}:${column.slot_id}`])
      .length
  }, [grid.learners, grid.ratings, column])

  if (!column) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
        Nothing to mark here.
      </div>
    )
  }

  const heading = column.parent_label ? `${column.parent_label}${column.label}` : column.label
  const total = grid.learners.length

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onIndexChange(safeIndex - 1)}
            disabled={safeIndex === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>

          <div className="min-w-[240px] flex-1">
            {/* A jump list, so competency 63 of 91 is one action away rather
                than sixty presses of Next. */}
            <Select
              inputSize="sm"
              value={String(safeIndex)}
              onChange={event => onIndexChange(Number(event.target.value))}
              options={columns.map((c, i) => ({
                value: String(i),
                label: `${i + 1}. ${c.parent_label ? `${c.parent_label}${c.label}` : c.label} — ${
                  c.text.length > 70 ? `${c.text.slice(0, 70)}…` : c.text
                }`,
              }))}
            />
          </div>

          <button
            type="button"
            onClick={() => onIndexChange(safeIndex + 1)}
            disabled={safeIndex >= columns.length - 1}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">
            {safeIndex + 1} of {columns.length}
          </span>
          {domain && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{domain.title}</span>
          )}
          {skill && (
            <span
              className="rounded-full px-2 py-0.5 font-medium text-zinc-900"
              style={fillFor(skill)}
            >
              {skill.abbr} · {skill.label}
            </span>
          )}
          <span
            className={`ml-auto font-medium ${marked === total ? 'text-green-700' : 'text-gray-500'}`}
          >
            {marked} of {total} marked
          </span>
        </div>

        <p className="mt-2 text-sm text-gray-900">
          <span className="font-semibold">{heading}.</span>{' '}
          {column.parent_text && <span className="text-gray-600">{column.parent_text} </span>}
          {column.text}
        </p>

        {column.performance_standard && (
          <p className="mt-1 text-xs italic text-gray-600">{column.performance_standard}</p>
        )}

        {column.extra &&
          Object.entries(column.extra).map(([label, value]) => (
            <p key={label} className="mt-1 text-xs text-gray-600">
              <span className="font-medium">{label}:</span> {value}
            </p>
          ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {groups.map(group => (
          <div key={group.key}>
            <p className="border-y border-gray-200 bg-gray-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
              {group.label}{' '}
              <span className="font-semibold text-gray-500">{group.learners.length}</span>
            </p>

            {group.learners.map((learner, indexInGroup) => {
              const key = `${learner.student_id}:${column.slot_id}`
              const value = grid.ratings[key] ?? null
              const hasFailed = failedKeys.has(key)

              return (
                <div
                  key={learner.student_id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 px-3 py-2 last:border-b-0 ${
                    hasFailed ? 'bg-amber-50' : indexInGroup % 2 ? 'bg-gray-50/50' : ''
                  }`}
                >
                  <span className="w-5 text-right text-xs tabular-nums text-gray-400">
                    {indexInGroup + 1}
                  </span>
                  <span className="min-w-[180px] flex-1 text-sm font-medium text-gray-800">
                    {learnerListName(learner)}
                  </span>

                  <div className="flex items-center gap-1">
                    {descriptors.map(descriptor => {
                      const selected = value === descriptor.letter

                      return (
                        <button
                          key={descriptor.letter}
                          type="button"
                          disabled={readOnly}
                          aria-pressed={selected}
                          title={`${descriptor.letter} — ${descriptor.label}`}
                          onClick={() =>
                            onSet(
                              learner.student_id,
                              column.slot_id,
                              // Pressing the mark a learner already has clears
                              // it — the only way to undo a mistyped mark
                              // without a sixth control on every row.
                              selected ? null : descriptor.letter
                            )
                          }
                          className={`h-8 w-8 rounded-lg border text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            selected
                              ? 'border-primary-600 bg-primary-600 text-white'
                              : 'border-gray-300 bg-white text-gray-600 hover:border-primary-400 hover:bg-primary-50'
                          }`}
                        >
                          {descriptor.letter}
                        </button>
                      )
                    })}
                  </div>

                  {hasFailed && (
                    <span className="text-[11px] font-medium text-amber-800">Not saved yet</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The workbook stores ARGB; CSS wants RGB, and the alpha is always opaque. */
function fillFor(skill: MatatagMacroSkillDefinition): { backgroundColor?: string } {
  const argb = skill.fills?.[0]

  return argb && argb.length >= 8 ? { backgroundColor: `#${argb.slice(2)}` } : {}
}
