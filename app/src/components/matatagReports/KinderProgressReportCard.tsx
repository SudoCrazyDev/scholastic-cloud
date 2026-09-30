import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type {
  MatatagPaceArea,
  MatatagPaceRow,
  MatatagProgressReport,
  MatatagReportLearner,
  MatatagReportNarrative,
} from '../../types'
import {
  estimatePdfBlockHeightPt,
  fitPdfBlockFontSizePx,
} from '../../utils/reportCardPdfUtils'
import {
  A4_PORTRAIT,
  FAINT,
  INK,
  PAGE_PADDING,
  RULE,
  bandRowsByDomain,
  formatLearnerName,
  schoolLines,
  slotAt,
} from './matatagPdfShared'

/**
 * DepEd's Kindergarten Progress Report Card — `SF9 - KINDER`, two A4 pages.
 *
 * Unlike the Key Stage 1 card, the marks print **on the card**: page one is the
 * learner's details and every competency of the four developmental domains
 * with its T1 / T2 / T3 rating, two columns side by side as the sheet lays them
 * out. Page two is the teacher's remarks for each term with a parent's
 * signature line, the attendance, the rating scale, and the certificate of
 * transfer.
 *
 * Every word that can change comes from the payload — the competencies from
 * `pace.learning_areas`, the scale and its indicators from `legend`, the months
 * from the attendance block — so a DepEd revision is a data change and never an
 * edit here. Nothing here branches on a grade level; the tab picks this card
 * because the catalog's instrument says its ratings print on the card.
 *
 * No average, no total, no count of how many CO a child has: the instrument
 * has none, and neither does this document.
 */

const CONTENT_WIDTH = A4_PORTRAIT.width - PAGE_PADDING * 2
const COLUMN_GAP = 10
const COLUMN_WIDTH = (CONTENT_WIDTH - COLUMN_GAP) / 2
const RATING_WIDTH = 19
const TEXT_WIDTH = COLUMN_WIDTH - RATING_WIDTH * 3

const REMARKS_BOX_HEIGHT = 170
const REMARKS_TEXT_WIDTH = COLUMN_WIDTH - 10
const REMARKS_MAX_FONT = 8.5
const REMARKS_MIN_FONT = 6

// The scale's code column, and what is left of the column for its indicators
// once the row's padding and the box's borders are taken out. react-pdf does
// not shrink a Text to fit a row, so the width is stated.
const LEGEND_CODE_WIDTH = 74
const LEGEND_TEXT_WIDTH = COLUMN_WIDTH - LEGEND_CODE_WIDTH - 8

/** Verbatim from `SF9 - KINDER!D22` — DepEd's note heading the card. */
const INTRO =
  "This progress report informs parents about their child's learning achievements based on the " +
  "Kindergarten Curriculum Guide. It provides a summary of the child's performance and indicate " +
  'their level of progress across different developmental domains every ten (10) weeks or each ' +
  'term. The report also helps determine whether additional time and follow-up support are ' +
  'needed for the child to achieve the expected competencies.'

