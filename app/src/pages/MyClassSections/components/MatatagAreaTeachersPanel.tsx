import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import {
  useMatatagLearningAreaTeacherMutations,
  useMatatagLearningAreaTeachers,
} from '../../../hooks/useMatatag'

interface Props {
  classSectionId: string
  academicYear?: string
  canManage: boolean
}

const ADVISER_ONLY = ''

/**
 * Which of the section's subjects stands for each learning area.
 *
 * Linking an area to a subject lets that subject's teacher mark the area from
 * their own subject page. The adviser keeps every area either way — this adds
 * a second pair of hands, it does not hand the record over.
 */
export function MatatagAreaTeachersPanel({ classSectionId, academicYear, canManage }: Props) {
  const { data, isLoading, isError, refetch } = useMatatagLearningAreaTeachers({
    sectionId: classSectionId,
    academicYear,
  })
  const { save } = useMatatagLearningAreaTeacherMutations({ sectionId: classSectionId, academicYear })

  // Area id -> chosen subject id ('' for the adviser alone).
  const [choices, setChoices] = useState<Record<string, string>>({})

  const saved = useMemo(
    () =>
      Object.fromEntries(
        (data?.areas ?? []).map(row => [row.learning_area.id, row.subject?.id ?? ADVISER_ONLY])
      ),
    [data]
  )

  useEffect(() => setChoices(saved), [saved])

  const dirty = Object.keys(saved).some(areaId => (choices[areaId] ?? ADVISER_ONLY) !== saved[areaId])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Could not load the learning-area teachers.{' '}
        <button type="button" className="underline" onClick={() => refetch()}>
          Try again
        </button>
      </div>
    )
  }

  const subjectsById = Object.fromEntries(data.subjects.map(subject => [subject.id, subject]))

  const options = [
    { value: ADVISER_ONLY, label: 'Adviser only' },
    ...data.subjects.map(subject => ({
      value: subject.id,
      label: subject.teacher ? `${subject.title} — ${subject.teacher.name}` : `${subject.title} — no teacher`,
    })),
  ]

  const handleSave = () =>
    save.mutate(
      data.areas.map(row => ({
        learning_area_id: row.learning_area.id,
        subject_id: choices[row.learning_area.id] || null,
      }))
    )

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 max-w-3xl">
        Link each learning area to the subject that teaches it. That subject's teacher can then mark
        the area's competencies from their own subject page, under <strong>MATATAG Progress</strong>.
        You keep every area, the narratives and the report cards. Whoever teaches the subject can
        mark, so changing a subject's teacher also changes who marks the area.
      </p>

      <div className="overflow-hidden rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Learning area</th>
              <th className="px-4 py-2">Subject</th>
              <th className="px-4 py-2">Marked by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {data.areas.map(row => {
              const areaId = row.learning_area.id
              const chosen = choices[areaId] ?? ADVISER_ONLY
              const subject = chosen ? subjectsById[chosen] : undefined
              const suggestion =
                !chosen && row.suggested_subject_id ? subjectsById[row.suggested_subject_id] : undefined

              return (
                <tr key={areaId}>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.learning_area.title}</td>
                  <td className="px-4 py-3">
                    <div className="min-w-[260px] max-w-sm">
                      <Select
                        inputSize="sm"
                        value={chosen}
                        disabled={!canManage}
                        onChange={event =>
                          setChoices(current => ({ ...current, [areaId]: event.target.value }))
                        }
                        options={options}
                      />
                    </div>
                    {suggestion && canManage && (
                      <button
                        type="button"
                        className="mt-1 text-xs text-primary-600 underline"
                        onClick={() => setChoices(current => ({ ...current, [areaId]: suggestion.id }))}
                      >
                        Use {suggestion.title}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {subject?.teacher ? `${subject.teacher.name} and the adviser` : 'The adviser'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {data.subjects.length === 0 && (
        <p className="text-xs text-gray-500">
          This section has no subjects yet. Add them on the Subjects tab, then link them here.
        </p>
      )}

      {canManage && (
        <div className="flex justify-end">
          <Button type="button" color="primary" onClick={handleSave} disabled={!dirty || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  )
}
