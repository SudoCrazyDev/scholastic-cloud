import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type {
  MatatagPaceArea,
  MatatagPaceRow,
  MatatagProgressReport,
  MatatagReportLearner,
} from '../../types'
import { estimatePdfBlockHeightPt } from '../../utils/reportCardPdfUtils'
import {
  A4_PORTRAIT,
  INK,
  NOT_ASSESSED,
  PAGE_PADDING,
  RULE,
  bandRowsByDomain,
  fillHex,
  formatLearnerName,
  gradeNumber,
  rowLabel,
  rowText,
  skillLookup,
  slotAt,
  termsUsedBy,
} from './matatagPdfShared'

/**
 * PACE — the Performance and Competency Evaluation form, laid out as DepEd's
 * `PACE - GRADE 1` sheet lays it out.
 *
 * ## The shape of the sheet, read off the workbook
 *
 * Two columns of competencies on A4 portrait, reading down the left then down
 * the right. `C14:R14` bands the learning area across both. Each column then
 * carries its own `No. | Learning Competencies | Rating (T1 T2 T3)` heading and
 * its own domain bands — `C18:I18` and `K18:R18` hold *different* domains on the
 * same sheet row, which is what proves the two columns are one continuous flow
 * rather than a list split down the middle.
 *
 * **A competency occupies one sub-row per macro skill.** Competency 1 merges
 * `C19:C20` and `D19:F20` across two rating rows: Listening on `G19`, Speaking
 * on `G20`. Competency 20a merges across three. The colour of the square *is*
 * the label — there is no L/S/R/W column anywhere on the form — which is why the
 * legend at `L74` is part of the instrument and not decoration, and why the note
 * at `K71` tells the teacher to write the rating on the coloured square itself.
 *
 * A square filled `FF3F3F3F` is a term that competency is not assessed in. Note
 * that it is dark grey and not black: that is DepEd's own colour, used verbatim
 * rather than "corrected".
 *
 * ## Pagination is computed here, not by react-pdf
 *
 * react-pdf cannot flow content between columns — it has no multi-column layout
 * and no way to ask what is left on a page — so the only way to have DepEd's two
 * columns is to measure the blocks and place them. Heights are deliberately
 * *over*-estimated: an over-estimate costs a little white space at the foot of a
 * column, an under-estimate would push a competency off the form. The pages are
 * left wrappable for the same reason — if an estimate is ever wrong, the row
 * spills onto an extra page instead of being silently clipped away.
 */

const CONTENT_WIDTH = A4_PORTRAIT.width - PAGE_PADDING * 2
const GUTTER = 11
const COLUMN_WIDTH = (CONTENT_WIDTH - GUTTER) / 2

// The workbook's own column proportions: No. 5.43, competency 3 x 13.71,
// rating 3 x 6.43 character-widths.
const NO_WIDTH = COLUMN_WIDTH * (5.43 / 65.85)
const RATING_WIDTH = COLUMN_WIDTH * (6.43 / 65.85)
const TEXT_WIDTH = COLUMN_WIDTH - NO_WIDTH - RATING_WIDTH * 3

/** One macro skill's band of three term squares. */
const SUB_ROW_HEIGHT = 10
const TEXT_FONT = 5.6
const STANDARD_FONT = 5
const BAND_HEIGHT = 12.5

/** Heading tiers inside a column: "No./Competency/Rating" then "T1 T2 T3". */
const COLUMN_HEAD_HEIGHT = 21

/** The area band across both columns. */
const AREA_BAND_HEIGHT = 18

/** Title, the LRN/Name/Section strip, and the instructions — first page only. */
const TITLE_BLOCK_HEIGHT = 44
const INSTRUCTIONS_HEIGHT = 78
const COMPACT_HEAD_HEIGHT = 17

/** The note plus the legend box, which close a macro-skill form. */
const LEGEND_HEIGHT = 66

