import React, { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { financeDashboardService } from '../../services/financeDashboardService'
import { studentFinanceService } from '../../services/studentFinanceService'
import type { FinanceDashboardStudent, LedgerFeeBreakdown } from '../../types'

interface DashboardStudentsViewProps {
  academicYearOptions: { value: string; label: string }[]
  defaultAcademicYear: string
}

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount ?? 0))

/**
 * Every enrolled student for the academic year, grouped by grade level and alphabetical
 * within it, with what the year bills them and what is still owed. Opening a row shows
 * the fees charged to that student alone — ad-hoc charges, cash-basis fees and late fees.
 */
const DashboardStudentsView: React.FC<DashboardStudentsViewProps> = ({
  academicYearOptions,
  defaultAcademicYear,
}) => {
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear)
  const [gradeFilter, setGradeFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [openStudentId, setOpenStudentId] = useState<string | null>(null)

  const studentsQuery = useQuery({
    queryKey: ['finance-dashboard', 'students', academicYear, gradeFilter, sectionFilter],
    queryFn: () =>
      financeDashboardService.getStudentBalances({
        academic_year: academicYear,
        grade_level: gradeFilter || undefined,
        section_id: sectionFilter || undefined,
      }),
    enabled: Boolean(academicYear),
  })

  const data = studentsQuery.data?.data
  const students = useMemo(() => data?.students ?? [], [data?.students])
  const sections = useMemo(() => data?.sections ?? [], [data?.sections])

  const gradeOptions = useMemo(
    () => [
      { value: '', label: 'All grade levels' },
      ...(data?.grade_levels ?? []).map((grade) => ({ value: grade, label: grade })),
    ],
    [data?.grade_levels]
  )

  // Only the sections of the chosen grade level are offerable — a section belongs to one
  // grade, so leaving the rest listed would only offer combinations with no students.
  const sectionOptions = useMemo(
    () => [
      { value: '', label: 'All sections' },
      ...sections
        .filter((section) => !gradeFilter || section.grade_level === gradeFilter)
        .map((section) => ({
          value: section.id,
          label: gradeFilter ? section.title : `${section.grade_level} — ${section.title}`,
        })),
    ],
    [sections, gradeFilter]
  )

  // A section filter left over from another grade level would show an empty list, so the
  // grade level clears it whenever the two no longer agree.
  useEffect(() => {
    if (!sectionFilter || !gradeFilter) return
    const section = sections.find((option) => option.id === sectionFilter)
    if (section && section.grade_level !== gradeFilter) {
      setSectionFilter('')
    }
  }, [gradeFilter, sectionFilter, sections])

  const visibleStudents = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/[\s,]+/).filter(Boolean)
    if (!terms.length) return students
    // Every word typed has to appear somewhere in the name or LRN, in any order, so both
    // "juan dela cruz" and "dela cruz juan" find the same student.
    return students.filter((student) => {
      const haystack = [
        student.first_name,
        student.middle_name,
        student.last_name,
        student.ext_name,
        student.lrn,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
  }, [students, search])

  const groups = useMemo(() => {
    const byGrade: { grade_level: string; students: FinanceDashboardStudent[] }[] = []
    for (const student of visibleStudents) {
      // The API already returns the rows in grade order, so a run of the same grade level
      // is one group and the order of the groups needs no sorting of its own.
      const current = byGrade[byGrade.length - 1]
      if (current && current.grade_level === student.grade_level) {
        current.students.push(student)
      } else {
        byGrade.push({ grade_level: student.grade_level, students: [student] })
      }
    }
    return byGrade
  }, [visibleStudents])

  const totals = useMemo(
    () =>
      visibleStudents.reduce(
        (acc, student) => ({
          payable: acc.payable + student.total_payable,
          balance: acc.balance + student.remaining_balance,
        }),
        { payable: 0, balance: 0 }
      ),
    [visibleStudents]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Students Per Grade Level</h2>
          <p className="text-sm text-gray-600">
            Total payable and remaining balance for every enrolled student. Select a student to
            see the fees charged to them.
          </p>
        </div>
        <div className="w-full lg:w-64">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Academic year
          </label>
          <Select
            value={academicYear}
            onChange={(event) => setAcademicYear(event.target.value)}
            options={academicYearOptions}
            className="w-full"
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Search student
              </label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Last name, first name or LRN"
                leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Grade level
              </label>
              <Select
                value={gradeFilter}
                onChange={(event) => setGradeFilter(event.target.value)}
                options={gradeOptions}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Section
              </label>
              <Select
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value)}
                options={sectionOptions}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {studentsQuery.isLoading ? (
          <div className="p-8 text-center text-gray-500">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600 mb-2" />
            <p>Loading students…</p>
          </div>
        ) : studentsQuery.isError ? (
          <p className="p-8 text-center text-red-600">
            Failed to load students for this academic year.
          </p>
        ) : !visibleStudents.length ? (
          <p className="p-8 text-center text-gray-500">
            {students.length
              ? 'No student matches your search.'
              : 'No students are enrolled for this academic year.'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 border-b border-gray-200 text-sm">
              <span className="text-gray-600">
                <span className="font-semibold text-gray-900">{visibleStudents.length}</span>{' '}
                student{visibleStudents.length === 1 ? '' : 's'}
              </span>
              <span className="text-gray-600">
                Total payable{' '}
                <span className="font-semibold text-gray-900">{formatCurrency(totals.payable)}</span>
              </span>
              <span className="text-gray-600">
                Remaining balance{' '}
                <span className="font-semibold text-gray-900">{formatCurrency(totals.balance)}</span>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Student
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      LRN
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Section
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Total Payable
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Remaining Balance
                    </th>
                  </tr>
                </thead>
                {groups.map((group) => (
                  <tbody key={group.grade_level} className="divide-y divide-gray-200">
                    <tr className="bg-gray-100/70">
                      <th
                        colSpan={5}
                        scope="colgroup"
                        className="px-4 py-2 text-left text-sm font-semibold text-gray-900"
                      >
                        {group.grade_level}
                        <span className="ml-2 font-normal text-gray-500">
                          ({group.students.length} student{group.students.length === 1 ? '' : 's'})
                        </span>
                      </th>
                    </tr>
                    {group.students.map((student) => {
                      const isOpen = openStudentId === student.id
                      return (
                        <React.Fragment key={student.id}>
                          <tr
                            role="button"
                            tabIndex={0}
                            aria-expanded={isOpen}
                            onClick={() => setOpenStudentId(isOpen ? null : student.id)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return
                              event.preventDefault()
                              setOpenStudentId(isOpen ? null : student.id)
                            }}
                            className={`cursor-pointer transition-colors ${
                              isOpen ? 'bg-primary-50/60' : 'hover:bg-gray-50'
                            }`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                                <ChevronRightIcon
                                  className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                                    isOpen ? 'rotate-90' : ''
                                  }`}
                                  aria-hidden="true"
                                />
                                <span className="uppercase">{student.display_name}</span>
                                {student.other_fee_count > 0 && (
                                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-normal text-gray-600">
                                    {student.other_fee_count} other fee
                                    {student.other_fee_count === 1 ? '' : 's'}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {student.lrn || '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {student.section || '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-900">
                              {formatCurrency(student.total_payable)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right text-sm font-semibold ${
                                student.remaining_balance > 0 ? 'text-red-600' : 'text-green-700'
                              }`}
                            >
                              {formatCurrency(student.remaining_balance)}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={5} className="bg-gray-50 px-4 py-4">
                                <StudentOtherFees
                                  student={student}
                                  academicYear={academicYear}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Total payable is the year's charges plus any balance forward, less discounts. Remaining
        balance is what is left of it after payments.
      </p>
    </div>
  )
}

/**
 * The fees charged to one student on top of their grade's standard fees: ad-hoc charges,
 * cash-basis fees and late fees. Read from the student's ledger so the amounts match what
 * the cashier sees there.
 */
const StudentOtherFees: React.FC<{
  student: FinanceDashboardStudent
  academicYear: string
}> = ({ student, academicYear }) => {
  const ledgerQuery = useQuery({
    queryKey: ['student-ledger', student.id, academicYear],
    queryFn: () => studentFinanceService.getLedger(student.id, academicYear),
  })

  const breakdown: LedgerFeeBreakdown[] = ledgerQuery.data?.data?.fee_breakdown ?? []
  const otherFees = breakdown.filter((fee) => fee.is_additional)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Charges" value={student.charges} />
        <SummaryTile label="Discounts" value={student.discounts} />
        <SummaryTile label="Balance Forward" value={student.balance_forward} />
        <SummaryTile label="Total Paid" value={student.total_paid} />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Other Fees</h4>
        {ledgerQuery.isLoading ? (
          <p className="text-sm text-gray-500">Loading fees…</p>
        ) : ledgerQuery.isError ? (
          <p className="text-sm text-red-600">Failed to load this student's fees.</p>
        ) : !otherFees.length ? (
          <p className="text-sm text-gray-500">
            No other fees charged to this student for {academicYear}.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Fee
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Charge
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Discount
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Paid
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Outstanding
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {otherFees.map((fee) => (
                  <tr key={fee.fee_id}>
                    <td className="px-3 py-2 text-sm text-gray-900">{fee.fee_name}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">
                      {fee.source === 'late_fee'
                        ? 'Late fee'
                        : fee.billing_type === 'installment'
                          ? 'Installment plan'
                          : 'Cash basis'}
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-gray-900">
                      {formatCurrency(fee.charge)}
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-gray-600">
                      {formatCurrency(fee.discount)}
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-gray-600">
                      {formatCurrency(fee.paid)}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                      {formatCurrency(fee.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const SummaryTile: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
    <p className="text-xs text-gray-500">{label}</p>
    <p className="text-sm font-semibold text-gray-900">{formatCurrency(value)}</p>
  </div>
)

export default DashboardStudentsView