/** Verbatim from `SF9 - KINDER!M97`. */
const SCALE_NOTE =
  "This rating scale is used to record the learner's level of attainment for each competency " +
  'across the developmental domains. It guides teachers in assigning ratings based on observed ' +
  'performance and assessment results for each term.'

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_PADDING,
    paddingBottom: PAGE_PADDING,
    paddingHorizontal: PAGE_PADDING,
    fontFamily: 'Helvetica',
    fontSize: 7,
    color: INK,
  },

  headerCentre: { textAlign: 'center' },
  republic: { fontSize: 7.5 },
  department: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  officeLine: { fontSize: 7, color: RULE },
  schoolName: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  cardTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 5 },
  schoolYear: { fontSize: 8, marginTop: 1 },

  identityBox: { marginTop: 6, borderWidth: 0.8, borderColor: INK, padding: 5 },
  identityRow: { flexDirection: 'row', marginBottom: 2 },
  identityCell: { flexDirection: 'row', alignItems: 'flex-end' },
  identityLabel: { fontSize: 6.5, color: RULE },
  identityValue: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    paddingLeft: 3,
    paddingBottom: 0.5,
  },

  intro: { fontSize: 6.6, lineHeight: 1.35, marginTop: 5, textAlign: 'justify' },
  introScale: { fontFamily: 'Helvetica-Bold' },

  columns: { flexDirection: 'row', marginTop: 6 },
  column: { width: COLUMN_WIDTH },
  columnGap: { width: COLUMN_GAP },

  table: { borderWidth: 0.8, borderColor: INK },
  tr: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: RULE },
  thText: {
    width: TEXT_WIDTH,
    fontSize: 6.8,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 2,
    paddingHorizontal: 3,
    borderRightWidth: 0.5,
    borderRightColor: RULE,
  },
  thRating: {
    width: RATING_WIDTH,
    fontSize: 6.4,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 2,
    textAlign: 'center',
    borderRightWidth: 0.5,
    borderRightColor: RULE,
  },
  areaHeading: {
    width: '100%',
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 2.2,
    paddingHorizontal: 3,
    backgroundColor: '#e5e7eb',
  },
  domainHeading: {
    width: '100%',
    fontSize: 6.6,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 1.6,
    paddingHorizontal: 3,
    backgroundColor: '#f4f4f5',
  },
  subDomainHeading: {
    width: '100%',
    fontSize: 6.4,
    fontFamily: 'Helvetica-Oblique',
    paddingVertical: 1.4,
    paddingLeft: 9,
    backgroundColor: '#fafafa',
  },
  tdText: {
    width: TEXT_WIDTH,
    fontSize: 6.5,
    lineHeight: 1.25,
    paddingVertical: 1.8,
    paddingHorizontal: 3,
    borderRightWidth: 0.5,
    borderRightColor: RULE,
  },
  tdRating: {
    width: RATING_WIDTH,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 1.8,
    textAlign: 'center',
    borderRightWidth: 0.5,
    borderRightColor: RULE,
  },
  lastCell: { borderRightWidth: 0 },

  blockHeading: {
    backgroundColor: '#e5e7eb',
    borderWidth: 0.8,
    borderColor: INK,
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  // A heading inside a bordered box: the box draws the edge, so this one has
  // no border of its own rather than overriding one with zero.
  boxHeading: {
    backgroundColor: '#e5e7eb',
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  blockHint: {
    fontSize: 6.2,
    fontFamily: 'Helvetica-Oblique',
    color: RULE,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 4,
  },

  termBlock: { marginBottom: 7 },
  termLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    borderWidth: 0.8,
    borderColor: INK,
    paddingVertical: 2,
    paddingHorizontal: 4,
    backgroundColor: '#f4f4f5',
  },
  remarksBox: {
    height: REMARKS_BOX_HEIGHT,
    borderWidth: 0.8,
    borderColor: INK,
    borderTopWidth: 0,
    padding: 5,
  },
  remarksEmpty: { fontSize: 7, color: FAINT, fontStyle: 'italic' },
  signatureRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 0.8,
    borderColor: INK,
    borderTopWidth: 0,
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  signatureLabel: { fontSize: 6.2, color: RULE },
  signatureLine: {
    flexGrow: 1,
    marginLeft: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    height: 9,
  },

  box: { borderWidth: 0.8, borderColor: INK, marginBottom: 7 },
  attTh: {
    fontSize: 6.2,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 2,
    paddingHorizontal: 2,
    textAlign: 'center',
    borderRightWidth: 0.5,
    borderRightColor: RULE,
  },
  attTd: {
    fontSize: 6.6,
    paddingVertical: 1.7,
    paddingHorizontal: 2,
    textAlign: 'center',
    borderRightWidth: 0.5,
    borderRightColor: RULE,
  },
  totalRow: { backgroundColor: '#f4f4f5' },

  note: { fontSize: 6.2, lineHeight: 1.35, padding: 4 },
  legendRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: RULE,
    paddingVertical: 2.5,
    paddingHorizontal: 3,
  },
  legendCode: { width: LEGEND_CODE_WIDTH, fontSize: 7, fontFamily: 'Helvetica-Bold' },
  legendText: { width: LEGEND_TEXT_WIDTH, fontSize: 6.2, lineHeight: 1.3 },

  certBody: { fontSize: 6.8, padding: 5, lineHeight: 1.5 },
  certSignatures: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  certSignature: { width: '46%' },
  certLine: { borderBottomWidth: 0.5, borderBottomColor: RULE, height: 10 },
  certCaption: { fontSize: 6, color: RULE, textAlign: 'center', marginTop: 1 },

  footNote: { fontSize: 5.8, color: FAINT, marginTop: 4, textAlign: 'center' },

  continuationHeading: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  continuationTerm: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginTop: 8 },
  continuationText: { fontSize: 8.5, lineHeight: 1.35, marginTop: 2 },
})

