import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Select } from '../../../components/select'
import { useStudentStatistics } from '../../../hooks/useStudentReports'
import type { GenderTally } from '../../../types'

/**
 * Male and female are two categorical series, so they get fixed hues rather
 * than the app's `primary` — that one is re-generated per institution theme and
 * would repaint the split a different colour at every school. Both hues clear
 * the colourblind-separation and contrast checks against a white card. `other`
 * is the fold-to-Other bucket and stays neutral.
 */
const SERIES = {
  male: '#2a78d6',
  female: '#eb6834',
  other: '#6b7280',
} as const

const formatNumber = (n: number) => n.toLocaleString('en-PH')

const share = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0)

/**
 * The male/female split of one row, as a thin proportion bar.
 *
 * The counts sit in their own columns beside it, so the bar is a second reading
 * of numbers that are already on the page — colour never carries the only copy.
 */
const SplitBar: React.FC<{ tally: GenderTally; label: string }> = ({ tally, label }) => {
  if (tally.total === 0) {
    return <div className="h-2 rounded-full bg-gray-100" aria-hidden="true" />
  }

  const segments = (['male', 'female', 'other'] as const)
    .map((key) => ({ key, value: tally[key] }))
    .filter((segment) => segment.value > 0)

  return (
    <div className="flex h-2 gap-[2px] rounded-full overflow-hidden" role="img"
      aria-label={`${label}: ${formatNumber(tally.male)} male, ${formatNumber(tally.female)} female${
        tally.other > 0 ? `, ${formatNumber(tally.other)} other` : ''
      }`}
    >
      {segments.map((segment) => (
        <div
          key={segment.key}
          style={{
            width: `${(segment.value / tally.total) * 100}%`,
            backgroundColor: SERIES[segment.key],
          }}
          title={`${segment.key === 'male' ? 'Male' : segment.key === 'female' ? 'Female' : 'Other'}: ${formatNumber(
            segment.value
          )} of ${formatNumber(tally.total)} (${share(segment.value, tally.total)}%)`}
        />
      ))}
    </div>
  )
}

const Swatch: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
    <span
      className="w-2.5 h-2.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
    {children}
  </span>
)

const StatTile: React.FC<{ label: string; value: string; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4">
    <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
  </div>
)

