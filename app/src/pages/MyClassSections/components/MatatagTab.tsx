import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw, Contrast } from 'lucide-react'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import {
  useMatatagAttendance,
  useMatatagGrid,
  useMatatagGridSave,
  useMatatagReference,
  useMatatagSectionMutations,
  useMatatagSections,
} from '../../../hooks/useMatatag'
import { usePermissions } from '../../../hooks/usePermissions'
import type { MatatagGridColumn } from '../../../types'
import { MatatagGrid } from './MatatagGrid'
import { MatatagNarrativesPanel } from './MatatagNarrativesPanel'
import { MatatagAttendancePanel } from './MatatagAttendancePanel'
import { MatatagReportsPanel } from './MatatagReportsPanel'

const HIGH_CONTRAST_KEY = 'matatag.highContrast'

interface Props {
  classSectionId: string
  gradeLevel: string
  academicYear?: string
  institutionId?: string
}

type Panel = 'grid' | 'narratives' | 'attendance' | 'reports'

/**
 * The adviser's MATATAG workspace: one tab in the class-section screen they
 * already live in, rather than a separate module they have to go and find.
 *
 * A Grade 1 classroom is self-contained — one adviser teaches all five
 * learning areas — so this is where the whole record is kept, and the three
 * panels below are the three things that make up a progress report.
 */
