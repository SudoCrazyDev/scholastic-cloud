import React from 'react'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { PayrollSheet, PayrollSheetRow } from '../../../types'
import { parseYmd } from './helpers'

interface PayrollSheetPDFProps {
  sheet: PayrollSheet
}

// The paper form prints bare figures — no peso sign — and leaves a cell blank
// rather than writing a zero into it. Only the TOTAL columns always show 0.00.
const money = (amount: number) =>
  Number(amount)
    ? Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : ''

const moneyAlways = (amount: number) =>
  (Number(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const days = (value: number) =>
  Number.isInteger(value) ? String(value) : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })

// "For the Month of JUNE 2026" when the period sits inside one month,
// otherwise the full range.
const coverageLabel = (from: string, to: string): string => {
  const start = parseYmd(from)
  const end = parseYmd(to)
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `For the Month of ${start
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      .toUpperCase()}`
  }
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  return `For the Period ${fmt(start).toUpperCase()} – ${fmt(end).toUpperCase()}`
}

const BORDER = '#000000'

// Widths of the columns that are always there, in percent of the table.
const FIXED = {
  no: 3.5,
  name: 16,
  workingDays: 6,
  dailyRate: 6,
  salaryEarned: 7.5,
  totalDeduction: 7,
  netCash: 7.5,
  signature: 9.5,
}

const FIXED_TOTAL = Object.values(FIXED).reduce((sum, width) => sum + width, 0)

// Only printed for a period that paid approved overtime.
const OVERTIME_WIDTH = 6

// Landscape A4 less the page's horizontal padding — the width the table spans.
const TABLE_WIDTH_PT = 841.89 - 44

// Headings wrap between words only. react-pdf's own hyphenation would print
// "CASH AD-VANCE" when the whole word fits on the next line; a word that truly
// does not fit is already cut by subHeadingText below.
const wholeWords = (word: string) => [word]

// Uppercase Helvetica-Bold runs about 0.68em per character.
const HEADING_CHAR_EM = 0.68
const MIN_SUB_HEADING = 4.2
const MAX_SUB_HEADING = 6.5

const subColumnPt = (columnWidthPct: number) => (columnWidthPct / 100) * TABLE_WIDTH_PT - 4

// A deduction line is often named like a code — "PHILHEALTH_ABOVE_10K" — so an
// underscore is a word break here, not part of a word.
const headingWords = (label: string) => label.toUpperCase().split(/[\s_]+/).filter(Boolean)

/**
 * A deduction named "PhilHealth" is one unbreakable word that does not fit a
 * sub-column at the base heading size, and react-pdf lets it spill over its
 * neighbour rather than shrink. So size the sub-headings off the longest word
 * that has to fit.
 */
const subHeadingFontSize = (labels: string[], columnWidthPct: number): number => {
  const longestWord = labels
    .flatMap(headingWords)
    .reduce((longest, word) => Math.max(longest, word.length), 1)
  return Math.max(
    MIN_SUB_HEADING,
    Math.min(MAX_SUB_HEADING, subColumnPt(columnWidthPct) / (longestWord * HEADING_CHAR_EM))
  )
}

const subHeadingMaxChars = (columnWidthPct: number, fontSize: number) =>
  Math.max(2, Math.floor(subColumnPt(columnWidthPct) / (fontSize * HEADING_CHAR_EM)))

/**
 * The heading as it prints. A word still too long at the smallest size would
 * spill over the next column — the hyphenation callback registered for the
 * report cards never breaks inside a word — so cut it into hyphenated pieces
 * that do fit, and let the line break between them.
 */
const subHeadingPieces = (label: string, columnWidthPct: number, fontSize: number): string[] => {
  const maxChars = subHeadingMaxChars(columnWidthPct, fontSize)
  return headingWords(label).flatMap((word) => {
    if (word.length <= maxChars) return [word]
    const pieces: string[] = []
    for (let i = 0; i < word.length; i += maxChars - 1) pieces.push(word.slice(i, i + maxChars - 1))
    return pieces.map((piece, i) => (i < pieces.length - 1 ? `${piece}-` : piece))
  })
}