/** An area with no macro skills closes on the descriptor strip alone. */
const DESCRIPTOR_STRIP_HEIGHT = 14

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_PADDING,
    paddingBottom: PAGE_PADDING,
    paddingHorizontal: PAGE_PADDING,
    fontFamily: 'Helvetica',
    fontSize: TEXT_FONT,
    color: INK,
  },

  formTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    borderWidth: 0.8,
    borderColor: INK,
    paddingVertical: 3,
  },
  identityStrip: {
    flexDirection: 'row',
    borderWidth: 0.8,
    borderColor: INK,
    borderTopWidth: 0,
    paddingVertical: 2.5,
    paddingHorizontal: 4,
  },
  identityLabel: { fontSize: 6.5, fontFamily: 'Helvetica-Bold' },
  identityValue: {
    fontSize: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    paddingLeft: 3,
    flexGrow: 1,
  },

  instructions: {
    borderWidth: 0.8,
    borderColor: INK,
    borderTopWidth: 0,
    padding: 4,
    fontSize: 5.4,
    lineHeight: 1.3,
    textAlign: 'justify',
  },
  instructionsLead: { fontFamily: 'Helvetica-Bold' },

  compactHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 3,
  },
  compactTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  compactMeta: { fontSize: 6, color: RULE },

  areaBand: {
    borderWidth: 0.8,
    borderColor: INK,
    backgroundColor: '#d9d9d9',
    paddingVertical: 3,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginTop: 3,
  },

  columns: { flexDirection: 'row' },
  column: { width: COLUMN_WIDTH },
  gutter: { width: GUTTER },

  headRow: { flexDirection: 'row', backgroundColor: '#d9d9d9' },
  headCell: {
    fontSize: 6,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    paddingVertical: 2,
    borderRightWidth: 0.5,
    borderRightColor: INK,
    borderTopWidth: 0.8,
    borderTopColor: INK,
  },
  headCellLeft: { borderLeftWidth: 0.8, borderLeftColor: INK },
  headTermCell: {
    fontSize: 5.6,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    paddingVertical: 1.5,
    borderRightWidth: 0.5,
    borderRightColor: INK,
  },

  /** The blue-teal domain heading, white on colour, as the sheet prints it. */
  domainBand: {
    backgroundColor: '#1f6f8b',
    color: '#ffffff',
    fontSize: 6,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 2,
    paddingHorizontal: 3,
    borderWidth: 0.5,
    borderColor: INK,
  },

  row: { flexDirection: 'row', borderWidth: 0.5, borderColor: INK, borderTopWidth: 0 },
  noCell: {
    width: NO_WIDTH,
    fontSize: 5.6,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    paddingTop: 2,
    borderRightWidth: 0.5,
    borderRightColor: INK,
  },
  textCell: {
    width: TEXT_WIDTH,
    paddingVertical: 1.5,
    paddingHorizontal: 3,
    borderRightWidth: 0.5,
    borderRightColor: INK,
  },
  competencyText: { fontSize: TEXT_FONT, lineHeight: 1.25 },
  standardText: { fontSize: STANDARD_FONT, color: RULE, fontStyle: 'italic', marginTop: 0.8 },
  extraText: { fontSize: STANDARD_FONT, color: RULE, marginTop: 0.8 },

  ratingStack: { flexDirection: 'column' },
  ratingRow: { flexDirection: 'row' },
  square: {
    width: RATING_WIDTH,
    height: SUB_ROW_HEIGHT,
    borderRightWidth: 0.4,
    borderRightColor: '#ffffff',
    borderBottomWidth: 0.4,
    borderBottomColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  squareLetter: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: INK, textAlign: 'center' },

  note: { fontSize: 5.2, fontStyle: 'italic', color: RULE, marginTop: 4, lineHeight: 1.25 },
  legendBox: { borderWidth: 0.8, borderColor: INK, marginTop: 3 },
  legendTitle: {
    backgroundColor: '#d9d9d9',
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    paddingVertical: 1.5,
  },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 3 },
  legendItem: { flexDirection: 'row', alignItems: 'center', width: '50%', paddingVertical: 1 },
  legendSwatch: { width: 9, height: 8, borderWidth: 0.4, borderColor: INK, marginRight: 3 },
  legendLabel: { fontSize: 5, flexShrink: 1 },

  descriptorStrip: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 3 },
  descriptorItem: { fontSize: 5, color: RULE, marginRight: 7 },

  pageNumber: { fontSize: 5.4, color: RULE, textAlign: 'right', marginTop: 3 },
})

/**
 * Verbatim from `PACE - GRADE 1!C8`, with the workbook's mis-encoded
 * apostrophes restored. Printed because it is part of the form: it is what
 * tells a teacher this is filled in across the term rather than in one sitting
 * at the end of it.
 */
