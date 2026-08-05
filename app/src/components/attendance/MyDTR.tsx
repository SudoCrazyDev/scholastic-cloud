import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, Clock, RefreshCw } from 'lucide-react'
import { Button } from '../button'
import { Select } from '../select'
import FileAttendanceRequestModal, { type AttendanceRequestPrefill } from './FileAttendanceRequestModal'
import { myTimesheetService } from '../../services/myTimesheetService'
import { shortDate, time12 } from '../../pages/HRIS/Payroll/helpers'
import type { AttendanceRequestKind, TimesheetDay, TimesheetIssue } from '../../types'

/** How many past years the year filter reaches back. */
const YEARS_BACK = 2

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const ISSUE_META: Record<TimesheetIssue, { label: string; chip: string; kind: AttendanceRequestKind }> = {
  no_punch: { label: 'No punch', chip: 'bg-red-100 text-red-700', kind: 'forgot_punch' },
  missing_out: { label: 'Missing punch out', chip: 'bg-red-100 text-red-700', kind: 'forgot_punch' },
  late: { label: 'Late', chip: 'bg-amber-100 text-amber-700', kind: 'late_arrival' },
  undertime: { label: 'Undertime', chip: 'bg-amber-100 text-amber-700', kind: 'early_out' },
}

const REQUEST_STATUS_CHIP: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  approved: 'bg-green-50 text-green-700 ring-1 ring-green-200',
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

/** The whole selected month, as the two dates the timesheet endpoint takes. */
const monthRange = (year: number, month: number): { from: string; to: string } => ({
  from: `${year}-${pad2(month)}-01`,
  // Day 0 of the next month is the last day of this one, so February needs no
  // leap-year special case.
  to: `${year}-${pad2(month)}-${pad2(new Date(year, month, 0).getDate())}`,
})

const issueLabel = (day: TimesheetDay): string => {
  if (!day.issue) return ''
  if (day.issue === 'undertime') return `Undertime ${day.undertime_minutes}m`
  if (day.issue === 'late') {
    // A day can be both, and each costs its own minutes — naming only the
    // late arrival would understate what the day is short by.
    return day.undertime_minutes > 0
      ? `Late ${day.late_minutes}m · Undertime ${day.undertime_minutes}m`
      : `Late ${day.late_minutes}m`
  }
  return ISSUE_META[day.issue].label
}

/**
 * Everything the request form can be filled in with from the day itself.
 * A missing punch is credited from the schedule, since that is what the staff
 * member was expected to work — the reason is the only thing left to write.
 */
const prefillFor = (day: TimesheetDay): AttendanceRequestPrefill => {
  const dates = { date_from: day.date, date_to: day.date }

  switch (day.issue) {
    case 'no_punch':
      return { ...dates, kind: 'forgot_punch', credited_time_in: day.schedule_start, credited_time_out: day.schedule_end }
    case 'missing_out':
      // The punch that exists is kept — payroll never overwrites a real one.
      return { ...dates, kind: 'forgot_punch', credited_time_in: day.time_in, credited_time_out: day.schedule_end }
    case 'late':
      return { ...dates, kind: 'late_arrival' }
    case 'undertime':
      return { ...dates, kind: 'early_out' }
    default:
      return { ...dates, kind: 'forgot_punch' }
  }
}

const dayLabel = (day: TimesheetDay): string =>
  day.is_today ? 'Today' : `${day.weekday}, ${shortDate(day.date).replace(/, \d{4}$/, '')}`

const TimeCell: React.FC<{ time: string | null; credited: boolean }> = ({ time, credited }) => {
  if (!time) return <span className="text-gray-300">— —</span>

  return (
    <span className={credited ? 'text-gray-500 italic' : 'text-gray-800'} title={credited ? 'Credited by an approved request' : undefined}>
      {time12(time)}
    </span>
  )
}

/**
 * The staff member's own daily time record for a whole month at a time, so a
 * punch the biometric never recorded is found while there is still time to file
 * for it — and filed straight from the row it was found on.
 *
 * The filter is deliberately month-and-year only: a DTR is read a month at a
 * time, the same period payroll pays on.
 */