const subHeadingText = (label: string, columnWidthPct: number, fontSize: number): string =>
  subHeadingPieces(label, columnWidthPct, fontSize).join(' ')

/**
 * How many lines a heading wraps to, packing its pieces greedily the way the
 * line breaker will — so the header can grow to fit instead of clipping the
 * last line of a long deduction name.
 */
const subHeadingLineCount = (label: string, columnWidthPct: number, fontSize: number): number => {
  const maxChars = subHeadingMaxChars(columnWidthPct, fontSize)
  let lines = 0
  let used = 0
  for (const piece of subHeadingPieces(label, columnWidthPct, fontSize)) {
    if (lines === 0 || used + 1 + piece.length > maxChars) {
      lines += 1
      used = piece.length
    } else {
      used += 1 + piece.length
    }
  }
  return Math.max(lines, 1)
}

const GROUP_LABEL_HEIGHT = 15
const MIN_HEADER_HEIGHT = 42

/**
 * Same problem one row down: every deduction line an institution uses takes
 * width off the sub-columns, and a figure that does not fit spills over its
 * neighbour instead of shrinking. The widest figure a sub-column prints is a
 * hundred-thousand total — "###,###.00" — and in Helvetica a digit runs
 * 0.556em against 0.278em for the comma and the point.
 */
const WIDEST_FIGURE_EM = 8 * 0.556 + 2 * 0.278

const subFigureFontSize = (columnWidthPct: number): number => {
  const available = (columnWidthPct / 100) * TABLE_WIDTH_PT - 4
  return Math.max(5, Math.min(7.5, available / WIDEST_FIGURE_EM))
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    paddingVertical: 24,
    paddingHorizontal: 22,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: '#000000',
  },
  institution: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  address: {
    fontSize: 9,
    textAlign: 'center',
    marginTop: 1,
  },
  title: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginTop: 8,
  },
  coverage: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    textDecoration: 'underline',
    marginTop: 8,
    marginBottom: 4,
  },
  table: {
    width: '100%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: BORDER,
  },
  headerRow: {
    flexDirection: 'row',
    height: MIN_HEADER_HEIGHT,
  },
  // A header column that spans the whole header height.
  headerCell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    height: '100%',
  },
  // A header column split into a group label with sub-columns beneath it.
  headerGroup: {
    flexDirection: 'column',
    height: '100%',
  },
  headerGroupLabel: {
    height: GROUP_LABEL_HEIGHT,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerGroupSubs: {
    flexDirection: 'row',
    flexGrow: 1,
  },
  headerText: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  // Tall enough for a staff member to sign the row.
  row: {
    flexDirection: 'row',
    minHeight: 22,
  },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    paddingVertical: 3,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 7.5,
  },
  num: {
    fontSize: 7.5,
    textAlign: 'right',
  },
  center: {
    fontSize: 7.5,
    textAlign: 'center',
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  totalsRow: {
    backgroundColor: '#f2f2f2',
  },
  empty: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    paddingVertical: 10,
    paddingHorizontal: 3,
    width: '100%',
    alignItems: 'center',
  },
  certification: {
    marginTop: 10,
    fontSize: 7.5,
  },
  note: {
    marginTop: 8,
    fontSize: 7,
  },
  assumedNote: {
    marginTop: 8,
    fontSize: 7,
    color: '#8a6100',
  },
  signatures: {
    flexDirection: 'row',
    marginTop: 22,
  },
  signature: {
    flexGrow: 1,
    flexBasis: 0,
    paddingHorizontal: 16,
  },
  signatureTitle: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderColor: BORDER,
    height: 24,
    marginTop: 2,
  },
  signatureLabel: {
    fontSize: 7,
    textAlign: 'center',
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 22,
    right: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#555555',
  },
})

