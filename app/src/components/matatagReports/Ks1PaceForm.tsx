import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type {
  MatatagPaceArea,
  MatatagPaceRow,
  MatatagProgressReport,
  MatatagReportLearner,
} from '../../types'
import {
  A4_LANDSCAPE,
  FAINT,
  INK,
  NOT_ASSESSED,
  PAGE_PADDING,
  RULE,
  bandRowsByDomain,
  fillHex,
  formatLearnerName,
  gradeNumber,
  macroSkillsUsedBy,
  rowLabel,
  rowText,
  skillLookup,
  slotAt,
  termsUsedBy,
} from './matatagPdfShared'

/**
 * PACE — the Progress Assessment of Competencies in Education form.
 *
 * One form per learning area per learner: every competency of the year down the
 * page, and a box per (term, macro skill) it is assessed in carrying the
 * descriptor the adviser recorded. This is where the grid actually prints; the
 * report card carries the prose.
 *
 * ## Why this is one long column and not DepEd's two
 *
 * The official sheet lays its competencies out in two columns. react-pdf cannot
 * flow content between columns — it has no multi-column layout and no way to
 * ask "what is left on this page" — so a two-column form has to be
 * hand-paginated off a tuned rows-per-page constant, which is wrong the moment a
 * competency's text runs one line longer than the constant assumed. Reading &
 * Literacy is ~37 rows and comes out at three or four landscape pages this way:
 * more paper, and every row on it correct. Tune it later if anyone asks; do not
 * start there.
 *
 * ## Landscape, and why the grey cells matter
 *
 * Reading & Literacy needs three terms of four macro skills, which is twelve
 * rating boxes plus the competency text. A shaded cell is not a missing mark —
 * it means the competency is not assessed in that term at all, which is the
 * curriculum's own pacing and is information a parent is entitled to see. The
 * workbook fills those black; this prints them light grey, because black on a
 * handed-out form reads as a redaction.
 */

const CONTENT_WIDTH = A4_LANDSCAPE.width - PAGE_PADDING * 2

/** Widths in points: the text column takes whatever the boxes leave. */
const NUMBER_WIDTH = 26
const BOX_WIDTH = 26

/**
 * Only printed for a per-term list, where it is load-bearing rather than
 * decorative: those areas restart their numbering at 1 each term, so a
 * continuation page that carries only a band heading from the page before
 * leaves "6. Magalang" ambiguous between three different marks. A band still
 * heads each term; this is what survives the page break.
 */
const TERM_WIDTH = 34

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_PADDING,
    paddingBottom: PAGE_PADDING,
    paddingHorizontal: PAGE_PADDING,
    fontFamily: 'Helvetica',
    fontSize: 7,
    color: INK,
  },

  heading: { marginBottom: 5 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  formTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  areaTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  meta: { fontSize: 7, color: RULE },
  metaStrong: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK },

  table: { borderWidth: 0.8, borderColor: INK },
  headRow: { flexDirection: 'row', backgroundColor: '#e5e7eb' },
  termHead: {
    fontSize: 6.6,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    paddingVertical: 2,
    borderLeftWidth: 0.5,
    borderLeftColor: RULE,
  },
  skillHead: {
    fontSize: 6.4,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    paddingVertical: 2,
    borderLeftWidth: 0.5,
    borderLeftColor: RULE,
    borderTopWidth: 0.5,
    borderTopColor: RULE,
  },
  colHead: {
    fontSize: 6.6,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 2,
    paddingHorizontal: 3,
    justifyContent: 'center',
  },

  domainBand: {
    flexDirection: 'row',
    backgroundColor: '#f4f4f5',
    borderTopWidth: 0.5,
    borderTopColor: INK,
  },
  domainText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },

  row: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: RULE },
  numberCell: {
    width: NUMBER_WIDTH,
    fontSize: 6.6,
    textAlign: 'center',
    paddingVertical: 3,
    borderRightWidth: 0.5,
    borderRightColor: RULE,
  },
  textCell: { paddingVertical: 3, paddingHorizontal: 4, borderRightWidth: 0.5, borderRightColor: RULE },
  competencyText: { fontSize: 6.8, lineHeight: 1.25 },
  standardText: { fontSize: 6, color: RULE, fontStyle: 'italic', marginTop: 1 },
  extraText: { fontSize: 6, color: RULE, marginTop: 1 },

  box: {
    width: BOX_WIDTH,
    borderLeftWidth: 0.5,
    borderLeftColor: RULE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxLetter: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  boxBlank: { fontSize: 8.5, color: FAINT, textAlign: 'center' },

  legendStrip: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 },
  legendItem: { fontSize: 6, color: RULE, marginRight: 9 },
  skillSwatch: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 9,
  },
  swatch: {
    width: 8,
    height: 7,
    borderWidth: 0.5,
    borderColor: RULE,
    marginRight: 2,
  },

  pageNumber: { fontSize: 6, color: FAINT, textAlign: 'right', marginTop: 4 },
  empty: { fontSize: 8, color: RULE, padding: 12, textAlign: 'center' },
})

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