interface Props {
  report: MatatagProgressReport
  /** Omit to print every learner in the payload, one card each. */
  learners?: MatatagReportLearner[]
}

export function KinderProgressReportCard({ report, learners }: Props) {
  const cards = learners ?? report.learners
  const [left, right] = splitColumns(report.pace.learning_areas)

  return (
    <Document
      title={`Kindergarten Progress Report — ${report.section.title}`}
      author={report.school.name ?? 'ScholasticCloud'}
    >
      {cards.map(learner => (
        <Card key={learner.student.id} report={report} learner={learner} left={left} right={right} />
      ))}
    </Document>
  )
}

function Card({
  report,
  learner,
  left,
  right,
}: {
  report: MatatagProgressReport
  learner: MatatagReportLearner
  left: MatatagPaceArea[]
  right: MatatagPaceArea[]
}) {
  const spilled = learner.narratives.filter(narrative => overflows(narrative.comments))
  const footer = `${report.curriculum_version.title} · ${report.school.name ?? ''} · ${report.academic_year}`

  return (
    <>
      <Page size="A4" orientation="portrait" style={styles.page}>
        <Header report={report} learner={learner} />

        <Text style={styles.intro}>
          {INTRO} Each competency is marked as:{' '}
          <Text style={styles.introScale}>
            {report.legend.descriptors.map(d => `${d.letter} - ${d.label}`).join(', ')}
          </Text>
          .
        </Text>

        <View style={styles.columns}>
          <View style={styles.column}>
            <CompetencyTable areas={left} learner={learner} />
          </View>
          <View style={styles.columnGap} />
          <View style={styles.column}>
            <CompetencyTable areas={right} learner={learner} />
          </View>
        </View>

        <Text style={styles.footNote} fixed>
          {footer}
        </Text>
      </Page>

      <Page size="A4" orientation="portrait" style={styles.page}>
        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.blockHeading}>
              {(report.legend.narratives[0]?.label ?? 'Teacher’s Comments/Remarks').toUpperCase()}
            </Text>
            {report.legend.narratives[0]?.hint && (
              <Text style={styles.blockHint}>({report.legend.narratives[0].hint})</Text>
            )}
            {learner.narratives.map(narrative => (
              <RemarksBlock key={narrative.term} narrative={narrative} />
            ))}
          </View>

          <View style={styles.columnGap} />

          <View style={styles.column}>
            <AttendanceTable learner={learner} />
            <Legend report={report} />
            <Certificate />
          </View>
        </View>

        <Text style={styles.footNote} fixed>
          {footer}
        </Text>
      </Page>

      {spilled.length > 0 && (
        <Page size="A4" orientation="portrait" style={styles.page}>
          <Text style={styles.continuationHeading}>
            {formatLearnerName(learner.student)} — remarks continued
          </Text>
          <Text style={{ fontSize: 7, color: RULE }}>
            These remarks are longer than the boxes on the card hold at a readable size, so they
            are printed here in full.
          </Text>
          {spilled.map(narrative => (
            <View key={narrative.term} wrap={false}>
              <Text style={styles.continuationTerm}>{termTitle(narrative)}</Text>
              <Text style={styles.continuationText}>{narrative.comments}</Text>
            </View>
          ))}
        </Page>
      )}
    </>
  )
}

