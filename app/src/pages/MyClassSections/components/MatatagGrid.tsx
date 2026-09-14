import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Select } from '../../../components/select'
import { parsePastedDescriptors } from './matatagPaste'
import type {
  MatatagDescriptor,
  MatatagDescriptorDefinition,
  MatatagGrid as MatatagGridData,
  MatatagGridColumn,
  MatatagMacroSkillDefinition,
} from '../../../types'

interface ActiveCell {
  studentId: string
  slotId: string
}

interface Props {
  grid: MatatagGridData
  descriptors: MatatagDescriptorDefinition[]
  macroSkills: MatatagMacroSkillDefinition[]
  failedKeys: Set<string>
  highContrast: boolean
  readOnly: boolean
  onSet: (studentId: string, slotId: string, descriptor: MatatagDescriptor | null) => void
  onActiveColumnChange: (column: MatatagGridColumn | null) => void
  /**
   * A paste is a deliberate, discrete action, so unlike a keystroke it does
   * get a message. Reported rather than toasted here because this component
   * stays presentational — the tab owns the side effect.
   */
  onPasteNotice: (
    notice: { kind: 'applied'; count: number } | { kind: 'rejected'; reason: string }
  ) => void
}

/**
 * Learners down, competency slots across — the shape of both the paper form
 * and every other wide grid in this app.
 *
 * ## Why this is a plain table and not a virtualised one
 *
 * The cell *count* is not the problem: 4,550 `<td>`s is about 5,000 nodes, and
 * `SectionGrades` already puts four nested divs inside every cell it renders.
 * The problem would be 4,550 `<Select>` components, each roughly eight nodes
 * plus a Headless UI subscription. So exactly one cell — the active one —
 * renders a real `Select`; the other 4,549 are text in a `<td>`. That honours
 * the repo's Select mandate for the actual editor while keeping one Headless
 * instance on the page.
 *
 * A windowed grid was the other option and cannot work here: it cannot be a
 * real `<table>`, and the three-tier header this form needs is built from
 * `colSpan`. Rows window trivially if a real 50-learner section ever paints
 * slowly; columns would break the header.
 *
 * ## Typing is the fast path
 *
 * A teacher fills a column, not a row. So A-E sets the descriptor and moves
 * **down**, which is the direction the work actually goes. The table owns one
 * `onKeyDown` rather than 4,550 handlers.
 *
 * ## Never pass `disabled` to a cell
 *
 * `ClassSectionCoreValuesTab` disables every cell while a save is in flight.
 * At 91 columns that is an unusable screen, and it silently swallows the
 * keystroke a fast teacher types mid-flight. Cells here stay live always; the
 * save catches up.
 */