function AreaForm({
  report,
  learner,
  area,
}: {
  report: MatatagProgressReport
  learner: MatatagReportLearner
  area: MatatagPaceArea
}) {
  const skills = macroSkillsUsedBy(area)
  const terms = termsUsedBy(area)
  const skillsByKey = skillLookup(report.legend.macro_skills)

  // A per-term list gives each competency exactly one box, so its rows band by
  // term; a year list gives one row a box per term and macro skill. Read off
  // `shape`, never off which area this is — Grade 2 may lay an area out the
  // other way and must not need a code change to do it.
  const bandByTerm = area.shape === 'per_term_list'

  // Boxes per row: one per (term, skill) for a year list, one for a per-term
  // list. The text column takes the rest of the page.
  const boxesPerRow = bandByTerm ? 1 : terms.length * Math.max(1, skills.length)
  const textWidth =
    CONTENT_WIDTH - NUMBER_WIDTH - (bandByTerm ? TERM_WIDTH : 0) - boxesPerRow * BOX_WIDTH - 2

  const groups = bandByTerm
    ? terms.map(term => ({
        title: termLabel(report, term),
        rows: area.rows.filter(row => row.slots.some(slot => slot.term === term)),
        term,
      }))
    : [{ title: null as string | null, rows: area.rows, term: null as number | null }]

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.heading} fixed>
        <View style={styles.headingRow}>
          <View>
            <Text style={styles.formTitle}>PACE FORM</Text>
            <Text style={styles.areaTitle}>{area.title}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.metaStrong}>{formatLearnerName(learner.student)}</Text>
            <Text style={styles.meta}>
              Grade {gradeNumber(report.section.grade_level)} · {report.section.title} ·{' '}
              {report.academic_year}
            </Text>
            <Text style={styles.meta}>{report.school.name ?? ''}</Text>
          </View>
        </View>
      </View>

      <View style={styles.table}>
        <HeadRow
          report={report}
          terms={terms}
          skills={skills}
          skillsByKey={skillsByKey}
          textWidth={textWidth}
          bandByTerm={bandByTerm}
        />

        {area.rows.length === 0 && (
          <Text style={styles.empty}>
            This learning area has no competencies in the catalog this section reports against.
          </Text>
        )}

        {groups.map(group => (
          <View key={group.title ?? 'all'}>
            {group.title && (
              <View style={styles.domainBand}>
                <Text style={[styles.domainText, { width: CONTENT_WIDTH - 2 }]}>{group.title}</Text>
              </View>
            )}

            {/* Keyed by position, never by title. A domain can band more than
                once — Language's competency order returns to a domain it has
                already left — and a title-based key collides there, which React
                warns may duplicate or omit children. Dropping a row from a
                DepEd form is not a warning-level problem. */}
            {bandRowsByDomain(group.rows, area).map((band, index) => (
              <View key={`${group.title ?? 'all'}-band-${index}`}>
                {band.title && (
                  <View style={styles.domainBand} wrap={false}>
                    <Text style={[styles.domainText, { width: CONTENT_WIDTH - 2 }]}>
                      {band.title}
                    </Text>
                  </View>
                )}

                {band.rows.map(row => (
                  <CompetencyRow
                    key={row.competency_id}
                    row={row}
                    area={area}
                    terms={bandByTerm && group.term !== null ? [group.term] : terms}
                    skills={bandByTerm ? [] : skills}
                    textWidth={textWidth}
                    showTerm={bandByTerm}
                    ratings={learner.pace}
                  />
                ))}
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.legendStrip}>
        {report.legend.descriptors.map(descriptor => (
          <Text key={descriptor.letter} style={styles.legendItem}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: INK }}>{descriptor.letter}</Text> ={' '}
            {descriptor.label} ({descriptor.filipino})
          </Text>
        ))}
      </View>

      {skills.length > 0 && (
        <View style={styles.legendStrip}>
          {skills.map(key => {
            const skill = skillsByKey.get(key)
            return (
              <View key={key} style={styles.skillSwatch}>
                <View style={[styles.swatch, { backgroundColor: fillHex(skill?.fills?.[0]) }]} />
                <Text style={styles.legendItem}>
                  {skill?.abbr ?? key} = {skill?.label ?? key}
                </Text>
              </View>
            )
          })}
          <View style={styles.skillSwatch}>
            <View style={[styles.swatch, { backgroundColor: NOT_ASSESSED }]} />
            <Text style={styles.legendItem}>not assessed this term</Text>
          </View>
        </View>
      )}

      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        fixed
      />
    </Page>
  )
}

/**
 * The heading: two tiers for a macro-skill area (term band over skill abbrs),
 * one for everything else.
 *
 * `fixed`, so it reprints at the top of every page. Reading & Literacy runs to
 * two or three pages, and without this the second one is twelve unlabelled
 * boxes per row — a form nobody can read and, worse, one somebody might read
 * wrongly.
 */
function HeadRow({
  report,
  terms,
  skills,
  skillsByKey,
  textWidth,
  bandByTerm,
}: {
  report: MatatagProgressReport
  terms: number[]
  skills: string[]
  skillsByKey: ReturnType<typeof skillLookup>
  textWidth: number
  bandByTerm: boolean
}) {
  const left = (
    <>
      {bandByTerm && (
        <Text style={[styles.colHead, { width: TERM_WIDTH, textAlign: 'center' }]}>Term</Text>
      )}
      <Text style={[styles.colHead, { width: NUMBER_WIDTH, textAlign: 'center' }]}>No.</Text>
      <Text
        style={[
          styles.colHead,
          { width: textWidth, borderRightWidth: 0.5, borderRightColor: RULE },
        ]}
      >
        Learning Competency
      </Text>
    </>
  )

  if (bandByTerm || skills.length === 0) {
    return (
      <View style={styles.headRow} fixed>
        {left}
        <Text style={[styles.termHead, { width: BOX_WIDTH }]}>Mark</Text>
      </View>
    )
  }

  return (
    <View fixed>
      <View style={styles.headRow}>
        {left}
        {terms.map(term => (
          <Text key={term} style={[styles.termHead, { width: BOX_WIDTH * skills.length }]}>
            {termLabel(report, term)}
          </Text>
        ))}
      </View>
      <View style={styles.headRow}>
        <Text style={[styles.colHead, { width: NUMBER_WIDTH }]} />
        <Text style={[styles.colHead, { width: textWidth, borderRightWidth: 0.5, borderRightColor: RULE }]} />
        {terms.flatMap(term =>
          skills.map(key => {
            const skill = skillsByKey.get(key)
            return (
              <Text
                key={`${term}-${key}`}
                style={[
                  styles.skillHead,
                  { width: BOX_WIDTH, backgroundColor: fillHex(skill?.fills?.[0]) },
                ]}
              >
                {skill?.abbr ?? key.charAt(0).toUpperCase()}
              </Text>
            )
          })
        )}
      </View>
    </View>
  )
}

function CompetencyRow({
  row,
  area,
  terms,
  skills,
  textWidth,
  showTerm,
  ratings,
}: {
  row: MatatagPaceRow
  area: MatatagPaceArea
  terms: number[]
  skills: string[]
  textWidth: number
  showTerm: boolean
  ratings: Record<string, string>
}) {
  const columns: Array<{ key: string; term: number; skill: string | null }> =
    skills.length === 0
      ? terms.map(term => ({ key: `${term}`, term, skill: null }))
      : terms.flatMap(term => skills.map(skill => ({ key: `${term}-${skill}`, term, skill })))

  return (
    <View style={styles.row} wrap={false}>
      {showTerm && (
        <Text style={[styles.numberCell, { width: TERM_WIDTH }]}>{row.term || terms[0]}</Text>
      )}
      <Text style={styles.numberCell}>{rowLabel(row)}</Text>

      <View style={[styles.textCell, { width: textWidth }]}>
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

      {columns.map(column => {
        const slot = slotAt(row, column.term, column.skill)

        if (!slot) {
          // Not assessed in this term. A shaded box, not an empty one: an empty
          // box means "assessed, not yet marked", and a parent reading the form
          // is entitled to the difference.
          return <View key={column.key} style={[styles.box, { backgroundColor: NOT_ASSESSED }]} />
        }

        const letter = ratings[slot.id]

        return (
          <View key={column.key} style={styles.box}>
            {letter ? (
              <Text style={styles.boxLetter}>{letter}</Text>
            ) : (
              <Text style={styles.boxBlank}>–</Text>
            )}
          </View>
        )
      })}
    </View>
  )
}

function termLabel(report: MatatagProgressReport, term: number): string {
  return report.legend.terms.find(t => t.value === term)?.label ?? `Term ${term}`
}

export default Ks1PaceForm
