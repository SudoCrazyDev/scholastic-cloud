import type {
  MatatagMacroSkillDefinition,
  MatatagPaceArea,
  MatatagPaceRow,
  MatatagReportSchool,
  MatatagReportStudent,
} from '../../types'

/**
 * Geometry and helpers shared by the two MATATAG documents.
 *
 * Both print on A4 and both are assembled from the same server payload, so the
 * page maths lives in one place rather than drifting between them.
 */

/** A4 portrait, in points, which is what react-pdf measures in. */
export const A4_PORTRAIT = { width: 595.28, height: 841.89 }

export const PAGE_PADDING = 22

export const INK = '#000000'
export const RULE = '#4b5563'
export const FAINT = '#9ca3af'

/**
 * A square for a competency not assessed in that term.
 *
 * `FF3F3F3F`, read straight off `PACE - GRADE 1!H19`. It reads as black and
 * costs toner, and a lighter grey would say the same thing for less — but on
 * this form the fill of a square is the only thing that carries meaning, and a
 * teacher comparing a printout against the workbook has to see the same sheet.
 * Fidelity wins; the trade is recorded in MATATAG.md.
 */
export const NOT_ASSESSED = '#3F3F3F'

/** The workbook stores ARGB; PDF wants RGB, and the alpha is always opaque. */
export function fillHex(argb: string | undefined): string | undefined {
  if (!argb || argb.length < 8) return undefined
  return `#${argb.slice(2)}`
}

/**
 * Last Name, First Name Ext. Middle Initial. — the order DepEd prints, and the
 * same one `formatStudentNameReportCard` uses on the numeric card, so a school
 * running both instruments sees one convention.
 */
export function formatLearnerName(student: MatatagReportStudent): string {
  const last = (student.last_name ?? '').trim()
  const first = (student.first_name ?? '').trim()
  const ext = (student.ext_name ?? '').trim()
  const middle = (student.middle_name ?? '').trim()
  const mi = middle ? `${middle.charAt(0)}.` : ''
  const tail = [first, ext, mi].filter(Boolean).join(' ')

  if (!last && !tail) return student.name || ''
  if (!last) return tail
  if (!tail) return last
  return `${last}, ${tail}`
}

/** 'Grade 1' → '1'. The form prints the number beside its own "Grade" label. */
export function gradeNumber(gradeLevel: string): string {
  return String(gradeLevel ?? '').replace(/^grade\s*/i, '').trim()
}

export function schoolLines(school: MatatagReportSchool): string[] {
  return [school.region, school.division ? `Division of ${school.division}` : null]
    .filter((line): line is string => Boolean(line && line.trim()))
}

/** The terms an area is actually assessed in, ascending. */
export function termsUsedBy(area: MatatagPaceArea): number[] {
  const terms = new Set<number>()
  area.rows.forEach(row => row.slots.forEach(slot => terms.add(slot.term)))
  return [...terms].sort((a, b) => a - b)
}

/** The slot at one (term, macro skill) of a row, or null if it has none. */
export function slotAt(row: MatatagPaceRow, term: number, macroSkill: string | null) {
  return (
    row.slots.find(
      slot => slot.term === term && (macroSkill === null || slot.macro_skill === macroSkill)
    ) ?? null
  )
}

/** The number printed in a row's No. column: '9', or '9a' for a lettered child. */
export function rowLabel(row: MatatagPaceRow): string {
  return row.parent_label ? `${row.parent_label}${row.label}` : row.label
}

/**
 * What the row reads as on the form.
 *
 * A lettered child's text is a fragment — "Determine:" then "a. the number of
 * syllables" — so the parent's stem is printed in front of it. Without that a
 * PACE form hands a parent half a sentence.
 */
export function rowText(row: MatatagPaceRow): string {
  return row.parent_text ? `${row.parent_text} ${row.text}` : row.text
}

export function skillLookup(
  macroSkills: MatatagMacroSkillDefinition[]
): Map<string, MatatagMacroSkillDefinition> {
  return new Map(macroSkills.map(skill => [skill.key, skill]))
}

/**
 * Rows in print order, banded by domain where the area has them.
 *
 * A band with a null title is an area without domains — the caller prints the
 * rows and no heading. Grouping is by the domain ids the rows carry, in the
 * order the rows arrive, so nothing here assumes how many domains an area has
 * or whether they span the year.
 *
 * **A domain can appear in more than one band.** Language's competency order
 * leaves a domain and comes back to it, and the sheet prints it twice; this
 * follows the data rather than gathering the runs together. Callers must
 * therefore key the result by position, not by title.
 */
export function bandRowsByDomain(
  rows: MatatagPaceRow[],
  area: MatatagPaceArea
): Array<{ title: string | null; rows: MatatagPaceRow[] }> {
  if (!area.has_domains) return [{ title: null, rows }]

  const titles = new Map(area.domains.map(domain => [domain.id, domain.title]))
  const bands: Array<{ title: string | null; rows: MatatagPaceRow[] }> = []

  rows.forEach(row => {
    const title = row.domain_id ? (titles.get(row.domain_id) ?? null) : null
    const last = bands[bands.length - 1]

    if (last && last.title === title) {
      last.rows.push(row)
    } else {
      bands.push({ title, rows: [row] })
    }
  })

  return bands
}

/**
 * Save a rendered blob under a filename.
 *
 * Revoking in the same tick cancels the download in some browsers, which is why
 * the timeout is here and not a tidier `finally`.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Strip what a filesystem will not take, so a section named "1 - A" is fine. */
export function safeFilename(value: string): string {
  return String(value ?? '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}
