import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { PrinterIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Checkbox } from '../../../components/checkbox'
import { Select } from '../../../components/select'
import { useStudentRoster, useStudentStatistics } from '../../../hooks/useStudentReports'
import type { StudentRosterGroupBy, StudentRosterSort } from '../../../types'
import { formatNumber, openPrintDocument } from './printSupport'
import { buildRosterPrintHtml } from './studentRosterPrint'
import { buildEnrolmentSummary, buildEnrolmentSummaryPrintHtml } from './studentEnrolmentSummary'

/**
 * `section` and `grade_level` print one class list per group; `summary` prints
 * the whole school on a single page and takes no selection or ordering.
 */
type PrintMode = StudentRosterGroupBy | 'summary'

interface PrintTarget {
  /** `section_id` when printing by section, the grade level's title otherwise. */
  key: string
  label: string
  /** Only set when printing by section — the grade level it sits under. */
  gradeLevel: string | null
  detail: string | null
  male: number
  female: number
  other: number
  total: number
}

export const StudentPrintingTab: React.FC = () => {
  const [academicYear, setAcademicYear] = useState('')
  const [mode, setMode] = useState<PrintMode>('section')
  const [sort, setSort] = useState<StudentRosterSort>('gender')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  const { statistics, loading, fetching } = useStudentStatistics(academicYear || undefined)
  const roster = useStudentRoster()

  const groupBy: StudentRosterGroupBy = mode === 'summary' ? 'section' : mode

  const targets = useMemo<PrintTarget[]>(() => {
    if (!statistics || mode === 'summary') return []

    if (mode === 'section') {
      return statistics.by_section.map((row) => ({
        key: row.section_id,
        label: row.section || 'Untitled section',
        gradeLevel: row.grade_level,
        detail: row.adviser ? `Adviser: ${row.adviser}` : 'No adviser assigned',
        male: row.male,
        female: row.female,
        other: row.other,
        total: row.total,
      }))
    }

    return statistics.by_grade_level.map((row) => ({
      key: row.grade_level,
      label: row.grade_level,
      gradeLevel: null,
      detail: `${row.sections} section${row.sections === 1 ? '' : 's'}`,
      male: row.male,
      female: row.female,
      other: row.other,
      total: row.total,
    }))
  }, [statistics, mode])

  const summary = useMemo(
    () => (statistics ? buildEnrolmentSummary(statistics) : null),
    [statistics]
  )

  // Everything is ticked to start with, and a change of year or grouping
  // re-ticks: printing every class list is the common errand, and a stale
  // selection of section ids means nothing under the next year's sections.
  useEffect(() => {
    setSelectedKeys(targets.map((target) => target.key))
  }, [targets])

  const selectedTargets = targets.filter((target) => selectedKeys.includes(target.key))
  const selectedStudentCount = selectedTargets.reduce((sum, target) => sum + target.total, 0)
  const allSelected = targets.length > 0 && selectedKeys.length === targets.length

  const toggle = (key: string, checked: boolean) => {
    setSelectedKeys((keys) => (checked ? [...keys, key] : keys.filter((k) => k !== key)))
  }

  const handlePrintLists = async () => {
    if (selectedTargets.length === 0) return

    const keys = selectedTargets.map((target) => target.key)
    const result = await roster.mutateAsync({
      academic_year: statistics?.academic_year,
      group_by: groupBy,
      sort,
      section_ids: groupBy === 'section' ? keys : undefined,
      grade_levels: groupBy === 'grade_level' ? keys : undefined,
    })

    if (!result.data.groups.length) {
      toast.error('Nothing to print — the selected lists have no students.')
      return
    }

    if (!openPrintDocument(buildRosterPrintHtml(result.data))) {
      toast.error('Allow pop-ups for this site to print class lists.')
    }
  }

  /**
   * The summary is drawn from the statistics already on screen, so it needs no
   * request — what prints is exactly the table below it.
   */
  const handlePrintSummary = () => {
    if (!statistics) return

    if (!openPrintDocument(buildEnrolmentSummaryPrintHtml(statistics))) {
      toast.error('Allow pop-ups for this site to print the summary.')
    }
  }

  // Grouped under grade-level headings so a long list of sections stays
  // scannable; by grade level there is nothing to group by, so one flat list.
  const groupedTargets = useMemo(() => {
    if (groupBy !== 'section') return [{ heading: null as string | null, targets }]

    const headings: { heading: string | null; targets: PrintTarget[] }[] = []

    targets.forEach((target) => {
      const heading = target.gradeLevel || 'No grade level'
      const last = headings[headings.length - 1]

      if (last && last.heading === heading) {
        last.targets.push(target)
      } else {
        headings.push({ heading, targets: [target] })
      }
    })

    return headings
  }, [groupBy, targets])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          {mode === 'summary' ? 'Print the enrolment summary' : 'Print class lists'}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {mode === 'summary'
            ? 'Every section under its grade level on one page, with each level’s subtotal and the school’s grand total.'
            : 'Pick what to print and each section — or each whole grade level — comes out on its own page, with its male and female count at the foot of the list.'}
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="print-academic-year"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              School year
            </label>
            <Select
              id="print-academic-year"
              inputSize="sm"
              value={academicYear || statistics?.academic_year || ''}
              onChange={(event) => setAcademicYear(event.target.value)}
              options={(statistics?.academic_years ?? []).map((year) => ({
                value: year,
                label: year,
              }))}
            />
          </div>

          <div>
            <label htmlFor="print-mode" className="block text-sm font-medium text-gray-700 mb-1.5">
              Print
            </label>
            <Select
              id="print-mode"
              inputSize="sm"
              value={mode}
              onChange={(event) => setMode(event.target.value as PrintMode)}
              options={[
                { value: 'section', label: 'Class list per section' },
                { value: 'grade_level', label: 'Class list per grade level' },
                { value: 'summary', label: 'General enrolment summary' },
              ]}
            />
          </div>

          {/* Ordering is a property of a list of names, so it has no meaning
              for the summary, which prints no names. */}
          {mode !== 'summary' && (
            <div>
              <label htmlFor="print-sort" className="block text-sm font-medium text-gray-700 mb-1.5">
                Order
              </label>
              <Select
                id="print-sort"
                inputSize="sm"
                value={sort}
                onChange={(event) => setSort(event.target.value as StudentRosterSort)}
                options={[
                  { value: 'gender', label: 'Male first, then female (SF1)' },
                  { value: 'name', label: 'Alphabetical by surname' },
                ]}
              />
            </div>
          )}
        </div>
      </div>

      {mode !== 'summary' && (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {groupBy === 'section' ? 'Sections' : 'Grade levels'} to print
            </h3>
            <p className="text-sm text-gray-600">
              {selectedTargets.length} of {targets.length} selected ·{' '}
              {selectedStudentCount.toLocaleString('en-PH')} student
              {selectedStudentCount === 1 ? '' : 's'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={targets.length === 0}
              onClick={() =>
                setSelectedKeys(allSelected ? [] : targets.map((target) => target.key))
              }
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-primary-600 hover:bg-primary-700 text-white"
              disabled={selectedTargets.length === 0 || roster.isPending}
              onClick={handlePrintLists}
            >
              <PrinterIcon className="w-4 h-4 mr-2" />
              {roster.isPending ? 'Preparing…' : `Print ${selectedTargets.length || ''}`.trim()}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">Loading sections…</div>
        ) : targets.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-gray-900">Nothing to print yet</p>
            <p className="mt-1 text-sm text-gray-600">
              No sections exist for {statistics?.academic_year ?? 'this school year'}. Create
              sections and assign students to them first.
            </p>
          </div>
        ) : (
          <div className={`divide-y divide-gray-100 ${fetching ? 'opacity-60' : ''}`}>
            {groupedTargets.map(({ heading, targets: rows }) => (
              <div key={heading ?? 'all'}>
                {heading && (
                  <div className="px-6 py-2 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {heading}
                  </div>
                )}
                {rows.map((target) => (
                  <label
                    key={target.key}
                    className="flex items-center gap-3 px-6 py-3 cursor-pointer hover:bg-gray-50"
                  >
                    <Checkbox
                      checked={selectedKeys.includes(target.key)}
                      onChange={(checked) => toggle(target.key, checked)}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900 truncate">
                        {target.label}
                      </span>
                      {target.detail && (
                        <span className="block text-xs text-gray-500 truncate">{target.detail}</span>
                      )}
                    </span>
                    <span className="text-sm text-gray-600 tabular-nums whitespace-nowrap">
                      {target.male} M · {target.female} F
                      {target.other > 0 ? ` · ${target.other} other` : ''}
                    </span>
                    <span className="w-14 text-right text-sm font-semibold text-gray-900 tabular-nums">
                      {target.total}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {mode === 'summary' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Enrolment summary</h3>
              <p className="text-sm text-gray-600">
                This is what prints — one page, {formatNumber(summary?.levels.length ?? 0)} grade
                level
                {(summary?.levels.length ?? 0) === 1 ? '' : 's'},{' '}
                {formatNumber(statistics?.totals.total ?? 0)} student
                {(statistics?.totals.total ?? 0) === 1 ? '' : 's'}.
              </p>
            </div>

            <Button
              type="button"
              size="sm"
              className="bg-primary-600 hover:bg-primary-700 text-white"
              disabled={!summary || summary.levels.length === 0}
              onClick={handlePrintSummary}
            >
              <PrinterIcon className="w-4 h-4 mr-2" />
              Print summary
            </Button>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">Loading summary…</div>
          ) : !summary || summary.levels.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-gray-900">Nothing to summarise yet</p>
              <p className="mt-1 text-sm text-gray-600">
                No sections exist for {statistics?.academic_year ?? 'this school year'}.
              </p>
            </div>
          ) : (
            <div className={`overflow-x-auto ${fetching ? 'opacity-60' : ''}`}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Level', 'Section'].map((heading) => (
                      <th
                        key={heading}
                        className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                      >
                        {heading}
                      </th>
                    ))}
                    {['Male', 'Female', 'Total', 'Per level'].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                {/* One body per grade level, so the level and its subtotal can
                    span the block of sections they cover — the way the same
                    table reads with merged cells in a spreadsheet. */}
                {summary.levels.map((level) => (
                  <tbody key={level.level} className="divide-y divide-gray-100 border-t border-gray-200">
                    {level.sections.map((section, index) => (
                      <tr key={section.sectionId} className="hover:bg-gray-50">
                        {index === 0 && (
                          <td
                            rowSpan={level.sections.length}
                            className="px-6 py-3 align-middle text-sm font-semibold text-gray-900"
                          >
                            {level.level}
                          </td>
                        )}
                        <td className="px-6 py-3 text-sm text-gray-900">{section.section}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums">
                          {formatNumber(section.male)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums">
                          {formatNumber(section.female)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 tabular-nums">
                          {formatNumber(section.total)}
                        </td>
                        {index === 0 && (
                          <td
                            rowSpan={level.sections.length}
                            className="px-4 py-3 align-middle text-right text-sm font-semibold text-gray-900 tabular-nums bg-gray-50/60"
                          >
                            {formatNumber(level.total)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                ))}
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td className="px-6 py-3 text-sm font-semibold text-gray-900" colSpan={2}>
                      Grand total
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                      {formatNumber(summary.totals.male)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                      {formatNumber(summary.totals.female)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                      {formatNumber(summary.totals.total)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                      {formatNumber(summary.totals.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {statistics && statistics.unassigned.total > 0 && (
                <p className="px-6 py-3 text-sm text-gray-500 border-t border-gray-100">
                  Excludes {formatNumber(statistics.unassigned.total)} student
                  {statistics.unassigned.total === 1 ? '' : 's'} on the roll who{' '}
                  {statistics.unassigned.total === 1 ? 'is' : 'are'} not assigned to any section.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