export const StudentStatisticsTab: React.FC = () => {
  const [academicYear, setAcademicYear] = useState('')
  const { statistics, loading, fetching } = useStudentStatistics(academicYear || undefined)

  const totals = statistics?.totals
  const showOther = Boolean(
    statistics &&
      (statistics.totals.other > 0 ||
        statistics.unassigned.other > 0 ||
        statistics.by_section.some((row) => row.other > 0))
  )

  const numericColumns = showOther ? 4 : 3

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Enrolment statistics</h2>
            <p className="mt-1 text-sm text-gray-600">
              Male and female headcounts for every section and grade level in the school year.
            </p>
          </div>

          <div className="w-full sm:w-48">
            <label
              htmlFor="stats-academic-year"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              School year
            </label>
            <Select
              id="stats-academic-year"
              inputSize="sm"
              value={academicYear || statistics?.academic_year || ''}
              onChange={(event) => setAcademicYear(event.target.value)}
              options={(statistics?.academic_years ?? []).map((year) => ({
                value: year,
                label: year,
              }))}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center text-sm text-gray-500">
          Loading statistics…
        </div>
      ) : !statistics || !totals ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-12 text-center text-sm text-gray-500">
          No statistics available.
        </div>
      ) : (
        <div className={`space-y-6 ${fetching ? 'opacity-60' : ''}`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Students in sections"
              value={formatNumber(totals.total)}
              hint={`School year ${statistics.academic_year}`}
            />
            <StatTile
              label="Male"
              value={formatNumber(totals.male)}
              hint={`${share(totals.male, totals.total)}% of enrolment`}
            />
            <StatTile
              label="Female"
              value={formatNumber(totals.female)}
              hint={`${share(totals.female, totals.total)}% of enrolment`}
            />
            <StatTile
              label="Sections"
              value={formatNumber(statistics.by_section.length)}
              hint={`Across ${formatNumber(statistics.by_grade_level.length)} grade level${
                statistics.by_grade_level.length === 1 ? '' : 's'
              }`}
            />
          </div>

          {statistics.unassigned.total > 0 && (
            <div className="rounded-xl border border-warning-200 bg-warning-50 px-5 py-4">
              <p className="text-sm font-medium text-warning-900">
                {formatNumber(statistics.unassigned.total)} student
                {statistics.unassigned.total === 1 ? ' is' : 's are'} not in any section for{' '}
                {statistics.academic_year}
              </p>
              <p className="mt-0.5 text-sm text-warning-800">
                {formatNumber(statistics.unassigned.male)} male,{' '}
                {formatNumber(statistics.unassigned.female)} female
                {statistics.unassigned.other > 0
                  ? `, ${formatNumber(statistics.unassigned.other)} other`
                  : ''}
                . They are counted nowhere in the tables below.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <Swatch color={SERIES.male}>Male</Swatch>
            <Swatch color={SERIES.female}>Female</Swatch>
            {showOther && <Swatch color={SERIES.other}>Other</Swatch>}
          </div>

          {/* By grade level */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">By grade level</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Grade level
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Sections
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Male
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Female
                    </th>
                    {showOther && (
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Other
                      </th>
                    )}
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-40">
                      Split
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {statistics.by_grade_level.length === 0 ? (
                    <tr>
                      <td
                        colSpan={numericColumns + 3}
                        className="px-6 py-8 text-center text-sm text-gray-500"
                      >
                        No sections for this school year.
                      </td>
                    </tr>
                  ) : (
                    statistics.by_grade_level.map((row) => (
                      <tr key={row.grade_level} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm font-medium text-gray-900">
                          {row.grade_level}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">
                          {formatNumber(row.sections)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums">
                          {formatNumber(row.male)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums">
                          {formatNumber(row.female)}
                        </td>
                        {showOther && (
                          <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums">
                            {formatNumber(row.other)}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                          {formatNumber(row.total)}
                        </td>
                        <td className="px-6 py-3">
                          <SplitBar tally={row} label={row.grade_level} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {statistics.by_grade_level.length > 0 && (
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td className="px-6 py-3 text-sm font-semibold text-gray-900">All grades</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">
                        {formatNumber(statistics.by_section.length)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                        {formatNumber(totals.male)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                        {formatNumber(totals.female)}
                      </td>
                      {showOther && (
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                          {formatNumber(totals.other)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                        {formatNumber(totals.total)}
                      </td>
                      <td className="px-6 py-3">
                        <SplitBar tally={totals} label="All grades" />
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* By section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">By section</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Section
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Grade level
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Adviser
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Male
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Female
                    </th>
                    {showOther && (
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Other
                      </th>
                    )}
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-40">
                      Split
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {statistics.by_section.length === 0 ? (
                    <tr>
                      <td
                        colSpan={numericColumns + 4}
                        className="px-6 py-8 text-center text-sm text-gray-500"
                      >
                        No sections for this school year.
                      </td>
                    </tr>
                  ) : (
                    statistics.by_section.map((row) => (
                      <tr key={row.section_id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm font-medium text-gray-900">
                          {row.section || 'Untitled section'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.grade_level || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{row.adviser || '—'}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums">
                          {formatNumber(row.male)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums">
                          {formatNumber(row.female)}
                        </td>
                        {showOther && (
                          <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums">
                            {formatNumber(row.other)}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                          {formatNumber(row.total)}
                        </td>
                        <td className="px-6 py-3">
                          <SplitBar tally={row} label={row.section || 'Untitled section'} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {statistics.by_section.length > 0 && (
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td
                        className="px-6 py-3 text-sm font-semibold text-gray-900"
                        colSpan={3}
                      >
                        All sections
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                        {formatNumber(totals.male)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                        {formatNumber(totals.female)}
                      </td>
                      {showOther && (
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                          {formatNumber(totals.other)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                        {formatNumber(totals.total)}
                      </td>
                      <td className="px-6 py-3">
                        <SplitBar tally={totals} label="All sections" />
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
