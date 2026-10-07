import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
// Registers how report card words break; see the note there.
import { fitPdfSingleLineFontSizePx } from '../../../utils/reportCardPdfUtils'
import type { ReportCardSettingValue } from '../layouts'
import type { ShsCardData, ShsSemester } from './data'

/**
 * The Senior High School semestral report card (SF 9), as one sheet printed
 * landscape on both sides and folded in half.
 *
 *   Page 1 (outside): attendance, parent signatures, certificate of promotion
 *                     and cancellation of transfer eligibility | the cover.
 *   Page 2 (inside):  both semesters' grades | the observed values and the
 *                     grading legends.
 *
 * Purely presentational: every number arrives already worked out in
 * `ShsCardData`, so the Settings preview draws exactly what a learner's card does.
 */

const DEPED_LOGO_URL = '/deped-logo.png'
const BORDER = '0.75pt solid #000'

const s = StyleSheet.create({
  page: { flexDirection: 'row', fontFamily: 'Helvetica', fontSize: 7.5, color: '#000' },
  half: { width: '50%', paddingHorizontal: 22, paddingVertical: 18 },
  halfLeft: { borderRight: '0.5pt dashed #bbb' },
  heading: { fontFamily: 'Helvetica-Bold', fontSize: 9, textAlign: 'center', marginBottom: 4 },
  subheading: { fontFamily: 'Helvetica-Bold', fontSize: 8, marginBottom: 3 },
  table: { borderTop: BORDER, borderLeft: BORDER },
  row: { flexDirection: 'row' },
  cell: { borderRight: BORDER, borderBottom: BORDER, paddingHorizontal: 2, paddingVertical: 1.5, justifyContent: 'center' },
  center: { textAlign: 'center' },
  bold: { fontFamily: 'Helvetica-Bold' },
  italic: { fontFamily: 'Helvetica-Oblique' },
  line: { borderBottom: '0.75pt solid #000', flexGrow: 1, minHeight: 9, marginLeft: 3, paddingLeft: 2 },
  signatureBlock: { alignItems: 'center', width: '46%' },
  signatureLine: { borderBottom: '0.75pt solid #000', width: '100%', minHeight: 10, justifyContent: 'flex-end' },
})

const str = (value: ReportCardSettingValue | undefined) => String(value ?? '')
const on = (value: ReportCardSettingValue | undefined) => value === true || value === 'true' || value === 1 || value === '1'
const show = (value: number | null) => (value === null ? '' : String(value))

/** A labelled fill-in line: "NAME ________". */
function Field({ label, value, grow = 1, bold = true }: { label: string; value: string; grow?: number; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexGrow: grow, flexBasis: 0, marginRight: 6 }}>
      <Text style={bold ? s.bold : undefined}>{label}</Text>
      <View style={s.line}>
        <Text>{value}</Text>
      </View>
    </View>
  )
}

function Signature({ name, role }: { name: string; role: string }) {
  const fontSize = fitPdfSingleLineFontSizePx(name || ' ', 140, 7.5)
  return (
    <View style={s.signatureBlock}>
      <View style={s.signatureLine}>
        <Text wrap={false} style={{ ...s.center, ...s.bold, fontSize }}>{name}</Text>
      </View>
      <Text style={{ marginTop: 1.5, fontSize: 7 }}>{role}</Text>
    </View>
  )
}

// ── Page 1, left: attendance and the back-page certificates ────────────────

