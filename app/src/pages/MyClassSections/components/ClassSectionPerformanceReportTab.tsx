import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Info } from 'lucide-react'

import { Select } from '../../../components/select'
import { Autocomplete } from '../../../components/autocomplete'
import DepedPerformanceReportCard from '../../../components/depedPerformanceReport/DepedPerformanceReportCard'
import { useGradingPeriodsForYear } from '../../../hooks/useGradingPeriods'
import { staffService } from '../../../services/staffService'
import type { Student, User, UserInstitution } from '../../../types'

interface Props {
  classSectionId: string
  institutionId: string
  academicYear: string
  students: Student[]
  getFullName: (student: Student) => string
}

const formatPersonName = (user: Partial<User> | null | undefined) => {
  const first = (user?.first_name || '').trim()
  const last = (user?.last_name || '').trim()
  const middle = (user?.middle_name || '').trim()
  const ext = (user?.ext_name || '').trim()
  const mi = middle ? `${middle.charAt(0)}.` : ''
  const base = [first, mi, last].filter(Boolean).join(' ')
  return (ext ? `${base} ${ext}` : base).trim().toUpperCase()
}

/**
 * The DepEd Performance Report, one learner at a time.
 *
 * This is the second report card a Grade 2 to 10 section can print, not a
 * replacement for the first: the Report Cards tab beside this one keeps printing
 * the DO 8, s. 2015 form for as long as a school wants it. Which one a parent is
 * handed is the school's call.
 *
 * One learner previews at a time, deliberately. Rendering a PDF happens in the
 * browser and a 50-learner section is 50 documents — the same reason the MATATAG
 * reports panel previews one and downloads the rest.
 */
export function ClassSectionPerformanceReportTab({
  classSectionId,
  institutionId,
  academicYear,
  students,
  getFullName,
}: Props) {
  const [studentId, setStudentId] = useState<string>('')
  const [schoolHeadId, setSchoolHeadId] = useState<string>('')

  /*
   * The whole form turns on this.
   *
   * Annex G is drawn with exactly three term columns, because DO 9, s. 2026
   * replaced the four-quarter calendar with three terms. A section whose year is
   * still recorded as four quarters cannot be printed on it without either
   * dropping the fourth quarter or inventing a column, so it is not printed at
   * all and the tab says why. Silently rendering three of four quarters onto a
   * card a parent keeps is the one outcome worth refusing.
   */
  const gradingPeriods = useGradingPeriodsForYear(academicYear)
  const isTermBased = gradingPeriods.count === 3

  const orderedStudents = useMemo(
    () =>
      [...(students || [])].sort((a, b) =>
        getFullName(a).localeCompare(getFullName(b), undefined, { sensitivity: 'base' })
      ),
    [students, getFullName]
  )

  useEffect(() => {
    if (!studentId && orderedStudents.length > 0) {
      setStudentId(orderedStudents[0].id)
    }
  }, [orderedStudents, studentId])

  // Same source and filter the existing report-card modal uses for its
  // principal picker, so both cards name the same person.
  const { data: staffsResponse } = useQuery({
    queryKey: ['staffs', { purpose: 'report-card-principals' }],
    queryFn: () => staffService.getStaffs({ limit: 200 }),
    enabled: isTermBased,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const schoolHeads = useMemo(() => {
    const staffs = (staffsResponse?.data || []) as User[]
    const isPrincipal = (user: User) =>
      user?.role?.slug === 'principal' ||
      (Array.isArray(user?.user_institutions) &&
        user.user_institutions.some((ui: UserInstitution) => ui?.role?.slug === 'principal'))

    return staffs.filter(isPrincipal).sort((a, b) =>
      (a.last_name || '').localeCompare(b.last_name || '') ||
      (a.first_name || '').localeCompare(b.first_name || '')
    )
  }, [staffsResponse?.data])

  const schoolHeadName = useMemo(
    () => formatPersonName(schoolHeads.find((head) => head.id === schoolHeadId) || null),
    [schoolHeads, schoolHeadId]
  )

  /*
   * react-pdf v4 mis-renders on incremental prop updates, so the viewer is
   * remounted on anything that changes the document rather than updated in
   * place — the same trick `StudentReportCardModal` and the MATATAG reports
   * panel use, for the same bug.
   */
  const selectedLearnerOption = useMemo(() => {
    const student = orderedStudents.find((candidate) => candidate.id === studentId)
    return student ? { id: student.id, label: getFullName(student) } : null
  }, [orderedStudents, studentId, getFullName])

  const viewerKey = useMemo(
    () => `${studentId}|${classSectionId}|${institutionId}|${academicYear}|${schoolHeadId}`,
    [studentId, classSectionId, institutionId, academicYear, schoolHeadId]
  )

  if (!isTermBased) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-amber-900">
              This section's year is recorded as {gradingPeriods.count}{' '}
              {gradingPeriods.noun_plural.toLowerCase()}
            </h4>
            <p className="text-sm text-amber-800">
              DepEd's Performance Report has three term columns and no fourth. Printing{' '}
              {academicYear || 'this year'} on it would either drop the fourth quarter or leave a
              column that means nothing, so the form is held back rather than handed out wrong.
            </p>
            <p className="text-sm text-amber-800">
              Set the academic year to three terms to use it. The Report Cards tab beside this one
              prints the existing card for this section either way.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (orderedStudents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <p className="text-sm text-gray-600">
          There is nobody on this section's roster, so there is nothing to print.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-900">
          The Learner's Performance Report from DepEd Order 15, s. 2026. It reads the same term
          grades and attendance as the Report Cards tab — nothing here changes a mark — and the
          teacher's comment boxes print blank for the adviser to write in.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-gray-600">
          <span className="block mb-1">Learner</span>
          {/*
            * Type-to-search rather than a dropdown: a section runs to fifty
            * learners and scrolling to one by eye is the slow way to do it.
            *
            * `onChange` ignores a null, which is the one thing to keep. The
            * shared Autocomplete clears its selection as soon as the typed text
            * stops matching the chosen label, and taking that at face value
            * would blank the preview on the first keystroke of a new search.
            * The last real choice stands until another one is made.
            */}
          <Autocomplete
            immediate
            placeholder="Search a learner…"
            value={selectedLearnerOption}
            onChange={(option) => { if (option) setStudentId(option.id) }}
            options={orderedStudents.map((student) => ({
              id: student.id,
              label: getFullName(student),
            }))}
          />
        </label>

        <label className="block text-xs font-medium text-gray-600">
          <span className="block mb-1">School Head</span>
          <Select
            inputSize="sm"
            value={schoolHeadId}
            onChange={(event) => setSchoolHeadId(event.target.value)}
            options={[
              { value: '', label: 'Leave blank (sign by hand)' },
              ...schoolHeads.map((head) => ({ value: head.id, label: formatPersonName(head) })),
            ]}
          />
        </label>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white" style={{ height: '75vh' }}>
        <DepedPerformanceReportCard
          key={viewerKey}
          viewerKey={viewerKey}
          studentId={studentId}
          classSectionId={classSectionId}
          institutionId={institutionId}
          academicYear={academicYear}
          principalName={schoolHeadName}
          viewerHeight="100%"
        />
      </div>
    </div>
  )
}

export default ClassSectionPerformanceReportTab
