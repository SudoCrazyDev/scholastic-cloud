import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import { useMatatagNarrativeMutations, useMatatagNarratives } from '../../../hooks/useMatatag'
import type { MatatagNarrativeWrite, MatatagTermDefinition } from '../../../types'

interface Props {
  classSectionId: string
  academicYear?: string
  terms: MatatagTermDefinition[]
}

/**
 * The two paragraphs that are the progress report card.
 *
 * Everything else on the card is derived — attendance from the school's own
 * records, the legend from config — and the competency grid prints on the
 * attached PACE forms. This is what a parent sits down and reads.
 *
 * One term at a time, every learner on screen, because an adviser writes these
 * in a sitting.
 */
export function MatatagNarrativesPanel({ classSectionId, academicYear, terms }: Props) {
  const [term, setTerm] = useState(1)
  const [drafts, setDrafts] = useState<Record<string, { can_do: string; to_improve: string }>>({})

  const { data, isLoading } = useMatatagNarratives({ sectionId: classSectionId, academicYear })
  const save = useMatatagNarrativeMutations({ sectionId: classSectionId, academicYear })

  // Drafts are seeded from the server once per (term, payload) and then owned
  // by the textarea. Seeding on every render would fight the typist.
  useEffect(() => {
    if (!data) return

    const next: Record<string, { can_do: string; to_improve: string }> = {}

    data.learners.forEach(learner => {
      const stored = data.narratives[`${learner.student_id}:${term}`]
      next[learner.student_id] = {
        can_do: stored?.can_do ?? '',
        to_improve: stored?.to_improve ?? '',
      }
    })

    setDrafts(next)
  }, [data, term])

  const dirty = useMemo(() => {
    if (!data) return [] as MatatagNarrativeWrite[]

    return data.learners
      .filter(learner => {
        const stored = data.narratives[`${learner.student_id}:${term}`]
        const draft = drafts[learner.student_id]
        if (!draft) return false

        return (
          draft.can_do !== (stored?.can_do ?? '') || draft.to_improve !== (stored?.to_improve ?? '')
        )
      })
      .map(learner => ({
        student_id: learner.student_id,
        term,
        can_do: drafts[learner.student_id].can_do.trim() || null,
        to_improve: drafts[learner.student_id].to_improve.trim() || null,
      }))
  }, [data, drafts, term])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading narratives…</span>
      </div>
    )
  }

  if (!data) return null

  const readOnly = !data.can_manage

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-gray-600">
          <span className="block mb-1">Term</span>
          <div className="min-w-[150px]">
            <Select
              inputSize="sm"
              value={String(term)}
              onChange={event => setTerm(Number(event.target.value))}
              options={terms.map(t => ({ value: String(t.value), label: t.label }))}
            />
          </div>
        </label>

        <div className="ml-auto flex items-center gap-3">
          {dirty.length > 0 && (
            <span className="text-xs text-amber-700">{dirty.length} unsaved</span>
          )}
          <Button
            type="button"
            color="primary"
            disabled={readOnly || dirty.length === 0 || save.isPending}
            onClick={() => save.mutate(dirty)}
          >
            {save.isPending ? 'Saving…' : 'Save narratives'}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {data.learners.map(learner => {
          const draft = drafts[learner.student_id] ?? { can_do: '', to_improve: '' }

          return (
            <div key={learner.student_id} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm font-semibold text-gray-900 mb-3">{learner.name}</p>

              <div className="grid gap-4 md:grid-cols-2">
                <NarrativeField
                  label="What Your Child Can Do"
                  filipino="Mga Nagagawa"
                  value={draft.can_do}
                  maxLength={data.max_length}
                  readOnly={readOnly}
                  onChange={value =>
                    setDrafts(current => ({
                      ...current,
                      [learner.student_id]: { ...draft, can_do: value },
                    }))
                  }
                />

                <NarrativeField
                  label="What Your Child Is Learning To Improve"
                  filipino="Dapat Linangin"
                  value={draft.to_improve}
                  maxLength={data.max_length}
                  readOnly={readOnly}
                  onChange={value =>
                    setDrafts(current => ({
                      ...current,
                      [learner.student_id]: { ...draft, to_improve: value },
                    }))
                  }
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * A capped field with a live counter.
 *
 * The cap is not arbitrary fussiness: DepEd's box is a fixed size, and there
 * is no correct way to render 2,000 characters into it — shrink it until it is
 * unreadable, clip it, or spill onto a page nobody expects. A limit the
 * teacher can watch approaching is the only one of the three they can do
 * anything about.
 */
function NarrativeField({
  label,
  filipino,
  value,
  maxLength,
  readOnly,
  onChange,
}: {
  label: string
  filipino: string
  value: string
  maxLength: number
  readOnly: boolean
  onChange: (value: string) => void
}) {
  const remaining = maxLength - value.length
  const tight = remaining <= 60

  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-700">
        {label} <span className="text-gray-400 font-normal">({filipino})</span>
      </span>
      <textarea
        rows={4}
        value={value}
        maxLength={maxLength}
        readOnly={readOnly}
        onChange={event => onChange(event.target.value)}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 disabled:bg-gray-50"
      />
      <span className={`mt-1 block text-[11px] ${tight ? 'text-amber-700' : 'text-gray-400'}`}>
        {remaining} character{remaining === 1 ? '' : 's'} left
      </span>
    </label>
  )
}