function AttendanceAndCertificates({ data, settings }: { data: ShsCardData; settings: Record<string, ReportCardSettingValue> }) {
  const columns = data.attendance.length + 1
  const labelWidth = 18
  const monthWidth = `${(100 - labelWidth) / columns}%`
  const rows: { label: string; pick: (m: Omit<ShsCardData['attendance'][number], 'label'>) => number | null }[] = [
    { label: 'No. of School Days', pick: (m) => m.schoolDays },
    { label: 'No. of Days Present', pick: (m) => m.present },
    { label: 'No. of Days Absent', pick: (m) => m.absent },
  ]

  return (
    <View>
      <Text style={s.heading}>ATTENDANCE RECORD</Text>
      <View style={s.table}>
        <View style={s.row}>
          <View style={{ ...s.cell, width: `${labelWidth}%` }} />
          {data.attendance.map((month) => (
            <View key={month.label} style={{ ...s.cell, width: monthWidth, paddingHorizontal: 0 }}>
              {/* Three letters keep up to twelve month columns legible on a half sheet. */}
              <Text style={{ fontSize: 5.5, textAlign: 'center', ...s.bold }}>{month.label.slice(0, 3)}</Text>
            </View>
          ))}
          <View style={{ ...s.cell, width: monthWidth, paddingHorizontal: 0 }}>
            <Text style={{ fontSize: 5.5, textAlign: 'center', ...s.bold }}>TOTAL</Text>
          </View>
        </View>
        {rows.map((row) => (
          <View key={row.label} style={s.row}>
            <View style={{ ...s.cell, width: `${labelWidth}%` }}>
              <Text style={{ fontSize: 6 }}>{row.label}</Text>
            </View>
            {data.attendance.map((month) => (
              <View key={month.label} style={{ ...s.cell, width: monthWidth, paddingHorizontal: 0, paddingVertical: 4 }}>
                <Text style={{ ...s.center, fontSize: 7 }}>{show(row.pick(month))}</Text>
              </View>
            ))}
            <View style={{ ...s.cell, width: monthWidth, paddingHorizontal: 0 }}>
              <Text style={{ ...s.center, ...s.bold, fontSize: 7 }}>{show(row.pick(data.attendanceTotal))}</Text>
            </View>
          </View>
        ))}
      </View>

      {on(settings.show_parent_signatures) && (
        <View style={{ marginTop: 26 }}>
          <Text style={s.heading}>PARENT/GUARDIAN&apos;S SIGNATURE</Text>
          {['1st Grading', '2nd Grading', '3rd Grading', '4th Grading'].map((label) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 14 }}>
              <Text style={{ width: 60, ...s.bold }}>{label}</Text>
              <View style={s.line} />
            </View>
          ))}
        </View>
      )}

      {on(settings.show_promotion_certificate) && (
        <View style={{ marginTop: 28 }}>
          <Text style={s.heading}>CERTIFICATE OF PROMOTION</Text>
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <Field label="Promoted to:" value={data.promotedTo} />
          </View>
          <View style={{ flexDirection: 'row', marginTop: 6, width: '60%' }}>
            <Field label="Date:" value="" />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
            <Signature name={data.teacherName} role="ADVISER" />
            <Signature name={data.principalName} role="PRINCIPAL" />
          </View>
        </View>
      )}

      {on(settings.show_transfer_cancellation) && (
        <View style={{ marginTop: 28 }}>
          <Text style={s.heading}>CANCELLATION OF TRANSFER OF ELIGIBILITY</Text>
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <Field label="Has been admitted to:" value="" bold={false} />
          </View>
          <View style={{ flexDirection: 'row', marginTop: 6, width: '60%' }}>
            <Field label="Date:" value="" bold={false} />
          </View>
          <View style={{ flexDirection: 'row', marginTop: 6, width: '80%' }}>
            <Field label="Confirmed by:" value="" bold={false} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
            <Signature name="" role="ADVISER" />
            <Signature name="" role="PRINCIPAL" />
          </View>
        </View>
      )}
    </View>
  )
}

// ── Page 1, right: the cover ───────────────────────────────────────────────

