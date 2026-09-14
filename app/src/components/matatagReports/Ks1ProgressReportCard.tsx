import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type {
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
  formatLearnerName,
  gradeNumber,
  schoolLines,
} from './matatagPdfShared'

/**
 * The MATATAG Key Stage 1 progress report card.
 *
 * A4 **portrait**, unlike the numeric SF9's landscape, because the thing this
 * card is made of is prose: two paragraphs per term, three terms. Landscape
 * gives them a short wide box that a teacher's sentence hits the bottom of.
 *
 * ## What is not on it
 *
 * No descriptor grid — DepEd prints that on the attached PACE forms, and this
 * document deliberately has nowhere to put one. No general average, no final
 * grade, no numeric mark of any kind. A Key Stage 1 record is descriptors and
 * prose, and the card is the prose half.
 *
 * ## The narrative box is the hard part
 *
 * A fixed DepEd box and unbounded text have no correct intersection. Three
 * defences, in order:
 *
 * 1. a cap at entry (600 characters, with a live counter on the screen),
 * 2. `fitPdfBlockFontSizePx` shrinking the text to fit, down to a legibility
 *    floor rather than to nothing,
 * 3. a continuation page for whatever still will not fit at that floor.
 *
 * The third is what makes this safe for narratives written before the cap
 * existed, or pasted past it. Shrinking a parent's report card to 4pt to avoid
 * a page break is the wrong trade, so it is not made.
 */

const LEFT_WIDTH = 316
const COLUMN_GAP = 9
const CONTENT_WIDTH = A4_PORTRAIT.width - PAGE_PADDING * 2
const RIGHT_WIDTH = CONTENT_WIDTH - LEFT_WIDTH - COLUMN_GAP

/** Inside a narrative box, less its padding — what the text actually gets. */
const NARRATIVE_TEXT_WIDTH = LEFT_WIDTH - 14
const NARRATIVE_BOX_HEIGHT = 72
const NARRATIVE_MAX_FONT = 8
const NARRATIVE_MIN_FONT = 6

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_PADDING,
    paddingBottom: PAGE_PADDING,
    paddingHorizontal: PAGE_PADDING,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: INK,
  },

  headerCentre: { textAlign: 'center' },
  republic: { fontSize: 7.5 },
  department: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  officeLine: { fontSize: 7, color: RULE },
  schoolName: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  cardTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 5 },
  cardTitleFilipino: { fontSize: 7.5, fontStyle: 'italic', color: RULE },

  identityBox: {
    marginTop: 7,
    borderWidth: 0.8,
    borderColor: INK,
    padding: 5,
  },
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

  columns: { flexDirection: 'row', marginTop: 7 },
  left: { width: LEFT_WIDTH },
  right: { width: RIGHT_WIDTH, marginLeft: COLUMN_GAP },

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

  termBlock: { marginBottom: 7 },
  narrativeLabel: {
    fontSize: 6.8,
    fontFamily: 'Helvetica-Bold',
    borderWidth: 0.8,
    borderColor: INK,
    borderTopWidth: 0,
    paddingVertical: 2,
    paddingHorizontal: 4,
    backgroundColor: '#f4f4f5',
  },
  narrativeFilipino: { fontFamily: 'Helvetica-Oblique', color: RULE },
  narrativeBox: {
    height: NARRATIVE_BOX_HEIGHT,
    borderWidth: 0.8,
    borderColor: INK,
    borderTopWidth: 0,
    padding: 4,
  },
  narrativeEmpty: { fontSize: 7, color: FAINT, fontStyle: 'italic' },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderWidth: 0.8,
    borderColor: INK,
    borderTopWidth: 0,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  signatureLine: {
    width: 150,
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    height: 9,
  },
  signatureCaption: { fontSize: 5.6, color: RULE, marginTop: 1, textAlign: 'center' },

  table: { borderWidth: 0.8, borderColor: INK, marginBottom: 7 },
  tr: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: RULE },
  th: {
    fontSize: 6.2,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 2,
    paddingHorizontal: 2,
    textAlign: 'center',
    borderRightWidth: 0.5,
    borderRightColor: RULE,
  },
  td: {
    fontSize: 6.6,
    paddingVertical: 1.7,
    paddingHorizontal: 2,
    textAlign: 'center',
    borderRightWidth: 0.5,
    borderRightColor: RULE,
  },
  tdLabel: { textAlign: 'left' },
  totalRow: { backgroundColor: '#f4f4f5', fontFamily: 'Helvetica-Bold' },

  legendRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: RULE,
    paddingVertical: 2,
    paddingHorizontal: 3,
  },
  legendLetter: {
    width: 12,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  legendLabel: { fontSize: 6.6, fontFamily: 'Helvetica-Bold' },
  legendFilipino: { fontSize: 6, fontFamily: 'Helvetica-Oblique', color: RULE },
  legendText: { fontSize: 5.4, color: RULE, marginTop: 0.5 },

  certBody: { fontSize: 6.4, padding: 4, lineHeight: 1.35 },
  certLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    height: 10,
    marginTop: 7,
  },
  certCaption: { fontSize: 5.6, color: RULE, textAlign: 'center', marginTop: 1 },

  footNote: { fontSize: 5.8, color: FAINT, marginTop: 4, textAlign: 'center' },

  continuationHeading: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  continuationTerm: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginTop: 8 },
  continuationLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', marginTop: 4, color: RULE },
  continuationText: { fontSize: 8.5, lineHeight: 1.35, marginTop: 2 },
})