/**
 * The whole payroll period on one landscape sheet — the paper "Monthly Summary
 * of Employee's Working Time & Salary". The OTHER BENEFITS and DEDUCTIONS
 * groups grow a sub-column per deduction line the period actually uses, and
 * the two groups share whatever width the fixed columns leave behind.
 */
export const PayrollSheetPDF: React.FC<PayrollSheetPDFProps> = ({ sheet }) => {
  const { institution, period, rows } = sheet
  const benefitColumns = sheet.benefit_columns
  const deductionColumns = sheet.deduction_columns

  // Late and undertime never come off a deduction line — they are taken out of
  // the salary itself. The sheet itemizes them anyway, in the last DEDUCTIONS
  // column, and only for a period that charged one.
  const penaltyColumn = rows.some((row) => row.penalty_charged > 0)

  // Approved overtime is already inside gross pay; the column just breaks it out.
  const overtimeColumn = rows.some((row) => row.overtime_total > 0)

  // OTHER BENEFITS always ends in a TOTAL column. DEDUCTIONS falls back to a
  // single placeholder column when the period has no deduction lines at all.
  const benefitSubs = benefitColumns.length + 1
  const deductionSubs = Math.max(deductionColumns.length + (penaltyColumn ? 1 : 0), 1)
  const fixedTotal = FIXED_TOTAL + (overtimeColumn ? OVERTIME_WIDTH : 0)
  const subWidth = (100 - fixedTotal) / (benefitSubs + deductionSubs)

  // One size for every sub-heading, so the two groups stay visually level.
  const subHeadingLabels = [
    ...benefitColumns.map((c) => c.label),
    'TOTAL',
    ...deductionColumns.map((c) => c.label),
    ...(penaltyColumn ? ['LATE / UNDERTIME'] : []),
  ]
  const subHeading = { fontSize: subHeadingFontSize(subHeadingLabels, subWidth) }

  const heading = (label: string) => subHeadingText(label, subWidth, subHeading.fontSize)

  // Tall enough for the sub-heading that wraps to the most lines.
  const headerHeight = Math.max(
    MIN_HEADER_HEIGHT,
    GROUP_LABEL_HEIGHT +
      6 +
      Math.max(...subHeadingLabels.map((label) => subHeadingLineCount(label, subWidth, subHeading.fontSize))) *
        subHeading.fontSize *
        1.25
  )

  // ...and one size for every figure beneath them.
  const subFigure = { fontSize: subFigureFontSize(subWidth) }

  const pct = (value: number) => `${value}%` as const

  // Rows carrying a day that was priced from the schedule rather than punched.
  // They get an asterisk, and the footnote below the table only prints when at
  // least one row earned it.
  const assumedRows = rows.filter((row) => row.assumed_days > 0).length

  // TOTAL SALARY EARNED is the salary before late and undertime, because the
  // penalty is itemized under DEDUCTIONS instead of being quietly absorbed:
  // salary − (contributions + penalty) is still the same net pay.
  const salaryEarned = (row: PayrollSheetRow) => row.gross_pay + row.penalty_charged
  const totalDeduction = (row: PayrollSheetRow) => row.total_deductions + row.penalty_charged

  const totals = rows.reduce(
    (acc, row) => ({
      benefits: acc.benefits.map((amount, i) => amount + (row.benefits[i] ?? 0)),
      employerShare: acc.employerShare + row.employer_share_total,
      overtime: acc.overtime + row.overtime_total,
      salary: acc.salary + salaryEarned(row),
      deductions: acc.deductions.map((amount, i) => amount + (row.deductions[i] ?? 0)),
      penalty: acc.penalty + row.penalty_charged,
      totalDeductions: acc.totalDeductions + totalDeduction(row),
      net: acc.net + row.net_pay,
    }),
    {
      benefits: benefitColumns.map(() => 0),
      employerShare: 0,
      overtime: 0,
      salary: 0,
      deductions: deductionColumns.map(() => 0),
      penalty: 0,
      totalDeductions: 0,
      net: 0,
    }
  )

  // Repeated at the top of every page — the sheet often runs past one page.
  const tableHeader = (
    <View style={[styles.headerRow, { height: headerHeight }]} fixed>
      <View style={[styles.headerCell, { width: pct(FIXED.no) }]}>
        <Text style={styles.headerText} hyphenationCallback={wholeWords}>NO</Text>
      </View>
      <View style={[styles.headerCell, { width: pct(FIXED.name), alignItems: 'flex-start' }]}>
        <Text style={styles.headerText} hyphenationCallback={wholeWords}>NAME OF EMPLOYEE</Text>
      </View>
      <View style={[styles.headerCell, { width: pct(FIXED.workingDays) }]}>
        <Text style={styles.headerText} hyphenationCallback={wholeWords}>TOTAL NO. OF WORKING DAYS</Text>
      </View>
      <View style={[styles.headerCell, { width: pct(FIXED.dailyRate) }]}>
        <Text style={styles.headerText} hyphenationCallback={wholeWords}>DAILY RATE</Text>
      </View>

      <View style={[styles.headerGroup, { width: pct(subWidth * benefitSubs) }]}>
        <View style={styles.headerGroupLabel}>
          <Text style={styles.headerText} hyphenationCallback={wholeWords}>OTHER BENEFITS</Text>
        </View>
        <View style={styles.headerGroupSubs}>
          {benefitColumns.map((column) => (
            <View key={column.key} style={[styles.headerCell, { width: pct(100 / benefitSubs) }]}>
              <Text style={[styles.headerText, subHeading]} hyphenationCallback={wholeWords}>{heading(column.label)}</Text>
            </View>
          ))}
          <View style={[styles.headerCell, { width: pct(100 / benefitSubs) }]}>
            <Text style={[styles.headerText, subHeading]} hyphenationCallback={wholeWords}>{heading('TOTAL')}</Text>
          </View>
        </View>
      </View>

      {overtimeColumn && (
        <View style={[styles.headerCell, { width: pct(OVERTIME_WIDTH) }]}>
          <Text style={styles.headerText} hyphenationCallback={wholeWords}>OVERTIME PAY</Text>
        </View>
      )}

      <View style={[styles.headerCell, { width: pct(FIXED.salaryEarned) }]}>
        <Text style={styles.headerText} hyphenationCallback={wholeWords}>TOTAL SALARY EARNED</Text>
      </View>

      <View style={[styles.headerGroup, { width: pct(subWidth * deductionSubs) }]}>
        <View style={styles.headerGroupLabel}>
          <Text style={styles.headerText} hyphenationCallback={wholeWords}>DEDUCTIONS</Text>
        </View>
        <View style={styles.headerGroupSubs}>
          {deductionColumns.length === 0 && !penaltyColumn ? (
            <View style={[styles.headerCell, { width: '100%' }]}>
              <Text style={styles.headerText} hyphenationCallback={wholeWords}>—</Text>
            </View>
          ) : (
            deductionColumns.map((column) => (
              <View key={column.key} style={[styles.headerCell, { width: pct(100 / deductionSubs) }]}>
                <Text style={[styles.headerText, subHeading]} hyphenationCallback={wholeWords}>{heading(column.label)}</Text>
              </View>
            ))
          )}
          {penaltyColumn && (
            <View style={[styles.headerCell, { width: pct(100 / deductionSubs) }]}>
              <Text style={[styles.headerText, subHeading]} hyphenationCallback={wholeWords}>{heading('LATE / UNDERTIME')}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.headerCell, { width: pct(FIXED.totalDeduction) }]}>
        <Text style={styles.headerText} hyphenationCallback={wholeWords}>TOTAL DEDUCTION</Text>
      </View>
      <View style={[styles.headerCell, { width: pct(FIXED.netCash) }]}>
        <Text style={styles.headerText} hyphenationCallback={wholeWords}>NET CASH EARNED</Text>
      </View>
      {/* Signed on collection — the sheet doubles as the payout receipt. */}
      <View style={[styles.headerCell, { width: pct(FIXED.signature) }]}>
        <Text style={styles.headerText} hyphenationCallback={wholeWords}>TEACHER SIGNATURE</Text>
      </View>
    </View>
  )

  return (
    <Document
      title={`Payroll — ${period.name}`}
      author={institution.name || 'ScholasticCloud'}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.institution}>{(institution.name || '').toUpperCase()}</Text>
        {institution.address ? <Text style={styles.address}>{institution.address}</Text> : null}
        <Text style={styles.title}>Monthly Summary of Employee's Working Time &amp; Salary</Text>
        <Text style={styles.coverage}>{coverageLabel(period.date_from, period.date_to)}</Text>

        <View style={styles.table}>
          {tableHeader}

          {rows.length === 0 ? (
            <View style={styles.row}>
              <View style={styles.empty}>
                <Text style={styles.cellText}>
                  No payslips in this period yet — generate them from attendance first.
                </Text>
              </View>
            </View>
          ) : (
            rows.map((row) => (
              <View key={row.payslip_id} style={styles.row} wrap={false}>
                <View style={[styles.cell, { width: pct(FIXED.no) }]}>
                  <Text style={styles.center}>{row.no}</Text>
                </View>
                <View style={[styles.cell, { width: pct(FIXED.name) }]}>
                  <Text style={styles.cellText}>{(row.staff_name || '').toUpperCase()}</Text>
                </View>
                <View style={[styles.cell, { width: pct(FIXED.workingDays) }]}>
                  {/* An asterisk where part of the total was assumed rather
                      than punched — explained in the footnote below the table. */}
                  <Text style={styles.center}>
                    {days(row.days_worked)}
                    {row.assumed_days > 0 ? '*' : ''}
                  </Text>
                </View>
                <View style={[styles.cell, { width: pct(FIXED.dailyRate) }]}>
                  <Text style={styles.num}>{moneyAlways(row.daily_rate)}</Text>
                </View>

                {benefitColumns.map((column, index) => (
                  <View key={column.key} style={[styles.cell, { width: pct(subWidth) }]}>
                    <Text style={[styles.num, subFigure]}>{money(row.benefits[index] ?? 0)}</Text>
                  </View>
                ))}
                <View style={[styles.cell, { width: pct(subWidth) }]}>
                  <Text style={[styles.num, subFigure]}>{moneyAlways(row.employer_share_total)}</Text>
                </View>

                {overtimeColumn && (
                  <View style={[styles.cell, { width: pct(OVERTIME_WIDTH) }]}>
                    <Text style={styles.num}>{money(row.overtime_total)}</Text>
                  </View>
                )}

                <View style={[styles.cell, { width: pct(FIXED.salaryEarned) }]}>
                  <Text style={styles.num}>{moneyAlways(salaryEarned(row))}</Text>
                </View>

                {deductionColumns.length === 0 && !penaltyColumn ? (
                  <View style={[styles.cell, { width: pct(subWidth) }]}>
                    <Text style={styles.center}>—</Text>
                  </View>
                ) : (
                  deductionColumns.map((column, index) => (
                    <View key={column.key} style={[styles.cell, { width: pct(subWidth) }]}>
                      <Text style={[styles.num, subFigure]}>{money(row.deductions[index] ?? 0)}</Text>
                    </View>
                  ))
                )}
                {penaltyColumn && (
                  <View style={[styles.cell, { width: pct(subWidth) }]}>
                    <Text style={[styles.num, subFigure]}>{money(row.penalty_charged)}</Text>
                  </View>
                )}

                <View style={[styles.cell, { width: pct(FIXED.totalDeduction) }]}>
                  <Text style={styles.num}>{moneyAlways(totalDeduction(row))}</Text>
                </View>
                <View style={[styles.cell, { width: pct(FIXED.netCash) }]}>
                  <Text style={[styles.num, styles.bold]}>{moneyAlways(row.net_pay)}</Text>
                </View>
                {/* Left blank on purpose — this is where the staff member signs. */}
                <View style={[styles.cell, { width: pct(FIXED.signature) }]} />
              </View>
            ))
          )}

          {rows.length > 0 ? (
            <View style={[styles.row, styles.totalsRow]} wrap={false}>
              <View style={[styles.cell, { width: pct(FIXED.no + FIXED.name + FIXED.workingDays + FIXED.dailyRate) }]}>
                <Text style={[styles.cellText, styles.bold]}>TOTAL — {rows.length} employee(s)</Text>
              </View>
              {benefitColumns.map((column, index) => (
                <View key={column.key} style={[styles.cell, { width: pct(subWidth) }]}>
                  <Text style={[styles.num, styles.bold, subFigure]}>{money(totals.benefits[index] ?? 0)}</Text>
                </View>
              ))}
              <View style={[styles.cell, { width: pct(subWidth) }]}>
                <Text style={[styles.num, styles.bold, subFigure]}>{moneyAlways(totals.employerShare)}</Text>
              </View>
              {overtimeColumn && (
                <View style={[styles.cell, { width: pct(OVERTIME_WIDTH) }]}>
                  <Text style={[styles.num, styles.bold]}>{moneyAlways(totals.overtime)}</Text>
                </View>
              )}
              <View style={[styles.cell, { width: pct(FIXED.salaryEarned) }]}>
                <Text style={[styles.num, styles.bold]}>{moneyAlways(totals.salary)}</Text>
              </View>
              {deductionColumns.length === 0 && !penaltyColumn ? (
                <View style={[styles.cell, { width: pct(subWidth) }]}>
                  <Text style={styles.center}>—</Text>
                </View>
              ) : (
                deductionColumns.map((column, index) => (
                  <View key={column.key} style={[styles.cell, { width: pct(subWidth) }]}>
                    <Text style={[styles.num, styles.bold, subFigure]}>{money(totals.deductions[index] ?? 0)}</Text>
                  </View>
                ))
              )}
              {penaltyColumn && (
                <View style={[styles.cell, { width: pct(subWidth) }]}>
                  <Text style={[styles.num, styles.bold, subFigure]}>{money(totals.penalty)}</Text>
                </View>
              )}
              <View style={[styles.cell, { width: pct(FIXED.totalDeduction) }]}>
                <Text style={[styles.num, styles.bold]}>{moneyAlways(totals.totalDeductions)}</Text>
              </View>
              <View style={[styles.cell, { width: pct(FIXED.netCash) }]}>
                <Text style={[styles.num, styles.bold]}>{moneyAlways(totals.net)}</Text>
              </View>
              <View style={[styles.cell, { width: pct(FIXED.signature) }]} />
            </View>
          ) : null}
        </View>

        {penaltyColumn && (
          <Text style={styles.note}>
            Late and undertime are charged under DEDUCTIONS, so TOTAL SALARY EARNED is the salary
            before those penalties
            {overtimeColumn ? ', overtime pay included' : ''}.
          </Text>
        )}

        {assumedRows > 0 && (
          <Text style={styles.assumedNote}>
            * Includes {assumedRows === 1 ? 'a day' : 'days'} priced from the staff schedule.
            Payroll was prepared before the period closed, so those punches had not yet been
            recorded on the biometric device.
          </Text>
        )}

        <Text style={styles.certification}>
          I certify that the above summary of working time and salaries is true and correct.
        </Text>

        <View style={styles.signatures} wrap={false}>
          <View style={styles.signature}>
            <Text style={styles.signatureTitle}>PREPARED BY:</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>BOOKKEEPER</Text>
          </View>
          <View style={styles.signature}>
            <Text style={styles.signatureTitle}>CHECKED BY:</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>CASHIER</Text>
          </View>
          <View style={styles.signature}>
            <Text style={styles.signatureTitle}>APPROVED BY:</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>SCHOOL ADMINISTRATOR</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {period.name}
            {period.paid_on ? ` · paid ${period.paid_on}` : ''}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export default PayrollSheetPDF
