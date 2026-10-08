import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { MatatagPaceArea, MatatagPaceRow, MatatagProgressReport, MatatagReportLearner } from '../../../types'
// Registers how report card words break; see the note there.
import { estimatePdfBlockHeightPt, fitPdfBlockFontSizePx } from '../../../utils/reportCardPdfUtils'
import { bandRowsByDomain, formatLearnerName, rowLabel, rowText } from '../../matatagReports/matatagPdfShared'
import type { ReportCardSettingValue } from '../layouts'

/**
 * The Kindergarten Progress Report, as one sheet printed landscape on both
 * sides and folded in three.
 *
 *   Page 1 (outside): attendance and certificate of transfer | the teacher's
 *                     remarks for each term | the cover.
 *   Page 2 (inside):  every developmental competency with its T1 / T2 / T3
 *                     rating, flowed down three panels.
 *
 * It draws the same MATATAG payload as DepEd's own Kindergarten card — the
 * competencies, ratings, scale and months all come from the server — so this
 * is a different face on one record, never a second record. Only the wording
 * around them is the school's, from the template's settings.
 */

const DEPED_LOGO_URL = '/deped-logo.png'
const TITLE_ART_URL = '/kindergarten-progress-report-title.png'
/** The artwork's own proportions, 261 × 53. */
const TITLE_ART_RATIO = 53 / 261

/** Landscape points, which is what react-pdf measures in. */
const PAGE_SIZES = {
  A4: { width: 841.89, height: 595.28 },
  LETTER: { width: 792, height: 612 },
  FOLIO: { width: 936, height: 612 },
  LEGAL: { width: 1008, height: 612 },
} as const
type PaperSize = keyof typeof PAGE_SIZES

const PANEL_PADDING_X = 16
const PANEL_PADDING_Y = 16
const RATING_WIDTH = 19
const RULE = '#4b5563'
const GRID = '0.6pt solid #6b7280'

const REMARK_LINES = 5
const REMARK_LINE_HEIGHT = 15

const s = StyleSheet.create({
  page: { flexDirection: 'row', fontFamily: 'Helvetica', fontSize: 7.5, color: '#111' },
  panel: { paddingHorizontal: PANEL_PADDING_X, paddingVertical: PANEL_PADDING_Y },
  fold: { borderRight: '0.5pt dashed #c4c4c4' },
  heading: { fontFamily: 'Helvetica-Bold', fontSize: 11, textAlign: 'center' },
  bold: { fontFamily: 'Helvetica-Bold' },
  italic: { fontFamily: 'Helvetica-Oblique' },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row' },
  cell: { borderRight: GRID, borderBottom: GRID, paddingHorizontal: 3, paddingVertical: 2, justifyContent: 'center' },
  line: { borderBottom: `0.6pt solid ${RULE}`, flexGrow: 1, minHeight: 10, marginLeft: 3, paddingLeft: 2, justifyContent: 'flex-end' },
})

const str = (value: ReportCardSettingValue | undefined) => String(value ?? '')
const on = (value: ReportCardSettingValue | undefined) => value === true || value === 'true' || value === 1 || value === '1'
const colour = (value: ReportCardSettingValue | undefined, fallback: string) =>
  /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(str(value).trim()) ? str(value).trim() : fallback

interface Theme {
  heading: string
  band: string
  domain: string
}

type Settings = Record<string, ReportCardSettingValue>