const MyDTR: React.FC = () => {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [filing, setFiling] = useState<TimesheetDay | null>(null)

  const yearOptions = useMemo(
    () =>
      Array.from({ length: YEARS_BACK + 1 }, (_, index) => {
        const value = currentYear - index
        return { value: String(value), label: String(value) }
      }),
    [currentYear]
  )

  // A month that has not happened yet has nothing to show, so it is not offered
  // — the endpoint would answer with today's date under next month's heading.
  const monthOptions = useMemo(() => {
    const lastMonth = year === currentYear ? currentMonth : 12
    return MONTH_NAMES.slice(0, lastMonth).map((label, index) => ({
      value: String(index + 1),
      label,
    }))
  }, [year, currentYear, currentMonth])

  const handleYearChange = (nextYear: number) => {
    setYear(nextYear)
    // Rolling back to the current year from a past one can leave the month
    // pointing at a month that has not arrived yet.
    if (nextYear === currentYear && month > currentMonth) {
      setMonth(currentMonth)
    }
  }

  const range = monthRange(year, month)

  const timesheetQuery = useQuery({
    // Prefixed with 'my-timesheet' so filing a request still invalidates it.
    queryKey: ['my-timesheet', range.from, range.to],
    queryFn: () => myTimesheetService.get(range),
  })

  const timesheet = timesheetQuery.data?.data

  // A rest day nobody punched on is not worth a row; one that was worked is.
  const days = useMemo(
    () => (timesheet?.days ?? []).filter((day) => !day.is_rest_day || day.punch_count > 0),
    [timesheet]
  )

  const issueCount = days.filter((day) => day.issue && !day.request).length

  // Punches that stopped arriving read exactly like a week of absences, so
  // say the logs are behind rather than let anyone file against a sync gap.
  const staleSince = useMemo(() => {
    if (!timesheet) return null
    const lastWorkday = [...days].reverse().find((day) => !day.is_today && !day.is_rest_day && !day.is_holiday)
    if (!lastWorkday) return null
    if (timesheet.last_attendance_date && timesheet.last_attendance_date >= lastWorkday.date) return null
    return timesheet.last_attendance_date
  }, [timesheet, days])

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="inline-flex items-center gap-2 text-base font-semibold text-gray-900">
            <Clock className="h-5 w-5 text-primary-600" /> My DTR
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {issueCount > 0
              ? `${issueCount} day${issueCount === 1 ? '' : 's'} payroll would not pay in full — file a request to fix it.`
              : `Your biometric punches for ${MONTH_NAMES[month - 1]} ${year}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            aria-label="Month"
            inputSize="sm"
            className="w-36"
            options={monthOptions}
            value={String(month)}
            onChange={(event) => setMonth(Number(event.target.value))}
          />
          <Select
            aria-label="Year"
            inputSize="sm"
            className="w-24"
            options={yearOptions}
            value={String(year)}
            onChange={(event) => handleYearChange(Number(event.target.value))}
          />
          <button
            type="button"
            onClick={() => timesheetQuery.refetch()}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${timesheetQuery.isFetching ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/hris/attendance-requests"
            className="inline-flex shrink-0 items-center text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            My requests <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {staleSince && (
        <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            The biometric has only reported punches through {shortDate(staleSince)}. Later days may be
            waiting on the device rather than actually missed.
          </span>
        </div>
      )}

      {timesheetQuery.isLoading ? (
        <div className="p-6 text-center text-sm text-gray-500">Loading your DTR…</div>
      ) : days.length === 0 ? (
        <div className="p-8 text-center">
          <Clock className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">
            No punches recorded for {MONTH_NAMES[month - 1]} {year}.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-5 py-2">Day</th>
                <th className="px-3 py-2">Time In</th>
                <th className="px-3 py-2">Time Out</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {days.map((day) => (
                <tr key={day.date} className={day.issue && !day.request ? 'bg-red-50/30' : undefined}>
                  <td className="px-5 py-2.5">
                    <div className="font-medium text-gray-800">{dayLabel(day)}</div>
                    {day.schedule_start && day.schedule_end && (
                      <div className="text-[11px] text-gray-400">
                        {time12(day.schedule_start)} – {time12(day.schedule_end)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    <TimeCell time={day.time_in} credited={day.credited_time_in} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    <TimeCell time={day.time_out} credited={day.credited_time_out} />
                  </td>
                  <td className="px-3 py-2.5">
                    {day.issue ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${ISSUE_META[day.issue].chip}`}
                      >
                        {issueLabel(day)}
                      </span>
                    ) : day.is_rest_day ? (
                      <span className="text-[11px] text-gray-400">Rest day</span>
                    ) : day.is_holiday ? (
                      <span className="text-[11px] text-gray-400">Holiday</span>
                    ) : day.is_today ? (
                      <span className="text-[11px] text-gray-400">In progress</span>
                    ) : (
                      <span className="text-[11px] text-green-600">Complete</span>
                    )}
                    {day.exception_label && (
                      <div className="text-[11px] text-gray-400">{day.exception_label}</div>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    {day.request ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          REQUEST_STATUS_CHIP[day.request.status] || 'bg-gray-50 text-gray-500'
                        }`}
                      >
                        {day.request.status === 'pending' ? 'Request pending' : 'Request approved'}
                      </span>
                    ) : day.issue ? (
                      <Button size="sm" variant="outline" onClick={() => setFiling(day)}>
                        Request Fix
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filing && (
        // Keyed on the date so each row opens the form filled in for its own day.
        <FileAttendanceRequestModal
          key={filing.date}
          prefill={prefillFor(filing)}
          onClose={() => setFiling(null)}
        />
      )}
    </div>
  )
}

export default MyDTR