/**
 * Areas in print order, divided between the two columns as evenly as whole
 * areas allow — which for DepEd's catalog is exactly the sheet's own split:
 * domains I-III down the left, Language, Literacy and Communication down the
 * right. Worked out from row counts rather than hardcoded, so a revision that
 * adds a domain still lands in two balanced columns.
 */
function splitColumns(areas: MatatagPaceArea[]): [MatatagPaceArea[], MatatagPaceArea[]] {
  const weight = (area: MatatagPaceArea) => area.rows.length + area.domains.length + 1
  const half = areas.reduce((total, area) => total + weight(area), 0) / 2

  const left: MatatagPaceArea[] = []
  const right: MatatagPaceArea[] = []
  let used = 0

  areas.forEach(area => {
    if (right.length === 0 && (left.length === 0 || used + weight(area) / 2 <= half)) {
      left.push(area)
      used += weight(area)
    } else {
      right.push(area)
    }
  })

  return [left, right]
}

function Header({ report, learner }: { report: MatatagProgressReport; learner: MatatagReportLearner }) {
  const student = learner.student

  return (
    <View>
      <View style={styles.headerCentre}>
        <Text style={styles.republic}>Republic of the Philippines</Text>
        <Text style={styles.department}>Department of Education</Text>
        {schoolLines(report.school).map(line => (
          <Text key={line} style={styles.officeLine}>
            {line}
          </Text>
        ))}
        <Text style={styles.schoolName}>{report.school.name ?? ''}</Text>
        <Text style={styles.cardTitle}>KINDERGARTEN PROGRESS REPORT CARD</Text>
        <Text style={styles.schoolYear}>School Year {report.academic_year}</Text>
      </View>

      <View style={styles.identityBox}>
        <View style={styles.identityRow}>
          <Field label="Name" value={formatLearnerName(student)} width="64%" />
          <Field label="LRN" value={student.lrn ?? ''} width="36%" />
        </View>
        <View style={styles.identityRow}>
          <Field
            label="Section"
            value={`${report.section.grade_level} – ${report.section.title}`}
            width="46%"
          />
          <Field label="Teacher" value={report.section.adviser?.name ?? ''} width="54%" />
        </View>
        <View style={[styles.identityRow, { marginBottom: 0 }]}>
          <Field
            label="Age (beginning of SY)"
            value={age(student.age_at_start_of_school_year, student.age_months_at_start_of_school_year)}
            width="50%"
          />
          <Field
            label="Age (end of SY)"
            value={age(student.age_at_end_of_school_year, student.age_months_at_end_of_school_year)}
            width="50%"
          />
        </View>
      </View>
    </View>
  )
}

function Field({ label, value, width }: { label: string; value: string; width: string }) {
  return (
    <View style={[styles.identityCell, { width }]}>
      <Text style={styles.identityLabel}>{label}:</Text>
      <Text style={[styles.identityValue, { flexGrow: 1 }]}>{value || ' '}</Text>
    </View>
  )
}

/**
 * One column of competencies: each area banded, its domains banded beneath
 * it, and one row per competency with a rating box per term.
 *
 * A domain titled "D. Reading — Letter Knowledge" is a lettered sub-domain's
 * band. The sheet prints "D. Reading" once and each band under it, so the
 * shared prefix is printed only when it changes. Bands are keyed by position:
 * a title can recur.
 */