export const MatatagGrid = React.memo(function MatatagGrid({
  grid,
  descriptors,
  macroSkills,
  failedKeys,
  highContrast,
  readOnly,
  onSet,
  onActiveColumnChange,
  onPasteNotice,
}: Props) {
  const [active, setActive] = useState<ActiveCell | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)

  const letters = useMemo(() => descriptors.map(d => d.letter), [descriptors])

  const skillsByKey = useMemo(() => {
    const map = new Map<string, MatatagMacroSkillDefinition>()
    macroSkills.forEach(skill => map.set(skill.key, skill))
    return map
  }, [macroSkills])

  const columnIndex = useMemo(() => {
    const map = new Map<string, number>()
    grid.columns.forEach((column, index) => map.set(column.slot_id, index))
    return map
  }, [grid.columns])

  const learnerIndex = useMemo(() => {
    const map = new Map<string, number>()
    grid.learners.forEach((learner, index) => map.set(learner.student_id, index))
    return map
  }, [grid.learners])

  // The active cell is held as ids rather than as a DOM ref, so a re-render
  // cannot lose it — which is the other half of keeping focus still.
  useEffect(() => {
    if (!active) {
      onActiveColumnChange(null)
      return
    }

    const index = columnIndex.get(active.slotId)
    onActiveColumnChange(index === undefined ? null : grid.columns[index])
  }, [active, columnIndex, grid.columns, onActiveColumnChange])

  /** Domain bands, for the top tier of the header. */
  const domainGroups = useMemo(() => {
    const groups: Array<{ id: string | null; title: string; span: number }> = []

    grid.columns.forEach(column => {
      const domain = grid.domains.find(d => d.id === column.domain_id)
      const title = domain?.title ?? 'Competencies'
      const last = groups[groups.length - 1]

      if (last && last.id === (column.domain_id ?? null)) {
        last.span += 1
      } else {
        groups.push({ id: column.domain_id ?? null, title, span: 1 })
      }
    })

    return groups
  }, [grid.columns, grid.domains])

  /** Competency bands, for the middle tier: a number spanning its macro skills. */
  const competencyGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; span: number }> = []

    grid.columns.forEach(column => {
      const key = column.competency_id
      const last = groups[groups.length - 1]

      if (last && last.key === key) {
        last.span += 1
      } else {
        groups.push({
          key,
          label: column.parent_label ? `${column.parent_label}${column.label}` : column.label,
          span: 1,
        })
      }
    })

    return groups
  }, [grid.columns])

  const focusCell = useCallback((studentId: string, slotId: string) => {
    setActive({ studentId, slotId })

    // `block: 'nearest'` on both axes, or the sticky header and the sticky
    // name column scroll the target underneath themselves.
    window.requestAnimationFrame(() => {
      const cell = tableRef.current?.querySelector<HTMLElement>(
        `[data-cell="${studentId}:${slotId}"]`
      )
      cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      cell?.focus({ preventScroll: true })
    })
  }, [])

  const move = useCallback(
    (rowDelta: number, colDelta: number) => {
      if (!active) return

      const row = learnerIndex.get(active.studentId) ?? 0
      const col = columnIndex.get(active.slotId) ?? 0

      const nextRow = Math.min(Math.max(row + rowDelta, 0), grid.learners.length - 1)
      const nextCol = Math.min(Math.max(col + colDelta, 0), grid.columns.length - 1)

      focusCell(grid.learners[nextRow].student_id, grid.columns[nextCol].slot_id)
    },
    [active, learnerIndex, columnIndex, grid.learners, grid.columns, focusCell]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTableElement>) => {
      if (!active) return

      const key = event.key
      const upper = key.length === 1 ? key.toUpperCase() : key
      const chord = event.ctrlKey || event.metaKey

      // Fill down: the same descriptor to every learner below, which is the
      // single most common thing a teacher wants after marking the first.
      //
      // This has to come BEFORE the type-to-set branch. `D` is one of DepEd's
      // five descriptors, so testing for the letter first swallows Ctrl+D
      // whole and quietly marks one cell D instead of filling the column.
      if (!readOnly && chord && upper === 'D') {
        event.preventDefault()
        const value = grid.ratings[`${active.studentId}:${active.slotId}`] ?? null
        const from = learnerIndex.get(active.studentId) ?? 0

        grid.learners.slice(from + 1).forEach(learner => {
          onSet(learner.student_id, active.slotId, value)
        })

        return
      }

      // Every other chord belongs to the browser — Ctrl+C, Ctrl+R and the
      // rest must not be read as descriptors either.
      if (chord && key !== 'Home' && key !== 'End') {
        return
      }

      // Type-to-set, and advance DOWN — a teacher fills a column, not a row.
      if (!readOnly && letters.includes(upper as MatatagDescriptor)) {
        event.preventDefault()
        onSet(active.studentId, active.slotId, upper as MatatagDescriptor)
        move(1, 0)
        return
      }

      if (!readOnly && (key === 'Delete' || key === 'Backspace' || key === ' ')) {
        event.preventDefault()
        onSet(active.studentId, active.slotId, null)
        move(1, 0)
        return
      }

      const moves: Record<string, [number, number]> = {
        ArrowDown: [1, 0],
        ArrowUp: [-1, 0],
        ArrowRight: [0, 1],
        ArrowLeft: [0, -1],
        Enter: [event.shiftKey ? -1 : 1, 0],
        PageDown: [10, 0],
        PageUp: [-10, 0],
      }

      if (moves[key]) {
        event.preventDefault()
        move(moves[key][0], moves[key][1])
        return
      }

      if (key === 'Tab') {
        event.preventDefault()
        move(0, event.shiftKey ? -1 : 1)
        return
      }

      if (key === 'Home' || key === 'End') {
        event.preventDefault()
        const toEnd = key === 'End'

        if (event.ctrlKey) {
          focusCell(
            grid.learners[toEnd ? grid.learners.length - 1 : 0].student_id,
            grid.columns[toEnd ? grid.columns.length - 1 : 0].slot_id
          )
        } else {
          focusCell(active.studentId, grid.columns[toEnd ? grid.columns.length - 1 : 0].slot_id)
        }
      }

    },
    [active, readOnly, letters, onSet, move, focusCell, grid, learnerIndex]
  )

  /**
   * Paste a block of descriptors, anchored at the active cell.
   *
   * The teachers this is for are coming off DepEd's workbook, and copying a
   * column out of it is the first thing they will try. It lands down and to
   * the right of wherever they are, which is how every spreadsheet behaves.
   *
   * A block that does not fit is refused rather than clipped. Too many rows
   * almost always means the copy started on a heading, or came from a class
   * with a different roster — and silently dropping the overflow would leave
   * the rows that *did* land shifted against the wrong learners, which is
   * indistinguishable from a correct paste when every value is one letter.
   */
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTableElement>) => {
      if (readOnly || !active) return

      const text = event.clipboardData.getData('text/plain')
      if (text === '') return

      event.preventDefault()

      const parsed = parsePastedDescriptors(text, letters)

      if (!parsed.ok) {
        onPasteNotice({ kind: 'rejected', reason: parsed.reason })
        return
      }

      const fromRow = learnerIndex.get(active.studentId) ?? 0
      const fromColumn = columnIndex.get(active.slotId) ?? 0
      const rowsLeft = grid.learners.length - fromRow
      const columnsLeft = grid.columns.length - fromColumn

      if (parsed.rows.length > rowsLeft) {
        onPasteNotice({
          kind: 'rejected',
          reason:
            `That is ${parsed.rows.length} rows of marks, and there ${rowsLeft === 1 ? 'is' : 'are'} ` +
            `only ${rowsLeft} ${rowsLeft === 1 ? 'learner' : 'learners'} from here down. Nothing ` +
            'was changed.',
        })
        return
      }

      if (parsed.rows[0].length > columnsLeft) {
        onPasteNotice({
          kind: 'rejected',
          reason:
            `That is ${parsed.rows[0].length} columns of marks, and there ${columnsLeft === 1 ? 'is' : 'are'} ` +
            `only ${columnsLeft} from here across. Nothing was changed.`,
        })
        return
      }

      let count = 0

      parsed.rows.forEach((row, rowOffset) => {
        row.forEach((descriptor, columnOffset) => {
          onSet(
            grid.learners[fromRow + rowOffset].student_id,
            grid.columns[fromColumn + columnOffset].slot_id,
            descriptor
          )
          count++
        })
      })

      onPasteNotice({ kind: 'applied', count })
    },
    [active, readOnly, letters, onSet, onPasteNotice, grid, learnerIndex, columnIndex]
  )

  const fillFor = (column: MatatagGridColumn): string | undefined => {
    if (highContrast || !column.macro_skill) return undefined

    const argb = skillsByKey.get(column.macro_skill)?.fills?.[0]
    if (!argb || argb.length < 8) return undefined

    // The workbook stores ARGB; CSS wants RGB, and the alpha is always opaque.
    return `#${argb.slice(2)}`
  }

  if (grid.columns.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <p className="text-sm text-gray-600">
          {grid.learning_area.title} is not assessed in Term {grid.term}.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          That is the curriculum's own pacing, not a gap in the data — a competency simply has no
          column in a term it is not taught in.
        </p>
      </div>
    )
  }

  if (grid.learners.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
        No learners are enrolled in this section for {grid.academic_year}.
      </div>
    )
  }

  return (
    <div className="overflow-auto border border-gray-200 rounded-xl bg-white max-h-[70vh]">
      <table
        ref={tableRef}
        role="grid"
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className="border-collapse text-xs"
        aria-label={`${grid.learning_area.title}, Term ${grid.term}`}
      >
        <thead>
          {/* Tier 1 — domain bands */}
          {grid.learning_area.has_domains && (
            <tr>
              <th className="sticky left-0 top-0 z-30 bg-gray-100 border border-gray-200 px-3 py-2 text-left min-w-[200px]">
                <span className="sr-only">Learner</span>
              </th>
              {domainGroups.map((group, index) => (
                <th
                  key={`${group.id ?? 'none'}-${index}`}
                  colSpan={group.span}
                  className="sticky top-0 z-20 bg-gray-100 border border-gray-200 px-2 py-1.5 text-[11px] font-semibold text-gray-700 text-center whitespace-nowrap"
                  title={group.title}
                >
                  {group.title}
                </th>
              ))}
            </tr>
          )}

          {/* Tier 2 — competency numbers, each spanning its macro skills */}
          <tr>
            <th
              className="sticky left-0 z-30 bg-gray-50 border border-gray-200 px-3 py-2 text-left min-w-[200px]"
              style={{ top: grid.learning_area.has_domains ? 30 : 0 }}
            >
              <span className="sr-only">Learner</span>
            </th>
            {competencyGroups.map(group => (
              <th
                key={group.key}
                colSpan={group.span}
                className="z-10 bg-gray-50 border border-gray-200 px-1 py-1 text-[11px] font-semibold text-gray-700 text-center"
              >
                {group.label}
              </th>
            ))}
          </tr>

          {/* Tier 3 — macro skill, when the area uses them */}
          {grid.learning_area.uses_macro_skills && (
            <tr>
              <th className="sticky left-0 z-30 bg-white border border-gray-200 px-3 py-2 text-left min-w-[200px]">
                Learner
              </th>
              {grid.columns.map(column => {
                const skill = column.macro_skill ? skillsByKey.get(column.macro_skill) : undefined

                return (
                  <th
                    key={column.slot_id}
                    className="border border-gray-200 px-1 py-1 text-[10px] font-bold text-center w-8 min-w-[32px]"
                    style={{ backgroundColor: fillFor(column) }}
                    title={skill?.label ?? undefined}
                  >
                    {/* Never colour alone: the glyph carries the same
                        information for a colour-blind teacher, in greyscale,
                        and on a photocopy. */}
                    <span className="text-zinc-900" aria-label={skill?.label ?? undefined}>
                      {skill?.abbr ?? '·'}
                    </span>
                  </th>
                )
              })}
            </tr>
          )}

          {!grid.learning_area.uses_macro_skills && (
            <tr>
              <th className="sticky left-0 z-30 bg-white border border-gray-200 px-3 py-2 text-left min-w-[200px]">
                Learner
              </th>
              {grid.columns.map(column => (
                <th
                  key={column.slot_id}
                  className="border border-gray-200 px-1 py-1 text-[10px] text-center w-8 min-w-[32px] bg-white"
                >
                  <span className="sr-only">{column.label}</span>
                </th>
              ))}
            </tr>
          )}
        </thead>

        <tbody>
          {grid.learners.map((learner, rowIndex) => (
            <tr key={learner.student_id} className={rowIndex % 2 ? 'bg-gray-50/60' : 'bg-white'}>
              <th
                scope="row"
                className={`sticky left-0 z-10 border border-gray-200 px-3 py-1.5 text-left font-medium text-gray-800 whitespace-nowrap ${
                  rowIndex % 2 ? 'bg-gray-50' : 'bg-white'
                }`}
              >
                {learner.name}
              </th>

              {grid.columns.map(column => {
                const key = `${learner.student_id}:${column.slot_id}`
                const value = grid.ratings[key] ?? ''
                const isActive =
                  active?.studentId === learner.student_id && active?.slotId === column.slot_id
                const hasFailed = failedKeys.has(key)

                if (isActive && !readOnly) {
                  return (
                    <td
                      key={column.slot_id}
                      data-cell={key}
                      className="border border-primary-500 p-0 w-8 min-w-[32px] ring-2 ring-primary-400"
                    >
                      <Select
                        autoFocus
                        inputSize="sm"
                        className="!w-full"
                        value={value}
                        onChange={event =>
                          onSet(
                            learner.student_id,
                            column.slot_id,
                            (event.target.value || null) as MatatagDescriptor | null
                          )
                        }
                        options={[
                          { value: '', label: '—' },
                          ...descriptors.map(d => ({ value: d.letter, label: `${d.letter} · ${d.label}` })),
                        ]}
                      />
                    </td>
                  )
                }

                return (
                  <td
                    key={column.slot_id}
                    data-cell={key}
                    tabIndex={isActive ? 0 : -1}
                    role="gridcell"
                    aria-label={`${learner.name}, ${column.label}${
                      column.macro_skill ? `, ${column.macro_skill}` : ''
                    }${value ? `, ${value}` : ', not marked'}`}
                    onClick={() => focusCell(learner.student_id, column.slot_id)}
                    onFocus={() => setActive({ studentId: learner.student_id, slotId: column.slot_id })}
                    className={`border px-1 py-1.5 text-center font-semibold cursor-pointer select-none w-8 min-w-[32px] outline-none ${
                      hasFailed
                        ? 'border-amber-500 bg-amber-50 text-amber-900'
                        : isActive
                          ? 'border-primary-500 ring-2 ring-primary-400 text-gray-900'
                          : 'border-gray-200 text-gray-800 hover:bg-primary-50'
                    }`}
                    title={hasFailed ? 'Not saved yet — press Retry' : undefined}
                  >
                    {value || <span className="text-gray-300">·</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})