export function KinderTrifoldDocument({
  report,
  learners,
  settings,
  schoolLogoUrl,
}: {
  report: MatatagProgressReport
  /** Omit to print every learner in the payload, one sheet each. */
  learners?: MatatagReportLearner[]
  settings: Settings
  schoolLogoUrl?: string | null
}) {
  const paper: PaperSize = str(settings.paper_size) in PAGE_SIZES ? (str(settings.paper_size) as PaperSize) : 'A4'
  const page = PAGE_SIZES[paper]
  const panelWidth = page.width / 3
  const theme: Theme = {
    heading: colour(settings.heading_color, '#1f2a9e'),
    band: colour(settings.band_color, '#2633c4'),
    domain: colour(settings.domain_color, '#fdf6c3'),
  }

  const terms = report.legend.terms.length > 0 ? report.legend.terms.map(t => t.value) : [1, 2, 3]
  const columns = splitIntoPanels(
    competencyItems(report.pace.learning_areas),
    panelWidth - PANEL_PADDING_X * 2 - RATING_WIDTH * terms.length,
    page.height - PANEL_PADDING_Y * 2 - 40
  )
  const cards = learners ?? report.learners
  const title = str(settings.card_title) || 'Kindergarten Progress Report'

  return (
    <Document title={`${title} — ${report.section.title}`} author={report.school.name ?? 'ScholasticCloud'}>
      {cards.map(learner => {
        const panel = { ...s.panel, width: panelWidth, height: page.height }
        return [
          <Page key={`${learner.student.id}-out`} size={paper} orientation="landscape" style={s.page}>
            <View style={[panel, s.fold]}>
              <Attendance learner={learner} theme={theme} />
              {on(settings.show_certificate) && <Certificate settings={settings} theme={theme} />}
            </View>
            <View style={[panel, s.fold]}>
              <Remarks learner={learner} settings={settings} theme={theme} width={panelWidth - PANEL_PADDING_X * 2} />
            </View>
            <View style={panel}>
              <Cover report={report} learner={learner} settings={settings} theme={theme} schoolLogoUrl={schoolLogoUrl} />
            </View>
          </Page>,
          <Page key={`${learner.student.id}-in`} size={paper} orientation="landscape" style={s.page}>
            {columns.map((column, index) => (
              <View key={index} style={[panel, index < columns.length - 1 ? s.fold : {}]}>
                <CompetencyPanel
                  column={column}
                  learner={learner}
                  terms={terms}
                  theme={theme}
                  title={column.soleArea ? column.soleArea.toUpperCase() : str(settings.competencies_title)}
                />
              </View>
            ))}
          </Page>,
        ]
      })}
    </Document>
  )
}

// ── Competencies ────────────────────────────────────────────────────────────

type Item =
  | { kind: 'area'; text: string; area: string }
  | { kind: 'domain'; text: string; area: string }
  | { kind: 'row'; row: MatatagPaceRow; area: string; domain: string | null }

interface Column {
  items: Item[]
  /** Set when every competency in the panel is one area's; the panel is then titled with it. */
  soleArea: string | null
  /** A row's top and bottom padding, shrunk until the catalog fits the sheet. */
  padding: number
}

/**
 * The catalog as one list of bands and rows in print order.
 *
 * DepEd splits "D. Reading" into three bands; the card prints them as one
 * heading — "D. Reading – Phonological/Phonemic Awareness; Letter Knowledge;
 * Letter Sound Relationship" — so consecutive bands under one parent are
 * merged here.
 */
function competencyItems(areas: MatatagPaceArea[]): Item[] {
  const items: Item[] = []

  areas.forEach(area => {
    items.push({ kind: 'area', text: area.title, area: area.title })

    const groups: Array<{ parent: string | null; children: string[]; rows: MatatagPaceRow[] }> = []
    bandRowsByDomain(area.rows, area).forEach(band => {
      const [parent, child] = splitDomainTitle(band.title)
      const last = groups[groups.length - 1]
      if (last && parent !== null && last.parent === parent) {
        if (child) last.children.push(child)
        last.rows.push(...band.rows)
      } else {
        groups.push({ parent, children: child ? [child] : [], rows: [...band.rows] })
      }
    })

    groups.forEach(group => {
      const heading = group.parent
        ? group.children.length > 0
          ? `${group.parent} – ${group.children.join('; ')}`
          : group.parent
        : null
      if (heading) items.push({ kind: 'domain', text: heading, area: area.title })
      group.rows.forEach(row => items.push({ kind: 'row', row, area: area.title, domain: heading }))
    })
  })

  return items
}

/** 'D. Reading — Letter Knowledge' → ['D. Reading', 'Letter Knowledge']. */
function splitDomainTitle(title: string | null): [string | null, string | null] {
  if (!title) return [null, null]
  const index = title.indexOf(' — ')
  return index === -1 ? [title, null] : [title.slice(0, index), title.slice(index + 3)]
}

const ROW_FONT = 6.8
const BAND_FONT = 7.2

function itemHeight(item: Item, textWidth: number, padding: number): number {
  if (item.kind === 'row') {
    const text = `${rowLabel(item.row)}. ${rowText(item.row)}`
    return Math.max(estimatePdfBlockHeightPt(text, textWidth - 6, ROW_FONT, 1.2) + padding * 2, 12)
  }
  return estimatePdfBlockHeightPt(item.text, textWidth + RATING_WIDTH * 3 - 6, BAND_FONT, 1.2) + 4
}