interface Props {
  report: MatatagProgressReport
  /** Omit to print every learner in the payload, one card per page. */
  learners?: MatatagReportLearner[]
}

export function Ks1ProgressReportCard({ report, learners }: Props) {
  const cards = learners ?? report.learners

  return (
    <Document
      title={`MATATAG Progress Report — ${report.section.title}`}
      author={report.school.name ?? 'ScholasticCloud'}
    >
      {cards.map(learner => (
        <Card key={learner.student.id} report={report} learner={learner} />
      ))}
    </Document>
  )
}

function Card({
  report,
  learner,
}: {
  report: MatatagProgressReport
  learner: MatatagReportLearner
}) {
  // Worked out once per card so the page and its continuation agree on which
  // paragraphs were too long to print in place.
  const spilled = learner.narratives.flatMap(narrative =>
    [
      { field: 'can_do' as const, label: 'What Your Child Can Do', text: narrative.can_do },
      {
        field: 'to_improve' as const,
        label: 'What Your Child Is Learning To Improve',
        text: narrative.to_improve,
      },
    ]
      .filter(entry => overflows(entry.text))
      .map(entry => ({ ...entry, term: narrative.term, termLabel: narrative.label }))
  )

  return (
    <>
      <Page size="A4" orientation="portrait" style={styles.page}>
        <Header report={report} learner={learner} />

        <View style={styles.columns}>
          <View style={styles.left}>
            {learner.narratives.map(narrative => (
              <TermBlock key={narrative.term} narrative={narrative} />
            ))}
          </View>

          <View style={styles.right}>
            <AttendanceTable learner={learner} />
            <Legend report={report} />
            <Certificates report={report} />
          </View>
        </View>

        <Text style={styles.footNote} fixed>
          {report.curriculum_version.title} · {report.school.name} · {report.academic_year}
        </Text>
      </Page>

      {spilled.length > 0 && (
        <Page size="A4" orientation="portrait" style={styles.page}>
          <Text style={styles.continuationHeading}>
            {formatLearnerName(learner.student)} — narratives continued
          </Text>
          <Text style={{ fontSize: 7, color: RULE }}>
            These paragraphs are longer than the boxes on the card hold at a readable size, so they
            are printed here in full. The card carries the rest.
          </Text>

          {spilled.map(entry => (
            <View key={`${entry.term}-${entry.field}`} wrap={false}>
              <Text style={styles.continuationTerm}>{entry.termLabel}</Text>
              <Text style={styles.continuationLabel}>{entry.label}</Text>
              <Text style={styles.continuationText}>{entry.text}</Text>
            </View>
          ))}
        </Page>
      )}
    </>
  )
}

/**
 * Whether a paragraph still will not fit once shrunk to the legibility floor.
 *
 * Checked at the floor rather than at the chosen size, because
 * `fitPdfBlockFontSizePx` returns the floor when nothing fits — so the return
 * value alone cannot tell "just fits at 6pt" from "does not fit at all".
 */
