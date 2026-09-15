import { AlertTriangle, Loader2 } from 'lucide-react'
import { learnerListName } from './matatagRoster'
import type { MatatagLearner, MatatagSectionAttendance } from '../../../types'

interface Props {
  data?: MatatagSectionAttendance
  isLoading: boolean
  learners?: MatatagLearner[]
}

/**
 * The attendance block of the progress report, read-only.
 *
 * There is no entry screen here, deliberately: the school already records
 * monthly attendance and class days elsewhere, and a second place to type the
 * same figures is a second set of figures that disagree with the first. If a
 * number here is wrong, it is wrong on the attendance screen that owns it.
 */
export function MatatagAttendancePanel({ data, isLoading, learners }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Working out attendance…</span>
      </div>
    )
  }

  if (!data) return null

  const nameFor = (studentId: string) => {
    const learner = learners?.find(l => l.student_id === studentId)

    return learner ? learnerListName(learner) : studentId
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Derived from the attendance and class days this school already records. Nothing on this
        screen writes. September counts once, wholly in Term 1 — DepEd's form splits it across two
        terms, which monthly totals cannot reproduce without guessing.
      </p>

      {data.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="w-4 h-4" />
            Some months are recorded more than once
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-800 list-disc list-inside">
            {data.warnings.map((warning, index) => (
              <li key={index}>
                {nameFor(warning.student_id)}: {warning.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-auto border border-gray-200 rounded-xl bg-white max-h-[60vh]">
        <table className="border-collapse text-xs w-full">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 bg-gray-50 border border-gray-200 px-3 py-2 text-left min-w-[180px]">
                Learner
              </th>
              {data.months.map(month => (
                <th
                  key={`${month.year}-${month.month}`}
                  className="sticky top-0 z-20 bg-gray-50 border border-gray-200 px-2 py-2 text-center whitespace-nowrap"
                >
                  <span className="block font-semibold text-gray-700">{month.label.slice(0, 3)}</span>
                  <span className="block text-[10px] font-normal text-gray-400">
                    T{month.term} · {month.class_days}d
                  </span>
                </th>
              ))}
              <th className="sticky top-0 z-20 bg-gray-100 border border-gray-200 px-2 py-2 text-center">
                Present
              </th>
              <th className="sticky top-0 z-20 bg-gray-100 border border-gray-200 px-2 py-2 text-center">
                Absent
              </th>
            </tr>
          </thead>
          <tbody>
            {data.learners.map((learner, index) => {
              const present = learner.months.reduce((sum, m) => sum + m.days_present, 0)
              const absent = learner.months.reduce((sum, m) => sum + m.days_absent, 0)

              return (
                <tr key={learner.student_id} className={index % 2 ? 'bg-gray-50/60' : 'bg-white'}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 border border-gray-200 px-3 py-1.5 text-left font-medium text-gray-800 whitespace-nowrap ${
                      index % 2 ? 'bg-gray-50' : 'bg-white'
                    }`}
                  >
                    {nameFor(learner.student_id)}
                  </th>

                  {learner.months.map(month => (
                    <td
                      key={`${month.year}-${month.month}`}
                      className="border border-gray-200 px-2 py-1.5 text-center text-gray-800"
                      title={`${month.days_present} present, ${month.days_absent} absent of ${month.class_days} class days`}
                    >
                      {month.days_present}
                      {month.days_absent > 0 && (
                        <span className="text-red-600">/{month.days_absent}</span>
                      )}
                    </td>
                  ))}

                  <td className="border border-gray-200 bg-gray-50 px-2 py-1.5 text-center font-semibold">
                    {present}
                  </td>
                  <td className="border border-gray-200 bg-gray-50 px-2 py-1.5 text-center font-semibold">
                    {absent}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400">
        Each cell reads days present, then days absent in red where there are any.
      </p>
    </div>
  )
}
