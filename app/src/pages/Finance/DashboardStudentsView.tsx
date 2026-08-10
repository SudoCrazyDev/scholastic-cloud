import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

  // Column totals for whatever is on screen. The same disassembly as the rows, so the strip
  // adds up the same way: school fees + student fees + balance forward = total payable.
  const totals = useMemo(
    () =>
      visibleStudents.reduce(
        (acc, student) => ({
          schoolFees: acc.schoolFees + student.school_fees_payable,
          studentFees: acc.studentFees + student.student_fees_payable,
          balanceForward: acc.balanceForward + student.balance_forward,
          payable: acc.payable + student.total_payable,
          balance: acc.balance + student.remaining_balance,
        }),
        { schoolFees: 0, studentFees: 0, balanceForward: 0, payable: 0, balance: 0 }
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
                School fees{' '}
                <span className="font-semibold text-gray-900">
                  {formatCurrency(totals.schoolFees)}
                </span>
              </span>
              <span className="text-gray-600">
                Student fees{' '}
                <span className="font-semibold text-gray-900">
                  {formatCurrency(totals.studentFees)}
                </span>
              </span>
              {totals.balanceForward !== 0 && (
                <span className="text-gray-600">
                  Balance forward{' '}
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(totals.balanceForward)}
                  </span>
                </span>
              )}
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
                {/* Two header rows: Total Payable spans the three parts it is made of plus
                    its own total, so the row can be read across and seen to add up. */}
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      rowSpan={2}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase align-bottom"
                    >
                      Student
                    </th>
                    <th
                      rowSpan={2}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase align-bottom"
                    >
                      LRN
                    </th>
                    <th
                      rowSpan={2}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase align-bottom"
                    >
                      Section
                    </th>
                    <th
                      colSpan={4}
                      scope="colgroup"
                      className="border-x border-gray-200 px-4 pt-3 pb-1 text-center text-xs font-semibold text-gray-500 uppercase"
                    >
                      Total Payable
                    </th>
                    <th
                      rowSpan={2}
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase align-bottom"
                    >
                      Remaining Balance
                    </th>
                  </tr>
                  <tr>
                    <th className="border-l border-gray-200 px-4 pb-3 text-right text-xs font-medium text-gray-500 uppercase">
                      School Fees
                    </th>
                    <th className="px-4 pb-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Student Fees
                    </th>
                    <th className="px-4 pb-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Balance Forward
                    </th>
                    <th className="border-r border-gray-200 px-4 pb-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Total
                    </th>
                  </tr>
                </thead>
                {groups.map((group) => (
                  <tbody key={group.grade_level} className="divide-y divide-gray-200">
                    <tr className="bg-gray-100/70">
                      <th
                        colSpan={8}
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
                            <td className="border-l border-gray-200 px-4 py-3 text-right text-sm text-gray-600">
                              {formatCurrency(student.school_fees_payable)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-600">
                              {formatCurrency(student.student_fees_payable)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right text-sm ${
                                student.balance_forward !== 0
                                  ? 'font-medium text-amber-700'
                                  : 'text-gray-400'
                              }`}
                            >
                              {formatCurrency(student.balance_forward)}
                            </td>
                            <td className="border-r border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">
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
                              <td colSpan={8} className="bg-gray-50 px-4 py-4">
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
        Total payable is made of school fees (the grade's fee amounts, less every discount —
        discounts are only ever priced against these), student fees (charges added to that
        student alone), and any balance forward from earlier years. Remaining balance is what is
        left of the total after payments. A late fee is charged when a student's ledger is
        opened, so a surcharge that has only just fallen due joins their row as you select them.
      </p>
    </div>
  )
}

/**
 * One student's charges as their own ledger reports them: the five tiles and the fees charged
 * to them alone — ad-hoc charges, cash-basis fees and late fees.
 *
 * Every figure here is read from the ledger response rather than from the list row, so the
 * tiles and the fee table below them can never disagree. They can differ from the row: loading
 * a ledger *books* any late fee that has just fallen due, which the listing deliberately does
 * not do (see FinanceDashboardController::students). Opening a student is therefore what
 * charges their surcharge, and the row that sent us here is a moment out of date — so when the
 * two disagree the list is refetched and catches up.
 */
const StudentOtherFees: React.FC<{
  student: FinanceDashboardStudent
  academicYear: string
}> = ({ student, academicYear }) => {
  const queryClient = useQueryClient()
  const ledgerQuery = useQuery({
    queryKey: ['student-ledger', student.id, academicYear],
    queryFn: () => studentFinanceService.getLedger(student.id, academicYear),
  })

  const ledger = ledgerQuery.data?.data
  const breakdown: LedgerFeeBreakdown[] = ledger?.fee_breakdown ?? []
  const otherFees = breakdown.filter((fee) => fee.is_additional)

  const sumCharges = (fees: LedgerFeeBreakdown[]) =>
    fees.reduce((total, fee) => total + fee.charge, 0)

  const studentFeesCharged = ledger ? sumCharges(otherFees) : student.student_fees
  const schoolFeesCharged = ledger
    ? sumCharges(breakdown.filter((fee) => !fee.is_additional))
    : student.school_fees

  // Refetch the list once when the ledger turns out to know about charges the row did not —
  // a late fee this very load booked. Guarded to one attempt per student so a discrepancy
  // that cannot resolve costs a single wasted fetch instead of looping.
  const healedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!ledger) return
    const key = `${student.id}:${academicYear}`
    if (healedRef.current === key) return
    if (Math.abs(studentFeesCharged - student.student_fees) < 0.005) return
    healedRef.current = key
    queryClient.invalidateQueries({ queryKey: ['finance-dashboard', 'students'] })
  }, [ledger, studentFeesCharged, student.id, student.student_fees, academicYear, queryClient])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryTile label="School Fees Charged" value={schoolFeesCharged} />
        <SummaryTile label="Student Fees Charged" value={studentFeesCharged} />
        <SummaryTile label="Discounts" value={ledger?.totals?.discounts ?? student.discounts} />
        <SummaryTile
          label="Balance Forward"
          value={ledger?.totals?.balance_forward ?? student.balance_forward}
        />
        <SummaryTile label="Total Paid" value={ledger?.totals?.payments ?? student.total_paid} />
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