function Cover({ data, settings }: { data: ShsCardData; settings: Record<string, ReportCardSettingValue> }) {
  const paragraphs = str(settings.letter_body)
    .replace(/\{school\}/g, data.schoolName)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
  const schoolNameSize = fitPdfSingleLineFontSizePx(data.schoolName, 330, 16, 9)

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', width: '100%' }}>
        <Text style={{ fontSize: 7, ...s.bold }}>{str(settings.form_label)}</Text>
      </View>

      {on(settings.show_deped_header) && (
        <View style={{ alignItems: 'center', marginTop: 2 }}>
          <Image src={DEPED_LOGO_URL} style={{ width: 40, height: 40, objectFit: 'contain', marginBottom: 3 }} />
          {str(settings.deped_header)
            .split('\n')
            .filter((line) => line.trim())
            .map((line, index) => (
              <Text key={index} style={{ fontSize: 8, ...(index > 0 ? s.bold : {}) }}>{line.trim()}</Text>
            ))}
        </View>
      )}

      {data.schoolLogoUrl ? (
        <Image src={data.schoolLogoUrl} style={{ width: 72, height: 72, objectFit: 'contain', marginTop: 10 }} />
      ) : null}

      <Text style={{ fontFamily: 'Times-Bold', fontSize: schoolNameSize, marginTop: 6, textAlign: 'center' }}>
        {data.schoolName}
      </Text>
      {str(settings.school_subtitle).trim() !== '' && (
        <Text style={{ fontSize: 8.5, ...s.italic, marginTop: 1 }}>{str(settings.school_subtitle)}</Text>
      )}
      <Text style={{ fontSize: 10, ...s.bold, marginTop: 8 }}>{str(settings.card_title)}</Text>
      {str(settings.curriculum_label).trim() !== '' && <Text style={{ fontSize: 8 }}>{str(settings.curriculum_label)}</Text>}
      <Text style={{ fontSize: 8, ...s.bold, marginTop: 3 }}>School Year {data.schoolYear}</Text>

      <View style={{ width: '100%', marginTop: 16 }}>
        <View style={{ flexDirection: 'row' }}>
          <Field label="NAME" value={data.studentName} />
        </View>
        <View style={{ flexDirection: 'row', marginTop: 7 }}>
          <Field label="BIRTH DATE" value={data.birthDate} grow={2.2} />
          <Field label="AGE" value={data.age} grow={0.7} />
          <Field label="GENDER" value={data.gender} grow={1.2} />
        </View>
        <View style={{ flexDirection: 'row', marginTop: 7 }}>
          <Field label="GRADE/SECTION" value={data.gradeSection} grow={1.6} />
          <Field label="LRN" value={data.lrn} grow={1.2} />
        </View>
        <View style={{ flexDirection: 'row', marginTop: 7 }}>
          <Field label="TEACHER" value={data.teacherName} />
        </View>
      </View>

      <View style={{ width: '100%', marginTop: 16 }}>
        {str(settings.letter_greeting).trim() !== '' && (
          <Text style={{ ...s.bold, marginBottom: 4 }}>{str(settings.letter_greeting)}</Text>
        )}
        {paragraphs.map((paragraph, index) => (
          <Text key={index} style={{ textIndent: 18, textAlign: 'justify', fontSize: 8, marginBottom: 6 }}>
            {paragraph}
          </Text>
        ))}
      </View>

      <View style={{ width: '100%', alignItems: 'flex-end', marginTop: 6 }}>
        <View style={{ width: '52%', alignItems: 'center' }}>
          {str(settings.letter_closing).trim() !== '' && (
            <Text style={{ alignSelf: 'flex-start', marginBottom: 10 }}>{str(settings.letter_closing)}</Text>
          )}
          <Signature name={data.principalName} role="Principal" />
        </View>
      </View>
    </View>
  )
}

// ── Page 2, left: the two semesters ────────────────────────────────────────

const SUBJECT_WIDTH = '62%'
const QUARTER_WIDTH = '11%'
const FINAL_WIDTH = '16%'