function overflows(text: string | null): text is string {
  if (!text) return false

  return (
    estimatePdfBlockHeightPt(text, NARRATIVE_TEXT_WIDTH, NARRATIVE_MIN_FONT) >
    NARRATIVE_BOX_HEIGHT - 8
  )
}

function Header({
  report,
  learner,
}: {
  report: MatatagProgressReport
  learner: MatatagReportLearner
}) {
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
        <Text style={styles.cardTitle}>PROGRESS REPORT CARD</Text>
        <Text style={styles.cardTitleFilipino}>Kard ng Pag-unlad · Key Stage 1</Text>
      </View>

      <View style={styles.identityBox}>
        <View style={styles.identityRow}>
          <Field label="Name" value={formatLearnerName(student)} width="58%" />
          <Field label="LRN" value={student.lrn ?? ''} width="24%" />
          <Field label="Sex" value={student.sex ?? ''} width="18%" />
        </View>
        <View style={styles.identityRow}>
          <Field label="Grade" value={gradeNumber(report.section.grade_level)} width="12%" />
          <Field label="Section" value={report.section.title} width="26%" />
          <Field label="School Year" value={report.academic_year} width="22%" />
          <Field
            label="Age (start of SY)"
            value={asText(student.age_at_start_of_school_year)}
            width="20%"
          />
          <Field
            label="Age (end of SY)"
            value={asText(student.age_at_end_of_school_year)}
            width="20%"
          />
        </View>
        <View style={[styles.identityRow, { marginBottom: 0 }]}>
          <Field label="Adviser" value={report.section.adviser?.name ?? ''} width="58%" />
          <Field label="School ID" value={report.school.school_id ?? ''} width="42%" />
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

function TermBlock({ narrative }: { narrative: MatatagReportNarrative }) {
  return (
    <View style={styles.termBlock} wrap={false}>
      <Text style={styles.blockHeading}>
        {narrative.label}
        {narrative.filipino ? ` · ${narrative.filipino}` : ''}
      </Text>

      <NarrativeField
        label="What Your Child Can Do"
        filipino="Mga Nagagawa"
        text={narrative.can_do}
      />
      <NarrativeField
        label="What Your Child Is Learning To Improve"
        filipino="Dapat Linangin"
        text={narrative.to_improve}
      />

      <View style={styles.signatureRow}>
        <View>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureCaption}>Signature of Parent / Guardian</Text>
        </View>
      </View>
    </View>
  )
}

function NarrativeField({
  label,
  filipino,
  text,
}: {
  label: string
  filipino: string
  text: string | null
}) {
  const spills = overflows(text)

  // Shrink to fit; below the floor the text goes to a continuation page rather
  // than to 4pt, and the box says where it went.
  const fontSize = text
    ? fitPdfBlockFontSizePx(
        text,
        NARRATIVE_TEXT_WIDTH,
        NARRATIVE_BOX_HEIGHT - 8,
        NARRATIVE_MAX_FONT,
        NARRATIVE_MIN_FONT
      )
    : NARRATIVE_MAX_FONT

  return (
    <View>
      <Text style={styles.narrativeLabel}>
        {label} <Text style={styles.narrativeFilipino}>({filipino})</Text>
      </Text>
      <View style={styles.narrativeBox}>
        {text ? (
          spills ? (
            <Text style={[styles.narrativeEmpty, { color: RULE }]}>
              Printed in full on the continuation page.
            </Text>
          ) : (
            <Text style={{ fontSize, lineHeight: 1.3 }}>{text}</Text>
          )
        ) : (
          <Text style={styles.narrativeEmpty}>Not yet written.</Text>
        )}
      </View>
    </View>
  )
}

/**
 * The attendance block, printed exactly as the server derived it.
 *
 * Nothing here is a constant: the months, their order and their labels all come
 * from the payload. The numeric card's `ACADEMIC_YEAR_MONTHS` /
 * `ATTENDANCE_MONTH_LABELS` cannot be reused — they are ten months keyed by
 * month number, which cannot represent eleven rows, and they would hide the one
 * place this instrument deliberately differs from DepEd's printed form.
 */