function CompetencyTable({ areas, learner }: { areas: MatatagPaceArea[]; learner: MatatagReportLearner }) {
  const terms = [1, 2, 3]

  return (
    <View style={styles.table}>
      <View style={[styles.tr, { borderTopWidth: 0 }]}>
        <Text style={styles.thText}>Competency</Text>
        {terms.map(term => (
          <Text key={term} style={[styles.thRating, term === 3 ? styles.lastCell : {}]}>
            T{term}
          </Text>
        ))}
      </View>

      {areas.map(area => {
        let lastParent: string | null = null

        return (
          <View key={area.id}>
            <View style={styles.tr} wrap={false}>
              <Text style={styles.areaHeading}>{area.title}</Text>
            </View>

            {bandRowsByDomain(area.rows, area).map((band, bandIndex) => {
              const [parent, child] = splitDomainTitle(band.title)
              const showParent = parent !== null && parent !== lastParent
              lastParent = parent

              return (
                <View key={bandIndex}>
                  {showParent && (
                    <View style={styles.tr} wrap={false}>
                      <Text style={styles.domainHeading}>{parent}</Text>
                    </View>
                  )}
                  {child && (
                    <View style={styles.tr} wrap={false}>
                      <Text style={styles.subDomainHeading}>{child}</Text>
                    </View>
                  )}
                  {band.rows.map(row => (
                    <CompetencyRow key={row.competency_id} row={row} learner={learner} terms={terms} />
                  ))}
                </View>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

function CompetencyRow({
  row,
  learner,
  terms,
}: {
  row: MatatagPaceRow
  learner: MatatagReportLearner
  terms: number[]
}) {
  return (
    <View style={styles.tr} wrap={false}>
      <Text style={styles.tdText}>
        {row.label}. {row.text}
      </Text>
      {terms.map(term => {
        const slot = slotAt(row, term, null)
        return (
          <Text key={term} style={[styles.tdRating, term === terms.length ? styles.lastCell : {}]}>
            {slot ? (learner.pace[slot.id] ?? '') : ''}
          </Text>
        )
      })}
    </View>
  )
}

/** 'D. Reading — Letter Knowledge' → ['D. Reading', 'Letter Knowledge']. */
function splitDomainTitle(title: string | null): [string | null, string | null] {
  if (!title) return [null, null]
  const index = title.indexOf(' — ')
  return index === -1 ? [title, null] : [title.slice(0, index), title.slice(index + 3)]
}

function termTitle(narrative: MatatagReportNarrative): string {
  return `${narrative.label.toUpperCase()}${narrative.filipino ? ` (${narrative.filipino.toUpperCase()})` : ''}`
}

/** Whether a remark still will not fit once shrunk to the legibility floor. */
function overflows(text: string | null): text is string {
  if (!text) return false
  return estimatePdfBlockHeightPt(text, REMARKS_TEXT_WIDTH, REMARKS_MIN_FONT) > REMARKS_BOX_HEIGHT - 10
}

function RemarksBlock({ narrative }: { narrative: MatatagReportNarrative }) {
  const text = narrative.comments
  const spills = overflows(text)
  const fontSize = text
    ? fitPdfBlockFontSizePx(text, REMARKS_TEXT_WIDTH, REMARKS_BOX_HEIGHT - 10, REMARKS_MAX_FONT, REMARKS_MIN_FONT)
    : REMARKS_MAX_FONT

  return (
    <View style={styles.termBlock} wrap={false}>
      <Text style={styles.termLabel}>{termTitle(narrative)}</Text>
      <View style={styles.remarksBox}>
        {text ? (
          spills ? (
            <Text style={[styles.remarksEmpty, { color: RULE }]}>
              Printed in full on the continuation page.
            </Text>
          ) : (
            <Text style={{ fontSize, lineHeight: 1.3 }}>{text}</Text>
          )
        ) : (
          <Text style={styles.remarksEmpty}>Not yet written.</Text>
        )}
      </View>
      <View style={styles.signatureRow}>
        <Text style={styles.signatureLabel}>Parent’s/Guardian’s Signature:</Text>
        <View style={styles.signatureLine} />
      </View>
    </View>
  )
}

/**
 * Attendance exactly as the server derived it: months, order and labels all
 * from the payload. DepEd's sheet prints September under both Terms 1 and 2;
 * this prints it once, wholly in Term 1 — the module's documented deviation.
 */
function AttendanceTable({ learner }: { learner: MatatagReportLearner }) {
  const { months, total } = learner.attendance
  const widths = ['12%', '30%', '20%', '19%', '19%']

  return (
    <View style={styles.box}>
      <Text style={styles.boxHeading}>ATTENDANCE RECORD</Text>

      <View style={styles.tr}>
        {['Term', 'Month', 'No. of Class Days', 'No. of Days Present', 'No. of Times Absent'].map(
          (label, index) => (
            <Text key={label} style={[styles.attTh, { width: widths[index] }, index === 4 ? styles.lastCell : {}]}>
              {label}
            </Text>
          )
        )}
      </View>

      {months.map((month, index) => (
        <View style={styles.tr} key={`${month.year}-${month.month}`}>
          <Text style={[styles.attTd, { width: widths[0] }]}>
            {index === 0 || months[index - 1].term !== month.term ? month.term : ''}
          </Text>
          <Text style={[styles.attTd, { width: widths[1], textAlign: 'left' }]}>{month.label}</Text>
          <Text style={[styles.attTd, { width: widths[2] }]}>{month.class_days || ''}</Text>
          <Text style={[styles.attTd, { width: widths[3] }]}>{month.days_present || ''}</Text>
          <Text style={[styles.attTd, { width: widths[4] }, styles.lastCell]}>{month.days_absent || ''}</Text>
        </View>
      ))}

      <View style={[styles.tr, styles.totalRow]}>
        <Text style={[styles.attTd, { width: '42%', fontFamily: 'Helvetica-Bold', textAlign: 'left' }]}>
          TOTAL
        </Text>
        <Text style={[styles.attTd, { width: widths[2], fontFamily: 'Helvetica-Bold' }]}>
          {total.class_days || ''}
        </Text>
        <Text style={[styles.attTd, { width: widths[3], fontFamily: 'Helvetica-Bold' }]}>
          {total.days_present || ''}
        </Text>
        <Text style={[styles.attTd, { width: widths[4], fontFamily: 'Helvetica-Bold' }, styles.lastCell]}>
          {total.days_absent || ''}
        </Text>
      </View>
    </View>
  )
}

function Legend({ report }: { report: MatatagProgressReport }) {
  return (
    <View style={styles.box} wrap={false}>
      <Text style={styles.boxHeading}>IMPORTANT NOTE TO PARENTS/GUARDIANS</Text>
      <Text style={styles.note}>{SCALE_NOTE}</Text>

      <View style={[styles.legendRow, { backgroundColor: '#f4f4f5' }]}>
        <Text style={styles.legendCode}>Rating</Text>
        <Text style={[styles.legendText, { fontFamily: 'Helvetica-Bold' }]}>Indicators</Text>
      </View>

      {report.legend.descriptors.map(descriptor => (
        <View style={styles.legendRow} key={descriptor.letter}>
          <Text style={styles.legendCode}>
            {descriptor.label} ({descriptor.letter})
          </Text>
          <Text style={styles.legendText}>{descriptor.description}</Text>
        </View>
      ))}
    </View>
  )
}

/** `SF9 - KINDER!M120:M131`, blanks left for the school to fill in by hand. */
function Certificate() {
  return (
    <View style={styles.box} wrap={false}>
      <Text style={styles.boxHeading}>CERTIFICATE OF TRANSFER</Text>
      <View style={styles.certBody}>
        <Text>This is to certify that ____________________________________________</Text>
        <Text>
          of ____________________________ has developed the general competencies based on the
          Kindergarten Curriculum Guide.
        </Text>
        <View style={styles.certSignatures}>
          <View style={styles.certSignature}>
            <View style={styles.certLine} />
            <Text style={styles.certCaption}>Adviser</Text>
          </View>
          <View style={styles.certSignature}>
            <View style={styles.certLine} />
            <Text style={styles.certCaption}>School Head</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

function age(years: number | null, months: number | null): string {
  if (years === null || years === undefined) return ''
  const y = `${years} year${years === 1 ? '' : 's'}`
  return months === null || months === undefined ? y : `${y}, ${months} month${months === 1 ? '' : 's'}`
}

export default KinderProgressReportCard
