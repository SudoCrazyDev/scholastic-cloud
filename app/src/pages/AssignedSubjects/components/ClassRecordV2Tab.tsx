import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownTrayIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Select } from '../../../components/select'
import { Button } from '../../../components/button'
import { Alert } from '../../../components/alert'
import { useAuth } from '../../../hooks/useAuth'
import { useFeatures } from '../../../hooks/useFeatures'
import { useStudents } from '../../../hooks/useStudents'
import { useStudentScores } from '../../../hooks/useStudentScores'
import { useStudentRunningGrades } from '../../../hooks/useStudentRunningGrades'
import { useSubjectEcrItems, useSubjectEcrs } from '../../../hooks/useSubjectEcrItems'
import { useGradingPeriods } from '../../../hooks/useGradingPeriods'
import { studentScoreService } from '../../../services/studentScoreService'
import { studentRunningGradeService } from '../../../services/studentRunningGradeService'
import type { StudentRunningGrade } from '../../../services/studentRunningGradeService'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorHandler } from '../../../utils/errorHandler'
import { isGradeTwoToTen } from '../../../utils/gradeLevel'
import { getGradeRemarks } from '../../../utils/gradeUtils'
import { performanceDescriptorFor } from '../../../components/depedPerformanceReport/depedPerformanceDescriptors'
import { mapScoreToLabel, type GradeBandLike } from '../../../utils/gradeScale'
import type { Student } from '../../../types'

/**
 * The class record as a spreadsheet — DepEd's Electronic Class Record laid out
 * the way a teacher reads it on paper: one row per learner, one column per
 * grade item, and each component's Total / PS / WS beside its items.
 *
 * ## Why this sits beside the other two tabs rather than replacing them
 *
 * The same numbers are already reachable, just not at the same time. **Student
 * Scores** opens one grade item at a time in a modal, so comparing two learners
 * across a term means opening fifteen modals. **Class Record** shows the
 * encoded Term Grade per period and nothing of what produced it. Teachers asked
 * for the sheet they already keep in Excel, and both existing tabs have callers
 * and habits built around them, so this is additive.
 *
 * ## The arithmetic is the server's, recomputed here for immediacy
 *
 * Every figure in a component group mirrors `RunningGradeRecalcService`
 * exactly:
 *
 *   PS = (scores entered) / (highest possible for the component) × 100
 *   WS = PS × (the component's percentage) / 100
 *   Initial Grade = the sum of every component's WS
 *
 * It is recomputed in the browser rather than read off `student_running_grades`
 * so a typed score moves the row before the round trip finishes — the whole
 * point of a spreadsheet. The server still recalculates on every save, and the
 * two agree; if they ever did not, the server's is the grade of record.
 *
 * Items are *not* individually weighted. DepEd's own form sometimes weights the
 * exams inside the Examinations component (ST1 30%, ST2 30%, TE 40%);
 * `subject_ecr_items` has no weight column, so a component's items are summed,
 * which is what every grade in this system already means. Adding per-item
 * weights is a data-model change, not a layout one.
 *
 * ## Term Grade is still applied deliberately
 *
 * The Initial Grade is arithmetic; the Term Grade is a decision, and
 * `student_running_grades.final_grade` only ever holds what a teacher applied
 * (see `depedPerformanceGrades.ts` on why the two must not be conflated).
 * So the Term Grade column is drafted locally — "Fill from Initial Grade" only
 * fills the drafts — and nothing is written until Save is pressed.
 */
interface ClassRecordV2TabProps {
  subjectId: string
  classSectionId: string
  isLimited?: boolean
  assignedStudentIds?: string[]
  /** School year of the subject's class section; grades are filed under it. */
  academicYear?: string
  /**
   * Grade level of the subject's class section, which decides whether it is
   * graded over 4 quarters or 3 terms. Senior High stays on quarters even in a
   * year the school runs on terms, so this is not the school-wide setting.
   */
  gradeLevel?: string | null
  /** Non-numerical grading bands; when present the Term Grade shows its letter. */
  gradingBands?: GradeBandLike[] | null
}

interface EcrComponent {
  id: string
  title: string
  percentage: number | string
  created_at?: string
}

interface EcrItem {
  id: string
  title: string
  score: number | string | null
  quarter: string
  academic_year?: string | null
  scheduled_date?: string | null
  created_at?: string
  subject_ecr_id?: string
  subject_ecr?: { id: string; title: string }
}

