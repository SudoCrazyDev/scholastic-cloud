import type { MatatagLearner } from '../../../types'

/**
 * How a class is listed on a DepEd form.
 *
 * Two conventions, both of which a Grade 1 adviser has been following on paper
 * for years and will not thank us for breaking:
 *
 * 1. **Males first, then females**, alphabetical within each. The workbook
 *    this module exports to has two physically separate blocks of rows for
 *    exactly this, and the SF1 and the class record do the same.
 * 2. **`DELA CRUZ JR., JUAN M.`** — surname first, in capitals. Reading down
 *    fifty names for one learner only works if the part you are scanning for
 *    is the part that is aligned.
 *
 * The API already sorts and formats this way. This module exists because the
 * grouping must be recomputed on the client anyway: the row order the teacher
 * *sees* is the order that fill-down, paste and the arrow keys have to follow,
 * so the two cannot be allowed to drift apart if a `gender` ever arrives
 * spelled in a way the server's `ORDER BY` did not anticipate.
 */

export type LearnerGroupKey = 'male' | 'female' | 'unspecified'

export interface LearnerGroup {
  key: LearnerGroupKey
  label: string
  learners: MatatagLearner[]
}

/**
 * `gender` is a free-text column across this platform's history, so it holds
 * `Male`, `male`, `M` and the occasional empty string. Matching on the first
 * letter covers every spelling actually in the data without pretending the
 * column is an enum.
 */
function groupKeyFor(gender: string | null | undefined): LearnerGroupKey {
  const value = (gender ?? '').trim().toLowerCase()

  if (value.startsWith('m')) return 'male'
  if (value.startsWith('f')) return 'female'

  return 'unspecified'
}

const GROUP_LABELS: Record<LearnerGroupKey, string> = {
  male: 'Male',
  female: 'Female',
  // Named rather than hidden: a learner with no recorded gender still has to
  // be marked, and silently dropping them from the grid would be the worst
  // possible way to find out the field was blank.
  unspecified: 'Gender not recorded',
}

/** Males, then females, then anyone whose gender is not on file. */
const GROUP_ORDER: LearnerGroupKey[] = ['male', 'female', 'unspecified']

/**
 * `DELA CRUZ JR., JUAN M.`, falling back through what the payload actually
 * carries — the report endpoints send only the prose `name`.
 */
export function learnerListName(learner: MatatagLearner): string {
  if (learner.display_name) return learner.display_name

  const last = (learner.last_name ?? '').trim()
  const first = (learner.first_name ?? '').trim()

  if (last !== '' && first !== '') return `${last}, ${first}`.toUpperCase()

  return (last !== '' ? last : first !== '' ? first : learner.name).toUpperCase()
}

/** Empty groups are dropped, so an all-female section shows one band, not two. */
export function groupLearnersByGender(learners: MatatagLearner[]): LearnerGroup[] {
  const buckets: Record<LearnerGroupKey, MatatagLearner[]> = {
    male: [],
    female: [],
    unspecified: [],
  }

  learners.forEach(learner => buckets[groupKeyFor(learner.gender)].push(learner))

  GROUP_ORDER.forEach(key => {
    buckets[key].sort((a, b) => learnerListName(a).localeCompare(learnerListName(b)))
  })

  return GROUP_ORDER.filter(key => buckets[key].length > 0).map(key => ({
    key,
    label: GROUP_LABELS[key],
    learners: buckets[key],
  }))
}

/**
 * The roster in the order it is rendered.
 *
 * Every index-based operation in the grid — arrow keys, fill-down, paste
 * anchoring — must run off this and never off the raw payload, or a paste
 * lands on a different learner than the one under the cursor.
 */
export function orderedLearners(learners: MatatagLearner[]): MatatagLearner[] {
  return groupLearnersByGender(learners).flatMap(group => group.learners)
}

/** Matches on surname, given name, or the prose form, so either order typed finds them. */
export function learnerMatches(learner: MatatagLearner, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true

  return (
    learnerListName(learner).toLowerCase().includes(needle) ||
    learner.name.toLowerCase().includes(needle)
  )
}