function AttendanceTable({ learner }: { learner: MatatagReportLearner }) {
  const months = learner.attendance.months
  const total = learner.attendance.total

  return (
    <View style={styles.table}>
      <Text style={styles.blockHeading}>ATTENDANCE</Text>

      <View style={styles.tr}>
        <Text style={[styles.th, { width: '34%' }]}>Month</Text>
        <Text style={[styles.th, { width: '14%' }]}>Term</Text>
        <Text style={[styles.th, { width: '18%' }]}>Days</Text>
        <Text style={[styles.th, { width: '17%' }]}>Present</Text>
        <Text style={[styles.th, { width: '17%', borderRightWidth: 0 }]}>Absent</Text>
      </View>

      {months.map(month => (
        <View style={styles.tr} key={`${month.year}-${month.month}`}>
          <Text style={[styles.td, styles.tdLabel, { width: '34%' }]}>
            {month.label} {month.year}
          </Text>
          <Text style={[styles.td, { width: '14%' }]}>{month.term}</Text>
          <Text style={[styles.td, { width: '18%' }]}>{month.class_days || ''}</Text>
          <Text style={[styles.td, { width: '17%' }]}>{month.days_present || ''}</Text>
          <Text style={[styles.td, { width: '17%', borderRightWidth: 0 }]}>
            {month.days_absent || ''}
          </Text>
        </View>
      ))}

      <View style={[styles.tr, styles.totalRow]}>
        <Text style={[styles.td, styles.tdLabel, { width: '34%', fontFamily: 'Helvetica-Bold' }]}>
          TOTAL
        </Text>
        <Text style={[styles.td, { width: '14%' }]} />
        <Text style={[styles.td, { width: '18%', fontFamily: 'Helvetica-Bold' }]}>
          {total.class_days || ''}
        </Text>
        <Text style={[styles.td, { width: '17%', fontFamily: 'Helvetica-Bold' }]}>
          {total.days_present || ''}
        </Text>
        <Text
          style={[styles.td, { width: '17%', borderRightWidth: 0, fontFamily: 'Helvetica-Bold' }]}
        >
          {total.days_absent || ''}
        </Text>
      </View>
    </View>
  )
}

/**
 * The A-E legend, with its wording taken from the payload.
 *
 * DepEd has already revised these descriptions once. Serving them keeps the
 * next revision a config change rather than an edit to a PDF component nobody
 * would think to look in.
 */
function Legend({ report }: { report: MatatagProgressReport }) {
  return (
    <View style={styles.table}>
      <Text style={styles.blockHeading}>MARKING LEGEND</Text>

      {report.legend.descriptors.map(descriptor => (
        <View style={styles.legendRow} key={descriptor.letter}>
          <Text style={styles.legendLetter}>{descriptor.letter}</Text>
          <View style={{ flexGrow: 1, flexShrink: 1 }}>
            <Text style={styles.legendLabel}>
              {descriptor.label}{' '}
              <Text style={styles.legendFilipino}>({descriptor.filipino})</Text>
            </Text>
            <Text style={styles.legendText}>{descriptor.description}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function Certificates({ report }: { report: MatatagProgressReport }) {
  return (
    <>
      <View style={styles.table} wrap={false}>
        <Text style={styles.blockHeading}>CERTIFICATE OF TRANSFER</Text>
        <View style={styles.certBody}>
          <Text>
            Admitted to Grade ______ Section ________________ Eligibility for admission to Grade
            ______
          </Text>
          <View style={styles.certLine} />
          <Text style={styles.certCaption}>Principal</Text>
        </View>
      </View>

      <View style={styles.table} wrap={false}>
        <Text style={styles.blockHeading}>CANCELLATION OF ELIGIBILITY TO TRANSFER</Text>
        <View style={styles.certBody}>
          <Text>
            Admitted in {report.school.name ?? '________________'} on ______________________ .
          </Text>
          <View style={styles.certLine} />
          <Text style={styles.certCaption}>Principal</Text>
        </View>
      </View>
    </>
  )
}

function asText(value: number | null): string {
  return value === null || value === undefined ? '' : String(value)
}

export default Ks1ProgressReportCard