/**
 * Flow the competencies down three panels of roughly equal height.
 *
 * A panel continuing an area repeats its heading (or, for a panel holding one
 * area only, is titled with it), and never ends on a heading with nothing
 * under it. Row padding shrinks until everything fits, so a longer catalog
 * still prints on one sheet.
 */
function splitIntoPanels(items: Item[], textWidth: number, available: number, panels = 3): Column[] {
  const paddings = [6.5, 5.5, 4.5, 3.5, 2.5, 1.8, 1.2, 0.6]
  let result: Column[] = []

  for (const padding of paddings) {
    const heights = items.map(item => itemHeight(item, textWidth, padding))
    const total = heights.reduce((sum, h) => sum + h, 0)
    const target = total / panels

    const columns: Item[][] = [[]]
    let used = 0
    items.forEach((item, index) => {
      const column = columns[columns.length - 1]
      const h = heights[index]
      if (columns.length < panels && column.length > 0 && used + h / 2 > target) {
        // Carry any trailing headings over with the row they introduce.
        const carried: Item[] = []
        while (column.length > 0 && column[column.length - 1].kind !== 'row') carried.unshift(column.pop()!)
        columns.push(carried)
        used = carried.reduce((sum, c) => sum + heights[items.indexOf(c)], 0)
      }
      columns[columns.length - 1].push(item)
      used += h
    })

    result = columns.map(column => withContinuation(column, padding))
    const fits = result.every(
      column => column.items.reduce((sum, item) => sum + itemHeight(item, textWidth, padding), 0) <= available
    )
    if (fits) break
  }

  return result
}

function withContinuation(items: Item[], padding: number): Column {
  const areas = new Set(items.map(item => item.area))
  const soleArea = areas.size === 1 && items[0]?.kind !== 'area' ? items[0].area : null
  const first = items[0]
  const lead: Item[] = []

  if (first && first.kind !== 'area' && !soleArea) {
    lead.push({ kind: 'area', text: first.area, area: first.area })
  }
  if (first && first.kind === 'row' && first.domain) {
    lead.push({ kind: 'domain', text: first.domain, area: first.area })
  }

  return { items: [...lead, ...items], soleArea, padding }
}

function CompetencyPanel({
  column,
  learner,
  terms,
  theme,
  title,
}: {
  column: Column
  learner: MatatagReportLearner
  terms: number[]
  theme: Theme
  title: string
}) {
  return (
    <View>
      <View style={{ height: 30, justifyContent: 'flex-end', marginBottom: 4 }}>
        <Text style={[s.heading, { color: theme.heading, fontSize: title.length > 40 ? 9.5 : 11 }]}>{title}</Text>
      </View>

      <View style={{ borderTop: GRID, borderLeft: GRID }}>
        <View style={[s.row, { backgroundColor: theme.band }]}>
          <Text style={[s.cell, s.bold, s.center, { flexGrow: 1, color: '#fff', fontSize: 8.5 }]}>Competency</Text>
          {terms.map(term => (
            <Text key={term} style={[s.cell, s.bold, s.center, { width: RATING_WIDTH, color: '#fff', fontSize: 7.5 }]}>
              T{term}
            </Text>
          ))}
        </View>

        {column.items.map((item, index) =>
          item.kind === 'row' ? (
            <View key={index} style={s.row} wrap={false}>
              <View style={[s.cell, { flexGrow: 1, flexBasis: 0, paddingVertical: column.padding }]}>
                <Text style={{ fontSize: ROW_FONT, lineHeight: 1.2 }}>
                  {rowLabel(item.row)}. {rowText(item.row)}
                </Text>
              </View>
              {terms.map(term => {
                const slot = item.row.slots.find(slot => slot.term === term)
                return (
                  <View key={term} style={[s.cell, { width: RATING_WIDTH, alignItems: 'center', paddingHorizontal: 0 }]}>
                    <Text style={[s.bold, { fontSize: 6.8 }]}>{slot ? (learner.pace[slot.id] ?? '') : ''}</Text>
                  </View>
                )
              })}
            </View>
          ) : (
            <View key={index} style={s.row} wrap={false}>
              <Text
                style={[
                  s.cell,
                  {
                    flexGrow: 1,
                    backgroundColor: theme.domain,
                    fontSize: BAND_FONT,
                    lineHeight: 1.2,
                    fontFamily: item.kind === 'area' ? 'Helvetica-Bold' : 'Helvetica',
                  },
                ]}
              >
                {item.text}
              </Text>
            </View>
          )
        )}
      </View>
    </View>
  )
}