const GENERAL_INSTRUCTIONS =
  'Teachers shall accomplish this form on a regular basis throughout the term, not as a one-time ' +
  'entry, by recording the learner’s level of attainment for each learning competency using ' +
  'the appropriate descriptor: A (Advancing), B (Benchmarking), C (Connecting), D (Developing), ' +
  'or E (Emerging). Entries shall be made in the corresponding term only after the learner has ' +
  'engaged in a series of formative tasks and activities and has completed a relevant summative ' +
  'assessment. The assigned level shall be based on sufficient and varied evidence of learning, ' +
  'including learner outputs, observations, anecdotal records, and other assessment results, and ' +
  'shall reflect the learner’s most consistent level of performance.'

/** Verbatim from `PACE - GRADE 1!K71`. */
const COLOUR_NOTE =
  'Note: Each colored square represents a language macro skill. Refer to the legend to identify ' +
  'the skill, and write the learner’s rating directly on the colored square for each term.'

interface Props {
  report: MatatagProgressReport
  /** Omit to print every learner in the payload. */
  learners?: MatatagReportLearner[]
  /** Omit to print every area the payload carries. */
  areas?: MatatagPaceArea[]
}

export function Ks1PaceForm({ report, learners, areas }: Props) {
  const people = learners ?? report.learners
  const forms = areas ?? report.pace.learning_areas

  return (
    <Document
      title={`PACE forms — ${report.section.title}`}
      author={report.school.name ?? 'ScholasticCloud'}
    >
      {people.flatMap(learner =>
        forms.map(area => (
          <AreaForm
            key={`${learner.student.id}:${area.id}`}
            report={report}
            learner={learner}
            area={area}
          />
        ))
      )}
    </Document>
  )
}

// -----------------------------------------------------------------
// Blocks: what goes in a column, and how tall each one is
// -----------------------------------------------------------------

type Block =
  | { kind: 'band'; key: string; title: string; height: number }
  | {
      kind: 'row'
      key: string
      row: MatatagPaceRow
      skills: Array<string | null>
      terms: number[]
      height: number
    }

/**
 * The macro skills one competency is assessed on, in the workbook's own order.
 *
 * This decides how many sub-rows the competency occupies — two for "Chant
 * rhymes and poems", three for "Comprehend stories. a." — so it is read off
 * that competency's own slots and never off the area's full set. An area using
 * no macro skills gives one unlabelled sub-row.
 */
function skillsFor(row: MatatagPaceRow, area: MatatagPaceArea): Array<string | null> {
  if (!area.uses_macro_skills) return [null]

  const firstSeenAt = new Map<string, number>()

  row.slots.forEach(slot => {
    if (slot.macro_skill && !firstSeenAt.has(slot.macro_skill)) {
      firstSeenAt.set(slot.macro_skill, slot.sort_order)
    }
  })

  const skills = [...firstSeenAt.entries()].sort((a, b) => a[1] - b[1]).map(([key]) => key)

  return skills.length > 0 ? skills : [null]
}

function rowHeight(row: MatatagPaceRow, area: MatatagPaceArea, skillCount: number): number {
  let text = estimatePdfBlockHeightPt(rowText(row), TEXT_WIDTH - 6, TEXT_FONT)

  if (area.carries_values && row.performance_standard) {
    text += estimatePdfBlockHeightPt(row.performance_standard, TEXT_WIDTH - 6, STANDARD_FONT) + 1
  }

  if (row.extra) {
    Object.entries(row.extra).forEach(([label, value]) => {
      text += estimatePdfBlockHeightPt(`${label}: ${value}`, TEXT_WIDTH - 6, STANDARD_FONT) + 1
    })
  }

  // The taller of what the text needs and what the squares need, plus the row's
  // own padding and rule.
  return Math.max(text + 4, skillCount * SUB_ROW_HEIGHT) + 1
}