export function MatatagTab({ classSectionId, gradeLevel, academicYear, institutionId }: Props) {
  const { can } = usePermissions()
  const [panel, setPanel] = useState<Panel>('grid')
  const [areaId, setAreaId] = useState<string | undefined>(undefined)
  const [term, setTerm] = useState(1)
  const [activeColumn, setActiveColumn] = useState<MatatagGridColumn | null>(null)
  const [highContrast, setHighContrast] = useState(false)

  const { data: reference } = useMatatagReference()
  const { data: sectionList, isLoading: sectionsLoading } = useMatatagSections({
    institutionId,
    academicYear,
  })
  const { optIn, optOut } = useMatatagSectionMutations(institutionId, academicYear)

  const status = useMemo(
    () => sectionList?.sections.find(s => s.id === classSectionId),
    [sectionList, classSectionId]
  )

  const optedIn = Boolean(status?.opted_in)

  const grid = useMatatagGrid({
    sectionId: classSectionId,
    learningAreaId: areaId,
    term,
    academicYear,
    // Also loaded for the Reports panel, which needs the roster and the
    // catalog's areas to fill its two selectors. In practice this is already
    // cached — an adviser reaches Reports by way of the grid — and it is one
    // request either way.
    enabled: optedIn && (panel === 'grid' || panel === 'reports'),
  })

  const save = useMatatagGridSave({
    sectionId: classSectionId,
    learningAreaId: areaId,
    term,
    academicYear,
  })

  const attendance = useMatatagAttendance({
    sectionId: classSectionId,
    academicYear,
    enabled: optedIn && panel === 'attendance',
  })

  // A per-viewer convenience, so wrapped: some browsers throw on access
  // outright rather than returning null.
  useEffect(() => {
    try {
      setHighContrast(window.localStorage.getItem(HIGH_CONTRAST_KEY) === '1')
    } catch {
      /* storage unavailable; the default is fine */
    }
  }, [])

  const toggleContrast = () => {
    setHighContrast(current => {
      const next = !current
      try {
        window.localStorage.setItem(HIGH_CONTRAST_KEY, next ? '1' : '0')
      } catch {
        /* nothing to do; the toggle still works for this session */
      }
      return next
    })
  }

  // Switching area or term changes which cells the pending batch belongs to,
  // so anything typed is written before the grid underneath it changes.
  useEffect(() => () => void save.flush(), [areaId, term]) // eslint-disable-line react-hooks/exhaustive-deps

  if (sectionsLoading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  if (!optedIn) {
    return <OptInPrompt
      status={status}
      gradeLevel={gradeLevel}
      canSetUp={can('matatag-grading', 'set-up')}
      isPending={optIn.isPending}
      onOptIn={() => optIn.mutate({ sectionId: classSectionId })}
    />
  }

  const data = grid.data

  const areaOptions = (data?.learning_areas ?? []).map(area => ({
    value: area.id,
    label: area.title,
  }))

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">MATATAG Progress</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {status?.curriculum_version?.title}
            {status?.curriculum_version
              ? ` · ${status.curriculum_version.competency_count} competencies, ${status.curriculum_version.slot_count} marks a year`
              : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {can('matatag-grading', 'set-up') && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => optOut.mutate(classSectionId)}
              disabled={optOut.isPending}
            >
              Switch off MATATAG
            </Button>
          )}
        </div>
      </header>

      <nav className="flex gap-1 border-b border-gray-200">
        {([
          ['grid', 'Competencies'],
          ['narratives', 'Narratives'],
          ['attendance', 'Attendance'],
          ['reports', 'Report cards'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPanel(key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              panel === key
                ? 'border-primary-500 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-primary-600'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {panel === 'grid' && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-gray-600">
              <span className="block mb-1">Learning area</span>
              <div className="min-w-[220px]">
                <Select
                  inputSize="sm"
                  value={areaId ?? data?.learning_area.id ?? ''}
                  onChange={event => setAreaId(event.target.value || undefined)}
                  options={areaOptions}
                />
              </div>
            </label>

            <label className="text-xs font-medium text-gray-600">
              <span className="block mb-1">Term</span>
              <div className="min-w-[150px]">
                <Select
                  inputSize="sm"
                  value={String(term)}
                  onChange={event => setTerm(Number(event.target.value))}
                  options={(reference?.terms ?? []).map(t => ({
                    value: String(t.value),
                    // Say how many competencies the term holds, so nobody opens
                    // an empty one and assumes something is broken.
                    label: data?.slot_counts_by_term
                      ? `${t.label} (${data.slot_counts_by_term[String(t.value)] ?? 0})`
                      : t.label,
                  }))}
                />
              </div>
            </label>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleContrast}
              className="mb-0.5"
              leftIcon={<Contrast className="w-4 h-4" />}
            >
              {highContrast ? 'Show macro-skill colours' : 'High contrast'}
            </Button>

            <div className="ml-auto mb-1">
              <SaveChip state={save.state} onRetry={save.retry} />
            </div>
          </div>

          {data && (
            <>
              <p className="text-xs text-gray-500">
                {data.counts.columns} competenc{data.counts.columns === 1 ? 'y' : 'ies'} ·{' '}
                {data.counts.learners} learner{data.counts.learners === 1 ? '' : 's'} ·{' '}
                {data.counts.recorded} recorded
                {data.learning_area.uses_macro_skills && reference?.macro_skills ? (
                  <span className="ml-2">
                    {reference.macro_skills
                      .filter(s => s.abbr)
                      .map(s => `${s.abbr} = ${s.label}`)
                      .join(' · ')}
                  </span>
                ) : null}
              </p>

              <InspectorStrip column={activeColumn} />
            </>
          )}

          {grid.isLoading && (
            <div className="flex items-center gap-2 py-12 justify-center text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading the competency grid…</span>
            </div>
          )}

          {grid.isError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Could not load the grid.{' '}
              <button type="button" className="underline" onClick={() => grid.refetch()}>
                Try again
              </button>
            </div>
          )}

          {data && reference && (
            <MatatagGrid
              grid={data}
              descriptors={reference.descriptors}
              macroSkills={reference.macro_skills}
              failedKeys={save.failedKeys}
              highContrast={highContrast}
              readOnly={!data.can_manage}
              onSet={save.setDescriptor}
              onActiveColumnChange={setActiveColumn}
            />
          )}

          {data?.can_manage && (
            <p className="text-[11px] text-gray-500">
              Click a cell, then press <kbd className="px-1 border rounded">A</kbd>–
              <kbd className="px-1 border rounded">E</kbd> to mark and move down.{' '}
              <kbd className="px-1 border rounded">Space</kbd> clears.{' '}
              <kbd className="px-1 border rounded">Ctrl</kbd>+
              <kbd className="px-1 border rounded">D</kbd> fills the rest of the column.
            </p>
          )}
        </>
      )}

      {panel === 'narratives' && (
        <MatatagNarrativesPanel
          classSectionId={classSectionId}
          academicYear={academicYear}
          terms={reference?.terms ?? []}
        />
      )}

      {panel === 'attendance' && (
        <MatatagAttendancePanel
          data={attendance.data}
          isLoading={attendance.isLoading}
          learners={grid.data?.learners}
        />
      )}

      {panel === 'reports' &&
        (grid.isLoading || !data ? (
          <div className="flex items-center gap-2 py-12 justify-center text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading the roster…</span>
          </div>
        ) : (
          <MatatagReportsPanel
            classSectionId={classSectionId}
            sectionTitle={data.section.title}
            academicYear={academicYear}
            learners={data.learners}
            learningAreas={data.learning_areas}
          />
        ))}
    </div>
  )
}

/**
 * What a section sees before anyone has switched it onto MATATAG.
 *
 * The Grades 2 and 3 case is the one worth being careful about: their
 * catalogs do not exist yet, and saying so plainly is better than a button
 * that fails.
 */
function OptInPrompt({
  status,
  gradeLevel,
  canSetUp,
  isPending,
  onOptIn,
}: {
  status?: { available_curriculum_version: { title: string; slot_count: number } | null }
  gradeLevel: string
  canSetUp: boolean
  isPending: boolean
  onOptIn: () => void
}) {
  const available = status?.available_curriculum_version

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
      <h3 className="text-base font-semibold text-gray-900">
        This section is not reporting on MATATAG
      </h3>

      {available ? (
        <>
          <p className="mt-2 text-sm text-gray-600 max-w-xl mx-auto">
            Switching it on records a letter descriptor A–E against each of DepEd's{' '}
            {available.slot_count} learning competencies, three times a year, instead of numeric
            quarterly grades. Nothing changes for any other section.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Catalog: {available.title}. A section stays on one catalog for the whole year.
          </p>

          {canSetUp ? (
            <Button type="button" color="primary" className="mt-4" onClick={onOptIn} disabled={isPending}>
              {isPending ? 'Switching on…' : 'Switch this section onto MATATAG'}
            </Button>
          ) : (
            <p className="mt-4 text-xs text-gray-500">
              Ask a principal or administrator to switch it on — it decides how the whole year is
              reported, so it is kept apart from marking.
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-gray-600 max-w-xl mx-auto">
          DepEd has not published a MATATAG competency catalog for {gradeLevel} yet, so there is
          nothing for this section to report against. It arrives as a data file — nothing here needs
          rebuilding when it does.
        </p>
      )}
    </div>
  )
}

/**
 * The full competency text for whichever cell is focused.
 *
 * The grid's header cannot carry it — the official entry sheet's heading is a
 * number and a letter, and ~200 characters will not fit above a one-letter
 * cell — but a teacher marking a competency has to be able to read it.
 */
function InspectorStrip({ column }: { column: MatatagGridColumn | null }) {
  if (!column) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400">
        Select a cell to read the competency it marks.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-primary-200 bg-primary-50/60 px-3 py-2">
      <p className="text-xs text-gray-900">
        <span className="font-semibold">
          {column.parent_label ? `${column.parent_label}${column.label}` : column.label}.
        </span>{' '}
        {column.parent_text && <span className="text-gray-600">{column.parent_text} </span>}
        {column.text}
      </p>
      {column.performance_standard && (
        <p className="mt-1 text-[11px] text-gray-600 italic">{column.performance_standard}</p>
      )}
      {column.extra &&
        Object.entries(column.extra).map(([label, value]) => (
          <p key={label} className="mt-1 text-[11px] text-gray-600">
            <span className="font-medium">{label}:</span> {value}
          </p>
        ))}
    </div>
  )
}

/** One status chip, rather than a toast per keystroke. */
function SaveChip({
  state,
  onRetry,
}: {
  state: ReturnType<typeof useMatatagGridSave>['state']
  onRetry: () => void
}) {
  if (state.status === 'idle') return null

  if (state.status === 'failed') {
    return (
      <div className="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900">
        <CloudOff className="w-3.5 h-3.5" />
        <span>{state.message}</span>
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    )
  }

  const label =
    state.status === 'saving'
      ? `Saving ${state.count}…`
      : state.status === 'pending'
        ? `${state.count} unsaved`
        : 'Saved'

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
      {state.status === 'saving' ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : state.status === 'saved' ? (
        <Check className="w-3.5 h-3.5 text-green-600" />
      ) : (
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
      )}
      <span>{label}</span>
    </div>
  )
}