// ── Outside: attendance, certificate, remarks ───────────────────────────────

function Attendance({ learner, theme }: { learner: MatatagReportLearner; theme: Theme }) {
  const { months } = learner.attendance
  const widths = ['13%', '30%', '19%', '19%', '19%']
  const headings = ['Term', 'Month', 'No. of Class Days', 'No. of Days Present', 'No. of Times Absent']
  const show = (value: number) => (value ? String(value) : '')

  return (
    <View>
      <Text style={[s.heading, { color: theme.heading, marginBottom: 6 }]}>ATTENDANCE RECORD</Text>
      <View style={{ borderTop: GRID, borderLeft: GRID }}>
        <View style={[s.row, { backgroundColor: theme.band }]}>
          {headings.map((label, index) => (
            <View key={label} style={[s.cell, { width: widths[index], alignItems: 'center' }]}>
              <Text style={{ color: '#fff', fontSize: 6.4, textAlign: 'center' }}>{label}</Text>
            </View>
          ))}
        </View>
        {months.map((month, index) => (
          <View key={`${month.year}-${month.month}`} style={s.row} wrap={false}>
            <Text style={[s.cell, s.center, { width: widths[0], fontSize: 7 }]}>
              {index === 0 || months[index - 1].term !== month.term ? month.term : ''}
            </Text>
            <Text style={[s.cell, { width: widths[1], fontSize: 7 }]}>{month.label}</Text>
            <Text style={[s.cell, s.center, { width: widths[2], fontSize: 7 }]}>{show(month.class_days)}</Text>
            <Text style={[s.cell, s.center, { width: widths[3], fontSize: 7 }]}>{show(month.days_present)}</Text>
            <Text style={[s.cell, s.center, { width: widths[4], fontSize: 7 }]}>{show(month.days_absent)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function Certificate({ settings, theme }: { settings: Settings; theme: Theme }) {
  const blank = { borderBottom: `0.6pt solid ${RULE}`, height: 14 }

  return (
    <View style={{ marginTop: 26 }} wrap={false}>
      <Text style={[s.heading, { color: theme.heading }]}>CERTIFICATE OF TRANSFER</Text>
      <Text style={[s.center, { fontSize: 10, color: theme.heading, marginTop: 3 }]}>This is to certify that</Text>
      <View style={[blank, { marginHorizontal: 12, marginTop: 6 }]} />
      <View style={[s.row, { alignItems: 'flex-end', marginTop: 8 }]}>
        <Text style={{ fontSize: 10, color: theme.heading }}>of</Text>
        <View style={[blank, { flexGrow: 1, marginHorizontal: 4 }]} />
      </View>
      <Text style={[s.center, { fontSize: 10, color: theme.heading, marginTop: 3, lineHeight: 1.4 }]}>
        {str(settings.certificate_text)}
      </Text>

      {['Adviser', 'School Head'].map(role => (
        <View key={role} style={{ alignItems: 'center', marginTop: 24 }}>
          <View style={[blank, { width: '70%' }]} />
          <Text style={[s.italic, { fontSize: 9.5, color: theme.heading, marginTop: 2 }]}>{role}</Text>
        </View>
      ))}
    </View>
  )
}

function Remarks({
  learner,
  settings,
  theme,
  width,
}: {
  learner: MatatagReportLearner
  settings: Settings
  theme: Theme
  width: number
}) {
  const boxHeight = REMARK_LINES * REMARK_LINE_HEIGHT

  return (
    <View>
      <Text style={[s.heading, { color: theme.heading }]}>{str(settings.comments_title)}</Text>
      {str(settings.comments_hint) !== '' && (
        <Text style={[s.center, { fontSize: 6.8, color: theme.heading, marginTop: 1 }]}>{str(settings.comments_hint)}</Text>
      )}

      {learner.narratives.map(narrative => {
        const text = (narrative.comments ?? '').trim()
        const fontSize = text ? fitPdfBlockFontSizePx(text, width - 10, boxHeight - 8, 8.5, 5.5) : 8.5

        return (
          <View key={narrative.term} style={{ marginTop: 12 }} wrap={false}>
            <View style={{ border: GRID }}>
              <Text style={[s.bold, s.center, { backgroundColor: theme.band, color: '#fff', fontSize: 8, paddingVertical: 3 }]}>
                {narrative.label.toUpperCase()}
              </Text>
              {/* Ruled for handwriting until the adviser types the remarks in. */}
              <View style={{ height: boxHeight }}>
                {text !== '' ? (
                  <Text style={{ fontSize, lineHeight: 1.3, paddingHorizontal: 5, paddingVertical: 4 }}>{text}</Text>
                ) : (
                  Array.from({ length: REMARK_LINES }, (_, index) => (
                    <View
                      key={index}
                      style={{ height: REMARK_LINE_HEIGHT, borderTop: index === 0 ? undefined : '0.5pt solid #9ca3af' }}
                    />
                  ))
                )}
              </View>
            </View>
            {on(settings.show_parent_signatures) && (
              <View style={[s.row, { alignItems: 'flex-end', marginTop: 8 }]}>
                <Text style={{ fontSize: 7.5, color: theme.heading }}>Parent&apos;s/Guardian&apos;s Signature:</Text>
                <View style={s.line} />
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

// ── Cover ───────────────────────────────────────────────────────────────────

function Cover({
  report,
  learner,
  settings,
  theme,
  schoolLogoUrl,
}: {
  report: MatatagProgressReport
  learner: MatatagReportLearner
  settings: Settings
  theme: Theme
  schoolLogoUrl?: string | null
}) {
  const student = learner.student
  const schoolName = str(settings.school_name).trim() || report.school.name || ''
  const region = str(settings.region).trim() || report.school.region || ''
  const headerLines = str(settings.deped_header).split('\n').filter(line => line.trim() !== '')
  const title = str(settings.card_title) || 'Kindergarten Progress Report'
  const artWidth = 200

  const caption = (value: string, label: string) => (
    <View style={{ width: 150, alignItems: 'center', marginTop: 4 }}>
      <View style={{ borderBottom: `0.6pt solid ${RULE}`, width: '100%', minHeight: 10, justifyContent: 'flex-end' }}>
        <Text style={[s.center, { fontSize: 7.5 }]}>{value}</Text>
      </View>
      <Text style={{ fontSize: 6.8, color: theme.heading, marginTop: 1 }}>{label}</Text>
    </View>
  )

  return (
    <View>
      <View style={[s.row, { alignItems: 'flex-start', justifyContent: 'space-between' }]}>
        <View style={{ width: 46 }}>
          {on(settings.show_deped_header) && (
            <Image src={DEPED_LOGO_URL} style={{ width: 46, height: 46, objectFit: 'contain' }} />
          )}
        </View>
        <View style={{ alignItems: 'center', flexGrow: 1 }}>
          {on(settings.show_deped_header) &&
            headerLines.map(line => (
              <Text key={line} style={[s.bold, { fontSize: 9.5, color: theme.heading }]}>
                {line}
              </Text>
            ))}
          {caption(region, 'Region')}
          {caption(str(settings.district), 'District')}
        </View>
        <View style={{ width: 46 }}>
          {schoolLogoUrl ? <Image src={schoolLogoUrl} style={{ width: 46, height: 46, objectFit: 'contain' }} /> : null}
        </View>
      </View>

      <Text style={[s.bold, s.center, { fontSize: 13.5, color: theme.heading, marginTop: 8 }]}>{schoolName.toUpperCase()}</Text>
      <View style={{ alignItems: 'center' }}>{caption(str(settings.chapter), 'CHAPTER')}</View>

      <View style={{ alignItems: 'center', marginTop: 6 }}>
        {str(settings.title_style) === 'text' ? (
          <Text style={[s.bold, s.center, { fontSize: 15, color: theme.heading }]}>{title}</Text>
        ) : (
          <Image src={TITLE_ART_URL} style={{ width: artWidth, height: artWidth * TITLE_ART_RATIO }} />
        )}
      </View>

      <View style={[s.row, { justifyContent: 'center', alignItems: 'flex-end', marginTop: 6 }]}>
        <Text style={{ fontSize: 9, color: theme.heading }}>School Year:</Text>
        <View style={{ borderBottom: `0.6pt solid ${RULE}`, width: 90, marginLeft: 3 }}>
          <Text style={[s.center, { fontSize: 9 }]}>{report.academic_year}</Text>
        </View>
      </View>

      <View style={{ marginTop: 8 }}>
        {[
          ['Name', formatLearnerName(student)],
          ['LRN', student.lrn ?? ''],
          ['Section', [report.section.grade_level, report.section.title].filter(Boolean).join(' – ')],
          ['Teacher', report.section.adviser?.name ?? ''],
          ['Birthday', formatBirthday(student.birthdate)],
        ].map(([label, value]) => (
          <View key={label} style={[s.row, { alignItems: 'flex-end', marginTop: 2.5 }]}>
            <Text style={{ fontSize: 9.5, color: theme.heading, width: 46 }}>{label}:</Text>
            <View style={s.line}>
              <Text style={[s.bold, { fontSize: 9 }]}>{value}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ marginTop: 6 }}>
        <AgeLine
          label="Age of the Child (Beginning of SY)"
          years={student.age_at_start_of_school_year}
          months={student.age_months_at_start_of_school_year}
          theme={theme}
        />
        <AgeLine
          label="Age of the Child (End of SY)"
          years={student.age_at_end_of_school_year}
          months={student.age_months_at_end_of_school_year}
          theme={theme}
        />
      </View>

      <Text style={{ fontSize: 6.6, lineHeight: 1.3, textAlign: 'justify', marginTop: 6 }}>{str(settings.intro)}</Text>

      <Text style={[s.bold, s.center, { fontSize: 7, marginTop: 5 }]}>{str(settings.scale_note_title)}</Text>
      <Text style={{ fontSize: 6.6, lineHeight: 1.3, textAlign: 'justify' }}>{str(settings.scale_note)}</Text>

      <View style={{ borderTop: GRID, borderLeft: GRID, marginTop: 4, marginHorizontal: 6 }} wrap={false}>
        <View style={[s.row, { backgroundColor: theme.band }]}>
          <Text style={[s.cell, s.bold, s.center, { width: '32%', color: '#fff', fontSize: 7 }]}>Rating</Text>
          <Text style={[s.cell, s.bold, s.center, { width: '68%', color: '#fff', fontSize: 7 }]}>Indicators</Text>
        </View>
        {report.legend.descriptors.map(descriptor => (
          <View key={descriptor.letter} style={s.row}>
            <View style={[s.cell, { width: '32%', alignItems: 'center' }]}>
              <Text style={{ fontSize: 6.8 }}>{descriptor.label}</Text>
              <Text style={{ fontSize: 6.8 }}>({descriptor.letter})</Text>
            </View>
            <View style={[s.cell, { width: '68%' }]}>
              {indicators(descriptor.description).map(line => (
                <Text key={line} style={{ fontSize: 6.2, lineHeight: 1.2 }}>
                  • {line}
                </Text>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

function AgeLine({
  label,
  years,
  months,
  theme,
}: {
  label: string
  years: number | null
  months: number | null
  theme: Theme
}) {
  const blank = (value: number | null, width: number) => (
    <View style={{ borderBottom: `0.6pt solid ${RULE}`, width, marginHorizontal: 2 }}>
      <Text style={[s.center, s.bold, { fontSize: 8 }]}>{value === null || value === undefined ? '' : String(value)}</Text>
    </View>
  )

  return (
    <View style={[s.row, { alignItems: 'flex-end', marginTop: 2 }]}>
      <Text style={{ fontSize: 7.8, color: theme.heading }}>{label}: Years</Text>
      {blank(years, 22)}
      <Text style={{ fontSize: 7.8, color: theme.heading }}>; Months</Text>
      {blank(months, 30)}
    </View>
  )
}

/** The scale's description is sentences; the card prints each as a bullet. */
function indicators(description: string): string[] {
  return description
    .split(/(?<=\.)\s+/)
    .map(line => line.trim())
    .filter(Boolean)
}

/** '2020-06-05' → 'June 5, 2020', read as a calendar date rather than a moment. */
function formatBirthday(value: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '')
  if (!match) return ''
  const month = new Date(2000, Number(match[2]) - 1, 1).toLocaleString('en-US', { month: 'long' })
  return `${month} ${Number(match[3])}, ${match[1]}`
}