function SemesterTable({ semester }: { semester: ShsSemester }) {
  const empty = semester.groups.every((group) => group.rows.length === 0)
  return (
    <View style={{ marginTop: 6 }} wrap={false}>
      <Text style={s.subheading}>{semester.label}</Text>
      <View style={s.table}>
        <View style={s.row}>
          <View style={{ ...s.cell, width: SUBJECT_WIDTH }}>
            <Text style={{ ...s.center, ...s.bold }}>Subjects</Text>
          </View>
          <View style={{ width: `${11 * 2}%` }}>
            <View style={{ ...s.cell }}>
              <Text style={{ ...s.center, ...s.bold }}>Quarter</Text>
            </View>
            <View style={s.row}>
              {semester.quarterLabels.map((quarter) => (
                <View key={quarter} style={{ ...s.cell, width: '50%' }}>
                  <Text style={{ ...s.center, ...s.bold }}>{quarter}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={{ ...s.cell, width: FINAL_WIDTH }}>
            <Text style={{ ...s.center, ...s.bold, fontSize: 6.5 }}>Semester Final Grade</Text>
          </View>
        </View>

        {semester.groups.map((group, groupIndex) => (
          <View key={groupIndex}>
            {group.label && (
              <View style={s.row}>
                <View style={{ ...s.cell, width: '100%' }}>
                  <Text style={s.bold}>{group.label}</Text>
                </View>
              </View>
            )}
            {group.rows.map((row) => (
              <View key={row.key} style={s.row}>
                <View style={{ ...s.cell, width: SUBJECT_WIDTH }}>
                  <Text style={{ paddingLeft: row.isChild ? 10 : 0, fontSize: 7 }}>{row.title}</Text>
                </View>
                {row.quarters.map((grade, index) => (
                  <View key={index} style={{ ...s.cell, width: QUARTER_WIDTH }}>
                    <Text style={s.center}>{show(grade)}</Text>
                  </View>
                ))}
                <View style={{ ...s.cell, width: FINAL_WIDTH }}>
                  <Text style={{ ...s.center, ...s.bold }}>{show(row.final)}</Text>
                </View>
              </View>
            ))}
          </View>
        ))}

        {empty && (
          <View style={s.row}>
            <View style={{ ...s.cell, width: '100%', paddingVertical: 6 }}>
              <Text style={{ ...s.center, ...s.italic, color: '#555' }}>No subjects this semester</Text>
            </View>
          </View>
        )}

        <View style={s.row}>
          <View style={{ ...s.cell, width: `${62 + 22}%`, alignItems: 'flex-end' }}>
            <Text style={s.bold}>General Average for the Semester</Text>
          </View>
          <View style={{ ...s.cell, width: FINAL_WIDTH }}>
            <Text style={{ ...s.center, ...s.bold }}>{show(semester.generalAverage)}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

function ProgressReport({ data, settings }: { data: ShsCardData; settings: Record<string, ReportCardSettingValue> }) {
  return (
    <View>
      {on(settings.show_track_strand) && (
        <Text style={{ fontSize: 7.5, marginBottom: 3 }}>
          <Text style={s.bold}>Track/Strand: </Text>
          {data.trackStrand}
        </Text>
      )}
      <Text style={s.heading}>{str(settings.progress_title)}</Text>
      {data.semesters.map((semester) => (
        <SemesterTable key={semester.label} semester={semester} />
      ))}
    </View>
  )
}

// ── Page 2, right: observed values and legends ─────────────────────────────

const OBSERVED_VALUE_LEGEND: [string, string][] = [
  ['AO', 'Always Observed'],
  ['SO', 'Sometimes Observed'],
  ['RO', 'Rarely Observed'],
  ['NO', 'Not Observed'],
]

const PROGRESS_LEGEND: [string, string, string][] = [
  ['Outstanding', '90-100', 'Passed'],
  ['Very Satisfactory', '85-89', 'Passed'],
  ['Satisfactory', '80-84', 'Passed'],
  ['Fairly Satisfactory', '75-79', 'Passed'],
  ['Did Not Meet Expectations', 'Below 75', 'Failed'],
]

function ObservedValues({ data }: { data: ShsCardData }) {
  // Core value 20%, statement 48%, four quarters of 8% — the statement rows
  // sit inside the remaining 80%, so there they are 60% and 10% each.
  const valueWidth = '20%'
  const statementWidth = '48%'
  return (
    <View>
      <Text style={s.heading}>REPORT ON LEARNER&apos;S OBSERVED VALUES</Text>
      <View style={s.table}>
        <View style={s.row}>
          <View style={{ ...s.cell, width: valueWidth }}>
            <Text style={{ ...s.center, ...s.bold }}>Core Values</Text>
          </View>
          <View style={{ ...s.cell, width: statementWidth }}>
            <Text style={{ ...s.center, ...s.bold }}>Behavior Statements</Text>
          </View>
          <View style={{ width: '32%' }}>
            <View style={s.cell}>
              <Text style={{ ...s.center, ...s.bold }}>Quarter</Text>
            </View>
            <View style={s.row}>
              {['1', '2', '3', '4'].map((quarter) => (
                <View key={quarter} style={{ ...s.cell, width: '25%' }}>
                  <Text style={{ ...s.center, ...s.bold }}>{quarter}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
        {data.coreValues.map((value) => (
          <View key={value.coreValue} style={s.row}>
            <View style={{ ...s.cell, width: valueWidth, justifyContent: 'flex-start' }}>
              <Text style={s.bold}>{`${value.number}. ${value.coreValue}`}</Text>
            </View>
            <View style={{ width: '80%' }}>
              {value.statements.map((statement, index) => (
                <View key={index} style={s.row}>
                  <View style={{ ...s.cell, width: '60%', paddingVertical: 5 }}>
                    <Text style={{ fontSize: 6.5 }}>{statement.text}</Text>
                  </View>
                  {statement.markings.map((mark, quarterIndex) => (
                    <View key={quarterIndex} style={{ ...s.cell, width: '10%' }}>
                      <Text style={s.center}>{mark}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', marginTop: 16 }}>
        <View style={{ width: '50%' }}>
          <Text style={{ ...s.bold, marginBottom: 2 }}>Observed Values</Text>
          <View style={s.row}>
            <Text style={{ width: '30%', ...s.bold }}>Marking</Text>
            <Text style={{ ...s.bold }}>Non-numerical Rating</Text>
          </View>
          {OBSERVED_VALUE_LEGEND.map(([mark, meaning]) => (
            <View key={mark} style={s.row}>
              <Text style={{ width: '30%' }}>{mark}</Text>
              <Text>{meaning}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <Text style={{ ...s.bold, marginBottom: 2 }}>Learner Progress and Achievement</Text>
        <View style={s.row}>
          <Text style={{ width: '50%', ...s.bold }}>Descriptors</Text>
          <Text style={{ width: '25%', ...s.bold }}>Grading Scale</Text>
          <Text style={{ width: '25%', ...s.bold }}>Remarks</Text>
        </View>
        {PROGRESS_LEGEND.map(([descriptor, scale, remark]) => (
          <View key={descriptor} style={s.row}>
            <Text style={{ width: '50%' }}>{descriptor}</Text>
            <Text style={{ width: '25%' }}>{scale}</Text>
            <Text style={{ width: '25%' }}>{remark}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export function ShsSemestralDocument({
  data,
  settings,
}: {
  data: ShsCardData
  settings: Record<string, ReportCardSettingValue>
}) {
  const size = (['LETTER', 'FOLIO', 'LEGAL', 'A4'].includes(str(settings.paper_size)) ? str(settings.paper_size) : 'LETTER') as
    | 'LETTER'
    | 'FOLIO'
    | 'LEGAL'
    | 'A4'

  return (
    <Document title={`Report Card - ${data.studentName}`}>
      <Page size={size} orientation="landscape" style={s.page}>
        <View style={{ ...s.half, ...s.halfLeft }}>
          <AttendanceAndCertificates data={data} settings={settings} />
        </View>
        <View style={s.half}>
          <Cover data={data} settings={settings} />
        </View>
      </Page>
      <Page size={size} orientation="landscape" style={s.page}>
        <View style={{ ...s.half, ...s.halfLeft }}>
          <ProgressReport data={data} settings={settings} />
        </View>
        <View style={s.half}>
          <ObservedValues data={data} />
        </View>
      </Page>
    </Document>
  )
}