/** A score as the grid holds it: the row id (absent until first saved) and the value. */
interface ScoreEntry {
  id?: string
  score: number
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const scoreKey = (studentId: string, itemId: string) => `${studentId}|${itemId}`

const toNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Two decimals, or an em dash when there is nothing to show. */
const decimals = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? '—' : value.toFixed(2)

/**
 * Columns run left to right in the order the teacher gave the items, which is
 * the order the API sorts by (scheduled date first, undated last) — but the API
 * breaks ties newest-first, and a class record numbers its items oldest-first.
 */
const byGivenOrder = (a: EcrItem, b: EcrItem): number => {
  const dateA = a.scheduled_date ?? null
  const dateB = b.scheduled_date ?? null
  if (dateA && dateB && dateA !== dateB) return dateA < dateB ? -1 : 1
  if (dateA && !dateB) return -1
  if (!dateA && dateB) return 1
  return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
}

const GENDER_GROUPS: { key: string; label: string }[] = [
  { key: 'male', label: 'MALE' },
  { key: 'female', label: 'FEMALE' },
  { key: 'other', label: 'OTHER' },
]

/**
 * A colour identity per component, cycled in the order the components run.
 *
 * Positional rather than keyed on a name: components are named by each school,
 * so there is no "Written Works" to match on, and a fourth or fifth component
 * would fall back to grey. Every class is written out in full because Tailwind
 * only keeps the ones it can see in the source.
 */
const GROUP_PALETTES = [
  {
    band: 'bg-sky-700 text-white',
    sub: 'bg-sky-50 text-sky-900',
    hps: 'bg-sky-50/70 text-sky-700',
    roll: 'bg-sky-50/70',
    edge: 'border-l-2 border-l-sky-300',
    dot: 'bg-sky-600',
  },
  {
    band: 'bg-emerald-700 text-white',
    sub: 'bg-emerald-50 text-emerald-900',
    hps: 'bg-emerald-50/70 text-emerald-700',
    roll: 'bg-emerald-50/70',
    edge: 'border-l-2 border-l-emerald-300',
    dot: 'bg-emerald-600',
  },
  {
    band: 'bg-violet-700 text-white',
    sub: 'bg-violet-50 text-violet-900',
    hps: 'bg-violet-50/70 text-violet-700',
    roll: 'bg-violet-50/70',
    edge: 'border-l-2 border-l-violet-300',
    dot: 'bg-violet-600',
  },
  {
    band: 'bg-amber-700 text-white',
    sub: 'bg-amber-50 text-amber-900',
    hps: 'bg-amber-50/70 text-amber-700',
    roll: 'bg-amber-50/70',
    edge: 'border-l-2 border-l-amber-300',
    dot: 'bg-amber-600',
  },
  {
    band: 'bg-rose-700 text-white',
    sub: 'bg-rose-50 text-rose-900',
    hps: 'bg-rose-50/70 text-rose-700',
    roll: 'bg-rose-50/70',
    edge: 'border-l-2 border-l-rose-300',
    dot: 'bg-rose-600',
  },
  {
    band: 'bg-teal-700 text-white',
    sub: 'bg-teal-50 text-teal-900',
    hps: 'bg-teal-50/70 text-teal-700',
    roll: 'bg-teal-50/70',
    edge: 'border-l-2 border-l-teal-300',
    dot: 'bg-teal-600',
  },
]

const paletteFor = (index: number) => GROUP_PALETTES[index % GROUP_PALETTES.length]

/**
 * How a grade reads at a glance. The 75 line is the one that matters — it is
 * the passing mark on both the DO 8 and the DO 15 card — so it is the only
 * place the colour crosses from warm to cool.
 */
const gradeTone = (grade: number | null): string => {
  if (grade === null || grade <= 0) return 'text-gray-300'
  if (grade >= 90) return 'text-emerald-700'
  if (grade >= 85) return 'text-sky-700'
  if (grade >= 75) return 'text-amber-700'
  return 'text-rose-700'
}

const descriptorTone = (grade: number | null): string => {
  if (grade === null || grade <= 0) return 'bg-gray-100 text-gray-400'
  if (grade >= 90) return 'bg-emerald-100 text-emerald-800'
  if (grade >= 85) return 'bg-sky-100 text-sky-800'
  if (grade >= 75) return 'bg-amber-100 text-amber-800'
  return 'bg-rose-100 text-rose-800'
}

const formatName = (student: Student): string => {
  const middle = student.middle_name ? ` ${student.middle_name.charAt(0)}.` : ''
  const ext = student.ext_name ? ` ${student.ext_name}` : ''
  return `${student.last_name}, ${student.first_name}${middle}${ext}`
}

/**
 * One score cell.
 *
 * Deliberately not `StudentScoreInput`: that is a Formik form with a delete
 * button and a toast per save, which is right for a list of a dozen learners
 * and wrong for a grid that can hold eight hundred inputs. This keeps its draft
 * in local state so a keystroke re-renders one cell rather than the sheet, and
 * reports success with a ring instead of a toast.
 */
const ScoreCell = React.memo<{
  studentId: string
  itemId: string
  maxScore: number
  entry?: ScoreEntry
  disabled?: boolean
  onSaved: (key: string, entry: ScoreEntry) => void
  /** DOM id of the cell below, so Enter walks down the column like a spreadsheet. */
  nextCellId: string | null
  cellId: string
}>(({ studentId, itemId, maxScore, entry, disabled, onSaved, nextCellId, cellId }) => {
  const [draft, setDraft] = useState<string>(entry ? String(entry.score) : '')
  const [state, setState] = useState<SaveState>('idle')
  const committed = useRef<string>(entry ? String(entry.score) : '')

  // A refetch (or another teacher's save) is authoritative unless this cell is
  // mid-edit; comparing against the last committed value keeps typing safe.
  useLayoutEffect(() => {
    const incoming = entry ? String(entry.score) : ''
    if (incoming !== committed.current) {
      committed.current = incoming
      setDraft(incoming)
    }
  }, [entry])

  const commit = async () => {
    const trimmed = draft.trim()
    if (trimmed === committed.current) return

    // Clearing a cell is not a delete: the score row stays as it was, because
    // removing it here would silently drop a mark a teacher meant to retype.
    if (trimmed === '') {
      setDraft(committed.current)
      return
    }

    const value = Number(trimmed)
    if (!Number.isFinite(value) || value < 0 || value > maxScore) {
      setState('error')
      toast.error(`Score must be between 0 and ${maxScore}`)
      return
    }

    setState('saving')
    try {
      // The store endpoint upserts, so one call covers a first mark and a correction.
      const response = await studentScoreService.create({
        // No year here: a score belongs to whatever year its grade item is filed under.
        student_id: studentId,
        subject_ecr_item_id: itemId,
        score: value,
      })
      const saved = response?.data ?? response
      committed.current = String(value)
      setDraft(String(value))
      onSaved(scoreKey(studentId, itemId), { id: saved?.id ?? entry?.id, score: value })
      setState('saved')
    } catch (error) {
      setState('error')
      toast.error(ErrorHandler.handle(error).message)
    }
  }

  const ring =
    state === 'saving'
      ? 'ring-2 ring-inset ring-amber-400 bg-amber-50'
      : state === 'error'
        ? 'ring-2 ring-inset ring-rose-500 bg-rose-50'
        : state === 'saved'
          ? 'ring-2 ring-inset ring-emerald-400 bg-emerald-50/70'
          : ''

  return (
    <input
      id={cellId}
      data-cell-id={cellId}
      type="number"
      inputMode="decimal"
      min={0}
      max={maxScore}
      step="any"
      disabled={disabled}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value)
        if (state !== 'idle') setState('idle')
      }}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        void commit().then(() => {
          if (!nextCellId) return
          const next = document.getElementById(nextCellId) as HTMLInputElement | null
          next?.focus()
        })
      }}
      placeholder="·"
      className={`h-8 w-full rounded-none border-0 bg-transparent px-1 text-center text-xs font-medium tabular-nums text-gray-900 transition-colors placeholder:font-normal placeholder:text-gray-300 hover:bg-white hover:ring-1 hover:ring-inset hover:ring-primary-300 focus:z-10 focus:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 disabled:text-gray-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${ring}`}
    />
  )
})
ScoreCell.displayName = 'ScoreCell'

