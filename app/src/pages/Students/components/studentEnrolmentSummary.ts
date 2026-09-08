import type { GenderTally, StudentStatisticsResponse } from '../../../types'
import {
  PRINT_BASE_CSS,
  PRINT_ON_LOAD_SCRIPT,
  escapeHtml,
  formatNumber,
} from './printSupport'

/** One grade level's block of section rows, plus its own subtotal. */
export interface EnrolmentSummaryLevel extends GenderTally {
  level: string
  sections: { sectionId: string; section: string; male: number; female: number; total: number }[]
}

export interface EnrolmentSummary {
  levels: EnrolmentSummaryLevel[]
  totals: GenderTally
}

/**
 * The whole school's enrolment on one page: every section under its grade
 * level, each level's subtotal, and the school's grand total.
 *
 * Built entirely from the statistics response — it already carries every
 * section with its grade level and headcount, in grade-level order — so the
 * summary costs no extra request.
 */
export function buildEnrolmentSummary(statistics: StudentStatisticsResponse): EnrolmentSummary {
  const levels: EnrolmentSummaryLevel[] = []

  statistics.by_section.forEach((row) => {
    const level = row.grade_level || 'No grade level'
    let block = levels[levels.length - 1]

    // `by_section` arrives grouped by grade level already, so a level's rows are
    // consecutive and only the last block can ever be the one to extend.
    if (!block || block.level !== level) {
      block = { level, sections: [], male: 0, female: 0, other: 0, total: 0 }
      levels.push(block)
    }

    block.sections.push({
      sectionId: row.section_id,
      section: row.section || 'Untitled section',
      male: row.male,
      female: row.female,
      total: row.total,
    })
    block.male += row.male
    block.female += row.female
    block.other += row.other
    block.total += row.total
  })

  return { levels, totals: statistics.totals }
}

/**
 * The printable one-page summary.
 *
 * Level and per-level cells are row-spanned across the level's sections, so the
 * sheet reads the way the same table does in a spreadsheet: the grade level
 * named once against the block of sections it covers.
 */
export function buildEnrolmentSummaryPrintHtml(statistics: StudentStatisticsResponse): string {
  const { levels, totals } = buildEnrolmentSummary(statistics)
  const generatedAt = new Date().toLocaleString('en-PH')

  const body = levels.length
    ? levels
        .map((level) =>
          level.sections
            .map(
              (section, index) => `<tr>
                ${
                  index === 0
                    ? `<td class="level" rowspan="${level.sections.length}">${escapeHtml(
                        level.level
                      )}</td>`
                    : ''
                }
                <td>${escapeHtml(section.section)}</td>
                <td class="num">${formatNumber(section.male)}</td>
                <td class="num">${formatNumber(section.female)}</td>
                <td class="num">${formatNumber(section.total)}</td>
                ${
                  index === 0
                    ? `<td class="num per-level" rowspan="${level.sections.length}">${formatNumber(
                        level.total
                      )}</td>`
                    : ''
                }
              </tr>`
            )
            .join('')
        )
        .join('')
    : '<tr><td class="empty" colspan="6">No sections for this school year.</td></tr>'

  // Enrolled but unsectioned students appear in no row above, so the grand
  // total would otherwise read short of the school's actual roll with nothing
  // on the page to say why.
  const unassignedNote =
    statistics.unassigned.total > 0
      ? `<p class="note">Excludes ${formatNumber(statistics.unassigned.total)} student${
          statistics.unassigned.total === 1 ? '' : 's'
        } on the roll who ${
          statistics.unassigned.total === 1 ? 'is' : 'are'
        } not assigned to any section (${formatNumber(
          statistics.unassigned.male
        )} male, ${formatNumber(statistics.unassigned.female)} female).</p>`
      : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Enrolment Summary — ${escapeHtml(statistics.academic_year)}</title>
  <style>${PRINT_BASE_CSS}
    /* Fixed, or the percentage widths below are only hints and the section
       column swallows whatever slack the paper has. */
    table { table-layout: fixed; }
    .c-level { width: 16%; }
    .c-count { width: 13%; }
    .c-per-level { width: 15%; }
    td.level { font-weight: 600; vertical-align: middle; }
    td.per-level { font-weight: 600; vertical-align: middle; background: #f9fafb; }
    tfoot td { font-weight: 700; background: #f3f4f6; }
  </style>
</head>
<body>
  <header>
    ${statistics.institution?.title ? `<div class="inst">${escapeHtml(statistics.institution.title)}</div>` : ''}
    ${statistics.institution?.address ? `<div class="addr">${escapeHtml(statistics.institution.address)}</div>` : ''}
    <div class="title">General Enrolment Summary</div>
    <div class="range">School Year ${escapeHtml(statistics.academic_year)}</div>
  </header>
  <table>
    <thead>
      <tr>
        <th class="c-level">Level</th>
        <th>Section</th>
        <th class="num c-count">Male</th>
        <th class="num c-count">Female</th>
        <th class="num c-count">Total</th>
        <th class="num c-per-level">Per Level</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
    ${
      levels.length
        ? `<tfoot>
      <tr>
        <td colspan="2">Grand Total</td>
        <td class="num">${formatNumber(totals.male)}</td>
        <td class="num">${formatNumber(totals.female)}</td>
        <td class="num">${formatNumber(totals.total)}</td>
        <td class="num">${formatNumber(totals.total)}</td>
      </tr>
    </tfoot>`
        : ''
    }
  </table>
  ${unassignedNote}
  <footer>
    General Enrolment Summary · School Year ${escapeHtml(statistics.academic_year)} ·
    ${formatNumber(levels.length)} grade level${levels.length === 1 ? '' : 's'} ·
    Generated on ${escapeHtml(generatedAt)}
  </footer>
  ${PRINT_ON_LOAD_SCRIPT}
</body>
</html>`
}