function buildBlocks(area: MatatagPaceArea, report: MatatagProgressReport): Block[] {
  const blocks: Block[] = []
  const allTerms = termsUsedBy(area)

  const pushRows = (rows: MatatagPaceRow[], terms: number[], scope: string) => {
    bandRowsByDomain(rows, area).forEach((band, index) => {
      if (band.title) {
        // Keyed by position: a domain can band more than once, because a
        // competency list can leave a domain and come back to it.
        blocks.push({
          kind: 'band',
          key: `${scope}-band-${index}`,
          title: band.title,
          height: BAND_HEIGHT,
        })
      }

      band.rows.forEach(row => {
        const skills = skillsFor(row, area)
        blocks.push({
          kind: 'row',
          key: `${scope}-${row.competency_id}`,
          row,
          skills,
          terms,
          height: rowHeight(row, area, skills.length),
        })
      })
    })
  }

  if (area.shape === 'per_term_list') {
    // These areas restart their numbering at 1 each term, so the term has to be
    // stated. A band says it, and after a column break the position of the one
    // open square goes on saying it.
    allTerms.forEach(term => {
      blocks.push({
        kind: 'band',
        key: `term-${term}`,
        title: termLabel(report, term),
        height: BAND_HEIGHT,
      })
      pushRows(
        area.rows.filter(row => row.slots.some(slot => slot.term === term)),
        allTerms,
        `t${term}`
      )
    })
  } else {
    pushRows(area.rows, allTerms, 'year')
  }

  return blocks
}

/**
 * Fill one column, greedily, and say where the next one starts.
 *
 * A band left stranded at the foot of a column is pulled back so it travels
 * with the rows it heads. A single block taller than the whole column is placed
 * anyway — refusing it would loop forever, and the page is wrappable, so it
 * spills rather than vanishes.
 */
function takeColumn(
  blocks: Block[],
  from: number,
  capacity: number
): { items: Block[]; next: number } {
  const items: Block[] = []
  let used = 0
  let i = from

  while (i < blocks.length) {
    const block = blocks[i]

    if (used + block.height > capacity && items.length > 0) break

    items.push(block)
    used += block.height
    i++
  }

  while (items.length > 1 && items[items.length - 1].kind === 'band') {
    items.pop()
    i--
  }

  return { items, next: i }
}

type PacePage = { left: Block[]; right: Block[]; capacity: number }

/**
 * Lay the blocks out in two columns per page, reserving the foot of the first
 * page's right column for the colour key.
 *
 * The key goes on page one rather than at the very end, and that is the one
 * deliberate departure from the sheet. DepEd's is a single scrolling worksheet
 * that never paginates, so "at the end" and "where you can see it" are the same
 * place there; on a printed multi-page form they are not, and a reader holding
 * page one cannot decode a single square without it. For an area that fits on
 * one page — which is most of them — this puts the key exactly where the
 * workbook puts it, bottom right.
 *
 * The earlier attempt was to reserve on whichever page turned out to be last.
 * That does not converge: reserving pushes a row onto a new page, which moves
 * where "last" is, which removes the need for the reservation. It oscillates,
 * and what it settles into is a page containing nothing but a colour key.
 */
function paginate(
  blocks: Block[],
  firstCapacity: number,
  laterCapacity: number,
  legendReserve: number
): PacePage[] {
  const pages: PacePage[] = []
  let i = 0

  while (i < blocks.length) {
    const capacity = pages.length === 0 ? firstCapacity : laterCapacity
    const rightCapacity = pages.length === 0 ? capacity - legendReserve : capacity

    const left = takeColumn(blocks, i, capacity)
    i = left.next
    const right = takeColumn(blocks, i, rightCapacity)
    i = right.next

    pages.push({ left: left.items, right: right.items, capacity })

    if (left.items.length === 0 && right.items.length === 0) break
  }

  return pages.length > 0 ? pages : [{ left: [], right: [], capacity: firstCapacity }]
}

// -----------------------------------------------------------------