export const ClassRecordV2Tab: React.FC<ClassRecordV2TabProps> = ({
  subjectId,
  classSectionId,
  isLimited = false,
  assignedStudentIds = [],
  academicYear,
  gradeLevel,
  gradingBands = null,
}) => {
  const queryClient = useQueryClient()
  const { currentAcademicYear } = useAuth()
  const { hasFeature } = useFeatures()
  const effectiveAcademicYear = academicYear ?? currentAcademicYear ?? ''
  const gradingPeriods = useGradingPeriods(gradeLevel)

  const [period, setPeriod] = useState<string>('1')
  /** Scores saved in this session, laid over the fetched set so the sheet never flickers back. */
  const [localScores, setLocalScores] = useState<Record<string, ScoreEntry>>({})
  /** Term Grade drafts, keyed by student. Nothing here is written until Save. */
  const [termDrafts, setTermDrafts] = useState<Record<string, string>>({})
  const [isSavingTerms, setIsSavingTerms] = useState(false)

  const { students, loading: studentsLoading, error: studentsError } = useStudents({
    class_section_id: classSectionId,
  })
  const { data: componentsData, isLoading: componentsLoading, error: componentsError } =
    useSubjectEcrs(subjectId)
  /*
   * Column groups run left to right in the order the school set the components
   * up — Written Works, Performance Tasks, Examinations, as the form has it.
   * The endpoint hands them back newest-first, which reverses that, and leaves
   * components saved in the same second in whatever order the table returns
   * them; the id breaks that tie so the columns do not move between loads.
   */
  const components = useMemo<EcrComponent[]>(
    () =>
      [...((componentsData?.data ?? []) as EcrComponent[])].sort((a, b) => {
        const order = String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
        return order !== 0 ? order : a.id.localeCompare(b.id)
      }),
    [componentsData]
  )
  const componentIds = components.map((component) => component.id)
  const { data: itemsData, isLoading: itemsLoading, error: itemsError } = useSubjectEcrItems(
    componentIds.length > 0 ? { subject_ecr_id: componentIds } : undefined
  )
  const { data: scoresData, isLoading: scoresLoading, error: scoresError } = useStudentScores({
    subjectId,
    classSectionId,
  })
  const { data: runningGradesData, isLoading: gradesLoading } = useStudentRunningGrades({
    subjectId,
    classSectionId,
  })

  // A year that runs on terms has no 4th period, so never leave the filter on one.
  useLayoutEffect(() => {
    if (!gradingPeriods.hasPeriod(period)) setPeriod('1')
  }, [gradingPeriods, period])

  const roster = useMemo(() => {
    const visible =
      isLimited && assignedStudentIds.length > 0
        ? students.filter((student) => assignedStudentIds.includes(student.id))
        : isLimited
          ? []
          : students

    return GENDER_GROUPS.map((group) => ({
      ...group,
      students: visible
        .filter((student) => (student.gender || 'other') === group.key)
        .sort((a, b) => formatName(a).localeCompare(formatName(b))),
    })).filter((group) => group.students.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, isLimited, assignedStudentIds.join(',')])

  /**
   * One column group per component, holding the items this grading period has.
   *
   * Items saved before the year was stamped on them carry no `academic_year`;
   * they are kept, exactly as `RunningGradeRecalcService` keeps them, because
   * dropping them here would show a grade the server does not compute.
   */
  const columnGroups = useMemo(() => {
    const items: EcrItem[] = itemsData?.data ?? []
    return components.map((component) => {
      const owned = items
        .filter((item) => (item.subject_ecr?.id ?? item.subject_ecr_id) === component.id)
        .filter((item) => String(item.quarter) === period)
        .filter((item) => !item.academic_year || item.academic_year === effectiveAcademicYear)
        .sort(byGivenOrder)

      return {
        component,
        items: owned,
        percentage: toNumber(component.percentage),
        highestPossible: owned.reduce((total, item) => total + toNumber(item.score), 0),
      }
    })
  }, [components, itemsData, period, effectiveAcademicYear])

  /** Every score for this subject, keyed `studentId|itemId`, with this session's saves on top. */
  const scoresByKey = useMemo(() => {
    const map: Record<string, ScoreEntry> = {}
    for (const row of scoresData?.data ?? []) {
      map[scoreKey(row.student_id, row.subject_ecr_item_id)] = {
        id: row.id,
        score: toNumber(row.score),
      }
    }
    return { ...map, ...localScores }
  }, [scoresData, localScores])

  /**
   * The running-grade row behind each student's Term Grade.
   *
   * A subject can carry rows from more than one school year; ordering the
   * section's own year last lets it win the key, while a period it has no row
   * for still shows the grade there is rather than going blank.
   */
  const runningGradeByStudent = useMemo(() => {
    const rows = [...((runningGradesData?.data ?? []) as StudentRunningGrade[])].sort(
      (a, b) =>
        Number(a.academic_year === effectiveAcademicYear) -
        Number(b.academic_year === effectiveAcademicYear)
    )
    const map: Record<string, StudentRunningGrade> = {}
    for (const row of rows) {
      if (String(row.quarter) !== period) continue
      map[row.student_id] = row
    }
    return map
  }, [runningGradesData, effectiveAcademicYear, period])

  /** Per student: each component's earned total, PS and WS, and the Initial Grade. */
  const computed = useMemo(() => {
    const result: Record<
      string,
      { groups: { earned: number; ps: number | null; ws: number | null }[]; initial: number | null }
    > = {}

    for (const group of roster) {
      for (const student of group.students) {
        let initial = 0
        let counted = false

        const groups = columnGroups.map(({ items, percentage, highestPossible }) => {
          const earned = items.reduce(
            (total, item) => total + (scoresByKey[scoreKey(student.id, item.id)]?.score ?? 0),
            0
          )
          if (highestPossible <= 0) return { earned, ps: null, ws: null }

          const ps = (earned / highestPossible) * 100
          const ws = (ps * percentage) / 100
          initial += ws
          counted = true
          return { earned, ps, ws }
        })

        result[student.id] = {
          groups,
          initial: counted ? Math.round(initial * 100) / 100 : null,
        }
      }
    }

    return result
  }, [roster, columnGroups, scoresByKey])

  /**
   * Which vocabulary the Descriptor column speaks.
   *
   * DO 15, s. 2026 replaced Outstanding … Did Not Meet Expectations with
   * Advancing … Emerging, and the app already decides per section which of the
   * two report cards a school prints. The class record says whatever that card
   * will say — a teacher reading "Benchmarking" here and "Very Satisfactory" on
   * the card would reasonably think one of them is wrong. The module permission
   * is not consulted: it governs who may open the report, not which words the
   * grade is called by.
   */
  const usesNewDescriptors =
    hasFeature('deped-performance-report') && isGradeTwoToTen(gradeLevel)

  const describe = (grade: number | null): string => {
    if (grade === null || grade <= 0) return '—'
    if (!usesNewDescriptors) return getGradeRemarks(grade)
    return performanceDescriptorFor(grade)?.description ?? '—'
  }

  const termGradeValue = (studentId: string): string => {
    if (studentId in termDrafts) return termDrafts[studentId]
    const applied = runningGradeByStudent[studentId]?.final_grade
    return applied === null || applied === undefined ? '' : String(Math.round(Number(applied)))
  }

  const isTermDraftDirty = (studentId: string): boolean => {
    if (!(studentId in termDrafts)) return false
    const applied = runningGradeByStudent[studentId]?.final_grade
    const current = applied === null || applied === undefined ? '' : String(Math.round(Number(applied)))
    return termDrafts[studentId].trim() !== current
  }

  const dirtyTermStudentIds = useMemo(
    () => Object.keys(termDrafts).filter(isTermDraftDirty),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [termDrafts, runningGradeByStudent]
  )

  const fillTermGradesFromInitial = () => {
    const next: Record<string, string> = { ...termDrafts }
    let filled = 0
    for (const group of roster) {
      for (const student of group.students) {
        const initial = computed[student.id]?.initial
        if (initial === null || initial === undefined || initial <= 0) continue
        next[student.id] = String(Math.round(initial))
        filled += 1
      }
    }
    setTermDrafts(next)
    toast.success(
      filled === 0
        ? 'No initial grades to copy yet'
        : `Copied ${filled} initial grade${filled === 1 ? '' : 's'} — review, then save`
    )
  }

  const saveTermGrades = async () => {
    const payload = dirtyTermStudentIds
      .map((studentId) => {
        const raw = termDrafts[studentId].trim()
        const value = Number(raw)
        if (raw === '' || !Number.isFinite(value) || value < 0 || value > 100) return null
        return {
          studentId,
          subjectId,
          quarter: period as '1' | '2' | '3' | '4',
          finalGrade: value,
          academicYear: effectiveAcademicYear,
          gradeId: runningGradeByStudent[studentId]?.id as string | undefined,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    if (payload.length === 0) {
      toast.error('Nothing to save — term grades must be between 0 and 100')
      return
    }

    setIsSavingTerms(true)
    try {
      // The endpoint takes at most 100 rows, and a section can be larger.
      for (let index = 0; index < payload.length; index += 100) {
        await studentRunningGradeService.bulkUpsertFinalGrades(payload.slice(index, index + 100))
      }
      setTermDrafts({})
      await queryClient.invalidateQueries({ queryKey: ['student-running-grades'] })
      toast.success(`Saved ${payload.length} term grade${payload.length === 1 ? '' : 's'}`)
    } catch (error) {
      toast.error(ErrorHandler.handle(error).message)
    } finally {
      setIsSavingTerms(false)
    }
  }

  const handleScoreSaved = (key: string, entry: ScoreEntry) => {
    setLocalScores((previous) => ({ ...previous, [key]: entry }))
    // The server recalculates the running grade on every score, and other tabs
    // read it. Nothing here waits on the refetch — the sheet already moved.
    queryClient.invalidateQueries({ queryKey: ['student-scores'] })
    queryClient.invalidateQueries({ queryKey: ['student-running-grades'] })
  }

  /*
   * Three header rows stack against the top of the scroll box, so each needs the
   * height of the ones above it. Measuring beats hardcoding: the group row grows
   * when a component's name wraps, and a guessed offset would leave a gap or
   * hide a row of column numbers behind the one above.
   */
  const groupRowRef = useRef<HTMLTableRowElement>(null)
  const columnRowRef = useRef<HTMLTableRowElement>(null)
  const [headerOffsets, setHeaderOffsets] = useState<[number, number]>([0, 0])

  // No dependency list: the rows can change height for reasons no dependency
  // names — a longer component title, a narrower window. Returning the previous
  // tuple unchanged is what stops that from looping.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const groupHeight = groupRowRef.current?.offsetHeight ?? 0
    const columnHeight = columnRowRef.current?.offsetHeight ?? 0
    setHeaderOffsets((previous) =>
      previous[0] === groupHeight && previous[1] === groupHeight + columnHeight
        ? previous
        : [groupHeight, groupHeight + columnHeight]
    )
  })

  const isLoading = studentsLoading || componentsLoading || itemsLoading || scoresLoading || gradesLoading
  const loadError = studentsError || componentsError || itemsError || scoresError

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    )
  }

  if (loadError) {
    return (
      <Alert type="error" message={ErrorHandler.handle(loadError).message} show={true} />
    )
  }

  if (components.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
        <ExclamationTriangleIcon className="mx-auto h-8 w-8 text-gray-400" />
        <h3 className="mt-3 text-sm font-semibold text-gray-900">
          No summative assessment components yet
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
          A class record needs its components and their percentages first — Written Works,
          Performance Tasks, Examinations. Set them up under{' '}
          <span className="font-medium">Components of Summative Assessment</span>.
        </p>
      </div>
    )
  }

  const totalColumns =
    2 + columnGroups.reduce((total, group) => total + Math.max(group.items.length, 0) + 3, 0) + 3

  const itemCount = columnGroups.reduce((total, group) => total + group.items.length, 0)

  // Every score input in the sheet, in visual order, so Enter can walk down a column.
  const cellIdFor = (studentId: string, itemId: string) => `crv2-${studentId}-${itemId}`
  const orderedStudentIds = roster.flatMap((group) => group.students.map((student) => student.id))

  /** The class's average Initial Grade. Null until somebody has one. */
  const classAverage = (() => {
    const grades = orderedStudentIds
      .map((studentId) => computed[studentId]?.initial ?? null)
      .filter((grade): grade is number => grade !== null && grade > 0)
    if (grades.length === 0) return null
    return grades.reduce((total, grade) => total + grade, 0) / grades.length
  })()

  /** Column cells shared by the header rows and the body, so the ruling lines up. */
  const cellBorder = 'border border-slate-200'
  const headerCell = `${cellBorder} px-1 text-center text-[10px] font-semibold uppercase tracking-wider`
  const frozenHeader = `${headerCell} border-slate-600 bg-slate-700 text-white`
  const stickyIndex = 'sticky left-0 w-10 min-w-10'
  const stickyName = 'sticky left-10 w-64 min-w-64'
  /** The frozen names end here; a heavier rule stops the sheet bleeding into them. */
  const nameEdge = 'border-r-2 border-r-slate-300'
  const resultsEdge = 'border-l-2 border-l-slate-400'

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
          <div className="w-44">
            <label
              className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
              htmlFor="crv2-period"
            >
              Grading period
            </label>
            <Select
              id="crv2-period"
              inputSize="sm"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              options={gradingPeriods.options}
            />
          </div>

          <dl className="flex items-end gap-7 pb-1">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Learners
              </dt>
              <dd className="text-lg font-semibold leading-tight text-slate-900 tabular-nums">
                {orderedStudentIds.length}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Grade items
              </dt>
              <dd className="text-lg font-semibold leading-tight text-slate-900 tabular-nums">
                {itemCount}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Class average
              </dt>
              <dd
                className={`text-lg font-semibold leading-tight tabular-nums ${gradeTone(classAverage)}`}
              >
                {classAverage === null ? '—' : classAverage.toFixed(2)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={fillTermGradesFromInitial}>
            <ArrowDownTrayIcon className="h-4 w-4" />
            Fill from Initial Grade
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void saveTermGrades()}
            disabled={dirtyTermStudentIds.length === 0 || isSavingTerms}
          >
            <CheckIcon className="h-4 w-4" />
            {isSavingTerms
              ? 'Saving…'
              : `Save term grades${dirtyTermStudentIds.length > 0 ? ` (${dirtyTermStudentIds.length})` : ''}`}
          </Button>
        </div>
      </div>

      {/* Which colour is which component, and what the sheet expects of you */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
        {columnGroups.map(({ component, percentage }, groupIndex) => (
          <span key={component.id} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${paletteFor(groupIndex).dot}`} />
            <span className="font-medium text-slate-700">{component.title}</span>
            <span className="tabular-nums">{percentage}%</span>
          </span>
        ))}
        <span className="text-slate-400">
          Scores save as you leave a cell · Enter drops to the next learner · Term Grade is a draft
          until saved
        </span>
      </div>

      {/* The sheet */}
      <div
        className="overflow-auto rounded-xl border border-slate-300 shadow-sm"
        style={{ maxHeight: '70vh' }}
      >
        <table
          className="min-w-full text-xs"
          style={{ borderCollapse: 'separate', borderSpacing: 0 }}
        >
          <thead>
            {/* Component groups */}
            <tr ref={groupRowRef}>
              <th
                rowSpan={2}
                className={`${frozenHeader} ${stickyIndex} z-40`}
                style={{ top: 0, position: 'sticky' }}
              >
                #
              </th>
              <th
                rowSpan={2}
                className={`${frozenHeader} ${stickyName} ${nameEdge} z-40 px-2 text-left`}
                style={{ top: 0, position: 'sticky' }}
              >
                Learners&apos; Names
              </th>
              {columnGroups.map(({ component, items, percentage }, groupIndex) => (
                <th
                  key={component.id}
                  colSpan={items.length + 3}
                  className={`${headerCell} ${paletteFor(groupIndex).band} ${paletteFor(groupIndex).edge} z-30 py-1.5`}
                  style={{ top: 0, position: 'sticky' }}
                >
                  {component.title} <span className="font-normal opacity-80">({percentage}%)</span>
                </th>
              ))}
              <th
                rowSpan={2}
                className={`${frozenHeader} ${resultsEdge} z-30 w-16 min-w-16 leading-tight`}
                style={{ top: 0, position: 'sticky' }}
              >
                Initial
                <br />
                Grade
              </th>
              <th
                rowSpan={2}
                className={`${frozenHeader} z-30 w-20 min-w-20 leading-tight`}
                style={{ top: 0, position: 'sticky' }}
              >
                Term
                <br />
                Grade
              </th>
              <th
                rowSpan={2}
                className={`${frozenHeader} z-30 w-44 min-w-44`}
                style={{ top: 0, position: 'sticky' }}
              >
                Descriptor
              </th>
            </tr>

            {/* Item numbers and each component's roll-up */}
            <tr ref={columnRowRef}>
              {columnGroups.map(({ component, items }, groupIndex) => {
                const palette = paletteFor(groupIndex)
                return (
                  <React.Fragment key={component.id}>
                    {items.map((item, index) => (
                      <th
                        key={item.id}
                        title={`${item.title} — highest possible ${toNumber(item.score)}`}
                        className={`${headerCell} ${palette.sub} ${index === 0 ? palette.edge : ''} z-30 w-10 min-w-10 cursor-help`}
                        style={{ top: headerOffsets[0], position: 'sticky' }}
                      >
                        {index + 1}
                      </th>
                    ))}
                    <th
                      className={`${headerCell} ${palette.sub} ${items.length === 0 ? palette.edge : ''} z-30 w-12 min-w-12`}
                      style={{ top: headerOffsets[0], position: 'sticky' }}
                    >
                      Total
                    </th>
                    <th
                      className={`${headerCell} ${palette.sub} z-30 w-12 min-w-12`}
                      style={{ top: headerOffsets[0], position: 'sticky' }}
                    >
                      PS
                    </th>
                    <th
                      className={`${headerCell} ${palette.sub} z-30 w-12 min-w-12`}
                      style={{ top: headerOffsets[0], position: 'sticky' }}
                    >
                      WS
                    </th>
                  </React.Fragment>
                )
              })}
            </tr>

            {/* Highest possible score */}
            <tr>
              <th
                colSpan={2}
                className={`${headerCell} ${stickyIndex} ${nameEdge} z-40 bg-slate-100 pr-2 text-right font-medium normal-case tracking-normal text-slate-500`}
                style={{ top: headerOffsets[1], position: 'sticky', width: 296, minWidth: 296 }}
              >
                Highest possible score
              </th>
              {columnGroups.map(({ component, items, percentage, highestPossible }, groupIndex) => {
                const palette = paletteFor(groupIndex)
                return (
                  <React.Fragment key={component.id}>
                    {items.map((item, index) => (
                      <th
                        key={item.id}
                        className={`${headerCell} ${palette.hps} ${index === 0 ? palette.edge : ''} z-30 font-normal tabular-nums`}
                        style={{ top: headerOffsets[1], position: 'sticky' }}
                      >
                        {toNumber(item.score)}
                      </th>
                    ))}
                    <th
                      className={`${headerCell} ${palette.hps} ${items.length === 0 ? palette.edge : ''} z-30 tabular-nums`}
                      style={{ top: headerOffsets[1], position: 'sticky' }}
                    >
                      {highestPossible}
                    </th>
                    <th
                      className={`${headerCell} ${palette.hps} z-30 tabular-nums`}
                      style={{ top: headerOffsets[1], position: 'sticky' }}
                    >
                      100
                    </th>
                    <th
                      className={`${headerCell} ${palette.hps} z-30 tabular-nums`}
                      style={{ top: headerOffsets[1], position: 'sticky' }}
                    >
                      {percentage}%
                    </th>
                  </React.Fragment>
                )
              })}
              <th
                colSpan={3}
                className={`${headerCell} ${resultsEdge} z-30 bg-slate-100`}
                style={{ top: headerOffsets[1], position: 'sticky' }}
              />
            </tr>
          </thead>

          <tbody>
            {roster.length === 0 && (
              <tr>
                <td colSpan={totalColumns} className={`${cellBorder} p-8 text-center text-slate-500`}>
                  No learners in this section yet.
                </td>
              </tr>
            )}

            {roster.map((group) => (
              <React.Fragment key={group.key}>
                <tr>
                  {/*
                    Two cells rather than one: `position: sticky` on a div inside
                    a table cell is not reliable, so the label rides in a sticky
                    cell of its own, the way the name column does.
                  */}
                  <td
                    colSpan={2}
                    className={`${cellBorder} ${nameEdge} sticky left-0 z-20 bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600`}
                  >
                    {group.label}
                    <span className="ml-1.5 font-medium text-slate-400 tabular-nums">
                      {group.students.length}
                    </span>
                  </td>
                  <td colSpan={totalColumns - 2} className={`${cellBorder} bg-slate-100`} />
                </tr>

                {group.students.map((student, rowIndex) => {
                  const row = computed[student.id]
                  const draftDirty = isTermDraftDirty(student.id)
                  const termValue = termGradeValue(student.id)
                  const termNumber = termValue === '' ? null : Number(termValue)
                  const letter = mapScoreToLabel(termNumber, gradingBands)
                  // The two frozen columns need a solid colour of their own:
                  // inheriting the row's would let the scores show through them.
                  const zebra = rowIndex % 2 === 1 ? 'bg-slate-50' : 'bg-white'
                  // Every cell that paints its own background has to answer the
                  // row hover too, or the highlight stops at the first tinted one.
                  const hover = 'group-hover/row:bg-primary-50'

                  return (
                    <tr key={student.id} className={`group/row ${zebra} hover:bg-primary-50`}>
                      <td
                        className={`${cellBorder} ${stickyIndex} ${zebra} ${hover} z-20 px-1 text-center text-slate-400 tabular-nums`}
                      >
                        {rowIndex + 1}
                      </td>
                      <td
                        className={`${cellBorder} ${stickyName} ${nameEdge} ${zebra} ${hover} z-20 max-w-64 truncate px-2 py-1 font-medium uppercase tracking-tight text-slate-900`}
                        title={formatName(student)}
                      >
                        {formatName(student)}
                      </td>

                      {columnGroups.map(({ component, items }, groupIndex) => {
                        const totals = row?.groups[groupIndex]
                        const palette = paletteFor(groupIndex)
                        return (
                          <React.Fragment key={component.id}>
                            {items.map((item, index) => {
                              // Enter walks down the same column to the next learner,
                              // across the male/female break as the eye does.
                              const position = orderedStudentIds.indexOf(student.id)
                              const nextStudentId =
                                position >= 0 && position + 1 < orderedStudentIds.length
                                  ? orderedStudentIds[position + 1]
                                  : null
                              return (
                                <td
                                  key={item.id}
                                  className={`${cellBorder} ${index === 0 ? palette.edge : ''} p-0`}
                                >
                                  <ScoreCell
                                    cellId={cellIdFor(student.id, item.id)}
                                    nextCellId={
                                      nextStudentId ? cellIdFor(nextStudentId, item.id) : null
                                    }
                                    studentId={student.id}
                                    itemId={item.id}
                                    maxScore={toNumber(item.score)}
                                    entry={scoresByKey[scoreKey(student.id, item.id)]}
                                    onSaved={handleScoreSaved}
                                  />
                                </td>
                              )
                            })}
                            <td
                              className={`${cellBorder} ${palette.roll} ${hover} ${items.length === 0 ? palette.edge : ''} px-1 text-center font-semibold text-slate-800 tabular-nums`}
                            >
                              {/* A 0 would read as a zero score; this component has no items yet. */}
                              {totals && items.length > 0 ? totals.earned : '—'}
                            </td>
                            <td
                              className={`${cellBorder} ${palette.roll} ${hover} px-1 text-center text-slate-500 tabular-nums`}
                            >
                              {decimals(totals?.ps ?? null)}
                            </td>
                            <td
                              className={`${cellBorder} ${palette.roll} ${hover} px-1 text-center font-medium text-slate-800 tabular-nums`}
                            >
                              {decimals(totals?.ws ?? null)}
                            </td>
                          </React.Fragment>
                        )
                      })}

                      <td
                        className={`${cellBorder} ${resultsEdge} ${hover} px-1 text-center text-sm font-semibold tabular-nums ${gradeTone(row?.initial ?? null)}`}
                      >
                        {decimals(row?.initial ?? null)}
                      </td>
                      <td className={`${cellBorder} p-0`}>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={100}
                          value={termValue}
                          placeholder="·"
                          onChange={(event) =>
                            setTermDrafts((previous) => ({
                              ...previous,
                              [student.id]: event.target.value,
                            }))
                          }
                          onFocus={(event) => event.currentTarget.select()}
                          className={`h-8 w-full rounded-none border-0 bg-transparent px-1 text-center text-sm font-bold tabular-nums transition-colors placeholder:text-base placeholder:font-normal placeholder:text-gray-300 hover:bg-white hover:ring-1 hover:ring-inset hover:ring-primary-300 focus:z-10 focus:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                            draftDirty
                              ? 'bg-amber-50 text-amber-900 ring-2 ring-inset ring-amber-400'
                              : gradeTone(termNumber)
                          }`}
                        />
                      </td>
                      <td className={`${cellBorder} ${hover} px-2 py-1 text-center`}>
                        <span
                          className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${descriptorTone(termNumber)}`}
                        >
                          {letter ? `${letter} · ` : ''}
                          {describe(termNumber)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-700">PS</span> is the percentage score for a
        component — what the learner earned over the highest possible.{' '}
        <span className="font-semibold text-slate-700">WS</span> is that percentage carrying the
        component&apos;s weight. The{' '}
        <span className="font-semibold text-slate-700">Initial Grade</span> is the sum of the
        weighted scores; the <span className="font-semibold text-slate-700">Term Grade</span> is the
        grade you apply, and it is what the report card prints.
      </p>
    </div>
  )
}
