import type { StudentRosterGroup, StudentRosterResponse } from '../../../types'

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const formatNumber = (n: number) => new Intl.NumberFormat('en-PH').format(n)

/** Birthdates arrive as plain `YYYY-MM-DD`, so parse them as local dates. */
const formatBirthdate = (iso?: string | null) => {
  if (!iso) return '—'
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatSex = (gender?: string | null) => {
  const value = (gender ?? '').trim().toLowerCase()
  if (value === 'male' || value === 'm') return 'M'
  if (value === 'female' || value === 'f') return 'F'

  return gender ? escapeHtml(gender) : '—'
}

/**
 * One printed sheet per section (or per grade level), each starting a new page.
 *
 * A class list is signed and filed per section, so the sheets must not run
 * together — even a section of three students gets its own page.
 */
function buildSheet(group: StudentRosterGroup, report: StudentRosterResponse): string {
  const byGradeLevel = report.group_by === 'grade_level'

  const meta = [
    ['Grade Level', group.grade_level],
    byGradeLevel ? null : ['Section', group.section],
    byGradeLevel ? null : ['Adviser', group.adviser],
    ['School Year', report.academic_year],
  ]
    .filter((row): row is [string, string | null] => row !== null)
    .map(
      ([label, value]) =>
        `<div><span class="meta-label">${escapeHtml(label)}:</span> ${escapeHtml(value || '—')}</div>`
    )
    .join('')

  const rows = group.students.length
    ? group.students
        .map(
          (student, index) => `<tr>
            <td class="num">${index + 1}</td>
            <td>${escapeHtml(student.lrn || '—')}</td>
            <td>${escapeHtml(student.list_name)}</td>
            <td class="center">${formatSex(student.gender)}</td>
            ${byGradeLevel ? `<td>${escapeHtml(student.section || '—')}</td>` : ''}
            <td>${formatBirthdate(student.birthdate)}</td>
            <td class="num">${student.age ?? '—'}</td>
          </tr>`
        )
        .join('')
    : `<tr><td class="empty" colspan="${byGradeLevel ? 7 : 6}">No students enrolled.</td></tr>`

  const tally = [
    ['Male', group.male],
    ['Female', group.female],
    ...(group.other > 0 ? [['Other', group.other] as [string, number]] : []),
    ['Total', group.total],
  ]
    .map(
      ([label, value]) =>
        `<div class="tally-item"><span class="meta-label">${escapeHtml(label)}:</span> ${formatNumber(
          Number(value)
        )}</div>`
    )
    .join('')

  return `<section class="sheet">
    <header>
      ${report.institution?.title ? `<div class="inst">${escapeHtml(report.institution.title)}</div>` : ''}
      ${report.institution?.address ? `<div class="addr">${escapeHtml(report.institution.address)}</div>` : ''}
      <div class="title">${byGradeLevel ? 'Grade Level List' : 'Class List'}</div>
    </header>
    <div class="meta">${meta}</div>
    <table>
      <thead>
        <tr>
          <th class="num c-index">#</th>
          <th class="c-lrn">LRN</th>
          <th>Name</th>
          <th class="center c-sex">Sex</th>
          ${byGradeLevel ? '<th class="c-section">Section</th>' : ''}
          <th class="c-birthdate">Birthdate</th>
          <th class="num c-age">Age</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="tally">${tally}</div>
  </section>`
}

/**
 * A standalone printable document for the selected class lists.
 *
 * Built as its own HTML page and handed to a new window rather than printed out
 * of the SPA, so the app's layout, navigation and Tailwind reset stay out of the
 * paper — the same approach the finance collection report takes.
 */
export function buildRosterPrintHtml(report: StudentRosterResponse): string {
  const generatedAt = new Date().toLocaleString('en-PH')
  const scope = report.group_by === 'grade_level' ? 'Grade Level Lists' : 'Class Lists'
  const totals = report.totals

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(scope)} — ${escapeHtml(report.academic_year)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 24px; font-size: 12px; }
    .sheet { page-break-after: always; }
    .sheet:last-of-type { page-break-after: auto; }
    header { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 12px; }
    header .inst { font-size: 18px; font-weight: 700; }
    header .addr { font-size: 11px; color: #4b5563; }
    header .title { font-size: 14px; font-weight: 600; margin-top: 8px; text-transform: uppercase; letter-spacing: .06em; }
    .meta { display: flex; flex-wrap: wrap; gap: 4px 24px; margin-bottom: 10px; }
    .meta-label { color: #6b7280; text-transform: uppercase; font-size: 10px; letter-spacing: .03em; }
    /* Fixed widths so consecutive sheets in one run line up column for column,
       whatever the longest LRN or name on each happens to be. */
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #d1d5db; padding: 4px 8px; text-align: left; word-wrap: break-word; }
    th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
    .c-index { width: 5%; }
    .c-lrn { width: 16%; }
    .c-sex { width: 6%; }
    .c-section { width: 16%; }
    .c-birthdate { width: 18%; }
    .c-age { width: 6%; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.center, th.center { text-align: center; }
    td.empty { text-align: center; color: #6b7280; font-style: italic; }
    .tally { display: flex; flex-wrap: wrap; gap: 4px 24px; margin-top: 10px; font-weight: 700; }
    footer { margin-top: 20px; font-size: 10px; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    /* Repeat the column headings when one section's list runs past a page. */
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    @media print { body { margin: 0; } footer { page-break-before: avoid; } }
  </style>
</head>
<body>
  ${report.groups.map((group) => buildSheet(group, report)).join('')}
  <footer>
    ${escapeHtml(scope)} · School Year ${escapeHtml(report.academic_year)} ·
    ${formatNumber(report.groups.length)} list${report.groups.length === 1 ? '' : 's'} ·
    ${formatNumber(totals.male)} male, ${formatNumber(totals.female)} female${
      totals.other > 0 ? `, ${formatNumber(totals.other)} other` : ''
    }, ${formatNumber(totals.total)} total ·
    Generated on ${escapeHtml(generatedAt)}
  </footer>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
</body>
</html>`
}