function AreaForm({
  report,
  learner,
  area,
}: {
  report: MatatagProgressReport
  learner: MatatagReportLearner
  area: MatatagPaceArea
}) {
  const skillsByKey = skillLookup(report.legend.macro_skills)
  const blocks = buildBlocks(area, report)

  const firstCapacity =
    A4_PORTRAIT.height -
    PAGE_PADDING * 2 -
    TITLE_BLOCK_HEIGHT -
    INSTRUCTIONS_HEIGHT -
    AREA_BAND_HEIGHT -
    COLUMN_HEAD_HEIGHT -
    14

  const laterCapacity =
    A4_PORTRAIT.height -
    PAGE_PADDING * 2 -
    COMPACT_HEAD_HEIGHT -
    AREA_BAND_HEIGHT -
    COLUMN_HEAD_HEIGHT -
    14

  // A macro-skill area closes on the note and the colour key; an area without
  // them closes on the descriptor strip alone, which is a fraction of the size.
  const legendReserve = area.uses_macro_skills ? LEGEND_HEIGHT : DESCRIPTOR_STRIP_HEIGHT

  const pages = paginate(blocks, firstCapacity, laterCapacity, legendReserve)

  return (
    <>
      {pages.map((page, index) => (
        <Page key={index} size="A4" orientation="portrait" style={styles.page}>
          {index === 0 ? (
            <FormHead report={report} learner={learner} />
          ) : (
            <CompactHead report={report} learner={learner} area={area} />
          )}

          <Text style={styles.areaBand}>{area.title.toUpperCase()}</Text>

          <View style={styles.columns}>
            <Column
              blocks={page.left}
              area={area}
              ratings={learner.pace}
              skillsByKey={skillsByKey}
            />
            <View style={styles.gutter} />
            <Column
              blocks={page.right}
              area={area}
              ratings={learner.pace}
              skillsByKey={skillsByKey}
              footer={
                index === 0 ? (
                  <Legend report={report} area={area} skillsByKey={skillsByKey} />
                ) : null
              }
            />
          </View>

          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
            fixed
          />
        </Page>
      ))}

    </>
  )
}

function FormHead({
  report,
  learner,
}: {
  report: MatatagProgressReport
  learner: MatatagReportLearner
}) {
  return (
    <View>
      <Text style={styles.formTitle}>PERFORMANCE AND COMPETENCY EVALUATION (PACE) FORM</Text>

      <View style={styles.identityStrip}>
        <View style={{ flexDirection: 'row', width: '30%' }}>
          <Text style={styles.identityLabel}>LRN:</Text>
          <Text style={styles.identityValue}>{learner.student.lrn ?? ' '}</Text>
        </View>
        <View style={{ flexDirection: 'row', width: '42%', paddingLeft: 6 }}>
          <Text style={styles.identityLabel}>Name:</Text>
          <Text style={styles.identityValue}>{formatLearnerName(learner.student)}</Text>
        </View>
        <View style={{ flexDirection: 'row', width: '28%', paddingLeft: 6 }}>
          <Text style={styles.identityLabel}>Section:</Text>
          <Text style={styles.identityValue}>{report.section.title}</Text>
        </View>
      </View>

      <Text style={styles.instructions}>
        <Text style={styles.instructionsLead}>General Instructions: </Text>
        {GENERAL_INSTRUCTIONS}
      </Text>
    </View>
  )
}

function CompactHead({
  report,
  learner,
  area,
}: {
  report: MatatagProgressReport
  learner: MatatagReportLearner
  area: MatatagPaceArea
}) {
  return (
    <View style={styles.compactHead}>
      <Text style={styles.compactTitle}>PACE FORM · {area.title}</Text>
      <Text style={styles.compactMeta}>
        {formatLearnerName(learner.student)} · Grade {gradeNumber(report.section.grade_level)} ·{' '}
        {report.section.title} · {report.academic_year}
      </Text>
    </View>
  )
}

function Column({
  blocks,
  area,
  ratings,
  skillsByKey,
  footer,
}: {
  blocks: Block[]
  area: MatatagPaceArea
  ratings: Record<string, string>
  skillsByKey: ReturnType<typeof skillLookup>
  footer?: React.ReactNode
}) {
  const terms = termsUsedBy(area)

  return (
    <View style={styles.column}>
      <View style={styles.headRow}>
        <Text style={[styles.headCell, styles.headCellLeft, { width: NO_WIDTH }]}>No.</Text>
        <Text style={[styles.headCell, { width: TEXT_WIDTH }]}>Learning Competencies</Text>
        <Text style={[styles.headCell, { width: RATING_WIDTH * 3, borderRightWidth: 0.8 }]}>
          Rating
        </Text>
      </View>
      <View style={styles.headRow}>
        <Text
          style={[styles.headCell, styles.headCellLeft, { width: NO_WIDTH, borderTopWidth: 0 }]}
        />
        <Text style={[styles.headCell, { width: TEXT_WIDTH, borderTopWidth: 0 }]} />
        {terms.map((term, index) => (
          <Text
            key={term}
            style={[
              styles.headTermCell,
              { width: RATING_WIDTH },
              index === terms.length - 1 ? { borderRightWidth: 0.8, borderRightColor: INK } : {},
            ]}
          >
            T{term}
          </Text>
        ))}
      </View>

      {blocks.map(block => {
        if (block.kind === 'band') {
          return (
            <Text key={block.key} style={styles.domainBand}>
              {block.title}
            </Text>
          )
        }

        return (
          <CompetencyRow
            key={block.key}
            block={block}
            area={area}
            ratings={ratings}
            skillsByKey={skillsByKey}
          />
        )
      })}

      {footer}
    </View>
  )
}

