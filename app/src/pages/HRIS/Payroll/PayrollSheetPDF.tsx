import React from 'react'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { PayrollSheet } from '../../../types'
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
  name: 17,
  workingDays: 6.5,
  dailyRate: 6.5,
  salaryEarned: 8,
  totalDeduction: 7.5,
  netCash: 8,
}

const FIXED_TOTAL = Object.values(FIXED).reduce((sum, width) => sum + width, 0)

// Landscape A4 less the page's horizontal padding — the width the table spans.
const TABLE_WIDTH_PT = 841.89 - 44

/**
 * A deduction named "PhilHealth" is one unbreakable word that does not fit a
 * sub-column at the base heading size, and react-pdf lets it spill over its
 * neighbour rather than shrink. So size the sub-headings off the longest word
 * that has to fit: uppercase Helvetica-Bold runs about 0.68em per character.
 */
const subHeadingFontSize = (labels: string[], columnWidthPct: number): number => {
  const longestWord = labels
    .flatMap((label) => label.toUpperCase().split(/\s+/))
    .reduce((longest, word) => Math.max(longest, word.length), 1)
  const available = (columnWidthPct / 100) * TABLE_WIDTH_PT - 4
  return Math.max(4.2, Math.min(6.5, available / (longestWord * 0.68)))
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
    height: 42,
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
    height: 15,
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
  row: {
    flexDirection: 'row',
    minHeight: 16,
  },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    paddingVertical: 3,
    paddingHorizontal: 3,
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

  // OTHER BENEFITS always ends in a TOTAL column. DEDUCTIONS falls back to a
  // single placeholder column when the period has no deduction lines at all.
  const benefitSubs = benefitColumns.length + 1
  const deductionSubs = Math.max(deductionColumns.length, 1)
  const subWidth = (100 - FIXED_TOTAL) / (benefitSubs + deductionSubs)

  // One size for every sub-heading, so the two groups stay visually level.
  const subHeading = {
    fontSize: subHeadingFontSize(
      [...benefitColumns.map((c) => c.label), 'TOTAL', ...deductionColumns.map((c) => c.label)],
      subWidth
    ),
  }

  const pct = (value: number) => `${value}%` as const

  const totals = rows.reduce(
    (acc, row) => ({
      benefits: acc.benefits.map((amount, i) => amount + (row.benefits[i] ?? 0)),
      employerShare: acc.employerShare + row.employer_share_total,
      gross: acc.gross + row.gross_pay,
      deductions: acc.deductions.map((amount, i) => amount + (row.deductions[i] ?? 0)),
      totalDeductions: acc.totalDeductions + row.total_deductions,
      net: acc.net + row.net_pay,
    }),
    {
      benefits: benefitColumns.map(() => 0),
      employerShare: 0,
      gross: 0,
      deductions: deductionColumns.map(() => 0),
      totalDeductions: 0,
      net: 0,
    }
  )

  // Repeated at the top of every page — the sheet often runs past one page.
  const tableHeader = (
    <View style={styles.headerRow} fixed>
      <View style={[styles.headerCell, { width: pct(FIXED.no) }]}>
        <Text style={styles.headerText}>NO</Text>
      </View>
      <View style={[styles.headerCell, { width: pct(FIXED.name), alignItems: 'flex-start' }]}>
        <Text style={styles.headerText}>NAME OF EMPLOYEE</Text>
      </View>
      <View style={[styles.headerCell, { width: pct(FIXED.workingDays) }]}>
        <Text style={styles.headerText}>TOTAL NO. OF WORKING DAYS</Text>
      </View>
      <View style={[styles.headerCell, { width: pct(FIXED.dailyRate) }]}>
        <Text style={styles.headerText}>DAILY RATE</Text>
      </View>

      <View style={[styles.headerGroup, { width: pct(subWidth * benefitSubs) }]}>
        <View style={styles.headerGroupLabel}>
          <Text style={styles.headerText}>OTHER BENEFITS</Text>
        </View>
        <View style={styles.headerGroupSubs}>
          {benefitColumns.map((column) => (
            <View key={column.key} style={[styles.headerCell, { width: pct(100 / benefitSubs) }]}>
              <Text style={[styles.headerText, subHeading]}>{column.label.toUpperCase()}</Text>
            </View>
          ))}
          <View style={[styles.headerCell, { width: pct(100 / benefitSubs) }]}>
            <Text style={[styles.headerText, subHeading]}>TOTAL</Text>
          </View>
        </View>
      </View>

      <View style={[styles.headerCell, { width: pct(FIXED.salaryEarned) }]}>
        <Text style={styles.headerText}>TOTAL SALARY EARNED</Text>
      </View>

      <View style={[styles.headerGroup, { width: pct(subWidth * deductionSubs) }]}>
        <View style={styles.headerGroupLabel}>
          <Text style={styles.headerText}>DEDUCTIONS</Text>
        </View>
        <View style={styles.headerGroupSubs}>
          {deductionColumns.length === 0 ? (
            <View style={[styles.headerCell, { width: '100%' }]}>
              <Text style={styles.headerText}>—</Text>
            </View>
          ) : (
            deductionColumns.map((column) => (
              <View key={column.key} style={[styles.headerCell, { width: pct(100 / deductionSubs) }]}>
                <Text style={[styles.headerText, subHeading]}>{column.label.toUpperCase()}</Text>
              </View>
            ))
          )}
        </View>
      </View>

      <View style={[styles.headerCell, { width: pct(FIXED.totalDeduction) }]}>
        <Text style={styles.headerText}>TOTAL DEDUCTION</Text>
      </View>
      <View style={[styles.headerCell, { width: pct(FIXED.netCash) }]}>
        <Text style={styles.headerText}>NET CASH EARNED</Text>
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
                  <Text style={styles.center}>{days(row.days_worked)}</Text>
                </View>
                <View style={[styles.cell, { width: pct(FIXED.dailyRate) }]}>
                  <Text style={styles.num}>{moneyAlways(row.daily_rate)}</Text>
                </View>

                {benefitColumns.map((column, index) => (
                  <View key={column.key} style={[styles.cell, { width: pct(subWidth) }]}>
                    <Text style={styles.num}>{money(row.benefits[index] ?? 0)}</Text>
                  </View>
                ))}
                <View style={[styles.cell, { width: pct(subWidth) }]}>
                  <Text style={styles.num}>{moneyAlways(row.employer_share_total)}</Text>
                </View>

                <View style={[styles.cell, { width: pct(FIXED.salaryEarned) }]}>
                  <Text style={styles.num}>{moneyAlways(row.gross_pay)}</Text>
                </View>

                {deductionColumns.length === 0 ? (
                  <View style={[styles.cell, { width: pct(subWidth) }]}>
                    <Text style={styles.center}>—</Text>
                  </View>
                ) : (
                  deductionColumns.map((column, index) => (
                    <View key={column.key} style={[styles.cell, { width: pct(subWidth) }]}>
                      <Text style={styles.num}>{money(row.deductions[index] ?? 0)}</Text>
                    </View>
                  ))
                )}

                <View style={[styles.cell, { width: pct(FIXED.totalDeduction) }]}>
                  <Text style={styles.num}>{moneyAlways(row.total_deductions)}</Text>
                </View>
                <View style={[styles.cell, { width: pct(FIXED.netCash) }]}>
                  <Text style={[styles.num, styles.bold]}>{moneyAlways(row.net_pay)}</Text>
                </View>
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
                  <Text style={[styles.num, styles.bold]}>{money(totals.benefits[index] ?? 0)}</Text>
                </View>
              ))}
              <View style={[styles.cell, { width: pct(subWidth) }]}>
                <Text style={[styles.num, styles.bold]}>{moneyAlways(totals.employerShare)}</Text>
              </View>
              <View style={[styles.cell, { width: pct(FIXED.salaryEarned) }]}>
                <Text style={[styles.num, styles.bold]}>{moneyAlways(totals.gross)}</Text>
              </View>
              {deductionColumns.length === 0 ? (
                <View style={[styles.cell, { width: pct(subWidth) }]}>
                  <Text style={styles.center}>—</Text>
                </View>
              ) : (
                deductionColumns.map((column, index) => (
                  <View key={column.key} style={[styles.cell, { width: pct(subWidth) }]}>
                    <Text style={[styles.num, styles.bold]}>{money(totals.deductions[index] ?? 0)}</Text>
                  </View>
                ))
              )}
              <View style={[styles.cell, { width: pct(FIXED.totalDeduction) }]}>
                <Text style={[styles.num, styles.bold]}>{moneyAlways(totals.totalDeductions)}</Text>
              </View>
              <View style={[styles.cell, { width: pct(FIXED.netCash) }]}>
                <Text style={[styles.num, styles.bold]}>{moneyAlways(totals.net)}</Text>
              </View>
            </View>
          ) : null}
        </View>

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