function CompetencyRow({
  block,
  area,
  ratings,
  skillsByKey,
}: {
  block: Extract<Block, { kind: 'row' }>
  area: MatatagPaceArea
  ratings: Record<string, string>
  skillsByKey: ReturnType<typeof skillLookup>
}) {
  const { row, skills, terms } = block

  return (
    <View style={[styles.row, { minHeight: block.height - 1 }]} wrap={false}>
      <Text style={styles.noCell}>{rowLabel(row)}</Text>

      <View style={styles.textCell}>
        <Text style={styles.competencyText}>{rowText(row)}</Text>

        {/* GMRC's value is the competency text itself; this is the Filipino
            performance standard printed beside it. Null everywhere else. */}
        {area.carries_values && row.performance_standard && (
          <Text style={styles.standardText}>{row.performance_standard}</Text>
        )}

        {/* A field a later grade level introduced, reaching the form as
            label/value pairs without anything here knowing its name. */}
        {row.extra &&
          Object.entries(row.extra).map(([label, value]) => (
            <Text key={label} style={styles.extraText}>
              {label}: {value}
            </Text>
          ))}
      </View>

      <View style={styles.ratingStack}>
        {skills.map(skill => (
          <View key={skill ?? 'none'} style={styles.ratingRow}>
            {terms.map(term => {
              const slot = slotAt(row, term, skill)

              if (!slot) {
                // Not assessed in this term. DepEd's own FF3F3F3F, which is
                // dark grey rather than the black it reads as on screen.
                return <View key={term} style={[styles.square, { backgroundColor: NOT_ASSESSED }]} />
              }

              const letter = ratings[slot.id]
              const colour = skill ? fillHex(skillsByKey.get(skill)?.fills?.[0]) : '#ffffff'

              return (
                <View key={term} style={[styles.square, { backgroundColor: colour ?? '#ffffff' }]}>
                  <Text style={styles.squareLetter}>{letter ?? ''}</Text>
                </View>
              )
            })}
          </View>
        ))}
      </View>
    </View>
  )
}

/**
 * The colour key, which on this form is not decoration.
 *
 * There is no L/S/R/W column anywhere — the square's fill is the only thing
 * saying which macro skill a rating belongs to — so the legend and the note
 * above it are the form's own decoding instructions. Only the skills this area
 * actually uses are listed.
 */
function Legend({
  report,
  area,
  skillsByKey,
}: {
  report: MatatagProgressReport
  area: MatatagPaceArea
  skillsByKey: ReturnType<typeof skillLookup>
}) {
  const used = new Set<string>()
  area.rows.forEach(row =>
    row.slots.forEach(slot => {
      if (slot.macro_skill) used.add(slot.macro_skill)
    })
  )

  const showsColours = area.uses_macro_skills && used.size > 0

  return (
    <View>
      {showsColours && <Text style={styles.note}>{COLOUR_NOTE}</Text>}

      {showsColours && (
        <View style={styles.legendBox}>
          <Text style={styles.legendTitle}>LEGEND</Text>
          <View style={styles.legendGrid}>
            {[...used].map(key => {
              const skill = skillsByKey.get(key)
              return (
                <View key={key} style={styles.legendItem}>
                  <View
                    style={[styles.legendSwatch, { backgroundColor: fillHex(skill?.fills?.[0]) }]}
                  />
                  <Text style={styles.legendLabel}>{skill?.label ?? key}</Text>
                </View>
              )
            })}
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: NOT_ASSESSED }]} />
              <Text style={styles.legendLabel}>Not assessed in that term</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.descriptorStrip}>
        {report.legend.descriptors.map(descriptor => (
          <Text key={descriptor.letter} style={styles.descriptorItem}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>{descriptor.letter}</Text> ={' '}
            {descriptor.label} ({descriptor.filipino})
          </Text>
        ))}
      </View>
    </View>
  )
}

function termLabel(report: MatatagProgressReport, term: number): string {
  return report.legend.terms.find(t => t.value === term)?.label ?? `Term ${term}`
}

export default Ks1PaceForm
