import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { StudentNOAResponse } from '../types'
import { buildBillingStatement } from './studentBillingStatement'
import { describeCoveredPeriods } from './studentNOAStatement'

const INK = '#111827'
const RULE = '#111827'
// The rows a payer looks for first — what was assessed and what to pay now.
const HIGHLIGHT = '#FDF0D5'

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    padding: 18,
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    color: INK,
  },
  frame: {
    borderWidth: 1,
    borderColor: RULE,
    padding: 10,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 38,
    height: 38,
    objectFit: 'contain',
  },
  // Balances the logo so the letterhead stays centred on the sheet.
  headerSpacer: {
    width: 38,
  },
  headerText: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  institutionTitle: {
    fontSize: 11.5,
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  institutionMeta: {
    fontSize: 7.5,
    marginTop: 1,
    textAlign: 'center',
  },
  docTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 6,
  },
  docDate: {
    fontSize: 8,
    textAlign: 'right',
    marginTop: 2,
    marginBottom: 6,
  },

  infoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  infoName: {
    width: '60%',
    fontWeight: 'bold',
    fontSize: 9,
  },
  infoGrade: {
    width: '40%',
    fontWeight: 'bold',
    fontSize: 9,
    textAlign: 'right',
  },

  table: {
    borderWidth: 1,
    borderColor: RULE,
  },
  row: {
    flexDirection: 'row',
    minHeight: 15,
    borderBottomWidth: 0.75,
    borderBottomColor: RULE,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowHighlight: {
    backgroundColor: HIGHLIGHT,
  },
  cell: {
    paddingVertical: 2.5,
    paddingHorizontal: 3,
    justifyContent: 'center',
    borderRightWidth: 0.75,
    borderRightColor: RULE,
  },
  cellLast: {
    borderRightWidth: 0,
  },
  colDate: { width: '20%' },
  colParticulars: { width: '30%' },
  colOr: { width: '22%' },
  colTotal: { width: '28%' },
  head: {
    fontWeight: 'bold',
    textAlign: 'center',
  },
  center: { textAlign: 'center' },
  bold: { fontWeight: 'bold' },
  amount: { textAlign: 'right' },

  summary: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: RULE,
  },
  summaryRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: RULE,
    minHeight: 15,
  },
  summaryLabel: {
    width: '72%',
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    textAlign: 'right',
    borderRightWidth: 0.75,
    borderRightColor: RULE,
  },
  summaryValue: {
    width: '28%',
    paddingVertical: 2.5,
    paddingHorizontal: 3,
    textAlign: 'right',
    fontWeight: 'bold',
  },
  dueLabel: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  dueValue: {
    fontSize: 10,
  },

  notes: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: RULE,
  },
  noteRow: {
    borderBottomWidth: 0.75,
    borderBottomColor: RULE,
    paddingVertical: 2.5,
    paddingHorizontal: 4,
  },
  noteRowLast: {
    borderBottomWidth: 0,
  },
  noteCenter: {
    fontSize: 8,
    textAlign: 'center',
  },
  noteSmall: {
    fontSize: 6.5,
    textAlign: 'center',
  },
  noteLeft: {
    fontSize: 7,
  },
})

interface StudentBillingStatementPDFProps {
  data: StudentNOAResponse
  institutionName?: string
  institutionAddress?: string
  // Blob URL from useInstitutionLogo — react-pdf cannot authenticate an image request.
  logoUrl?: string | null
  // Installment being billed; null bills the whole balance.
  installmentSequence?: number | null
  preparedBy?: string
}

const formatAmount = (amount?: number | null) =>
  Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

// Signed figures print in parentheses, the way the school's own sheet shows a deduction.
const formatSigned = (amount: number) =>
  amount < 0 ? `(${formatAmount(Math.abs(amount))})` : formatAmount(amount)

const formatDate = (value?: string | null, month: 'short' | 'long' = 'short') => {
  if (!value) return ''
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month, day: 'numeric', year: 'numeric' })
}

interface StatementRow {
  key: string
  date?: string
  particulars: string
  orNumber?: string
  total: string
  highlight?: boolean
}

export const StudentBillingStatementPDF: React.FC<StudentBillingStatementPDFProps> = ({
  data,
  institutionName,
  institutionAddress,
  logoUrl,
  installmentSequence = null,
  preparedBy,
}) => {
  const { student, academic_year, grade_level } = data
  const statement = buildBillingStatement(data, installmentSequence)
  const { monthly } = statement

  const fullName = `${student.last_name}, ${student.first_name}${
    student.middle_name ? ' ' + student.middle_name : ''
  }${student.ext_name ? ' ' + student.ext_name : ''}`.toUpperCase()

  const rows: StatementRow[] = []
  if (statement.balanceForward > 0) {
    rows.push({
      key: 'balance-forward',
      particulars: 'BALANCE FORWARD',
      total: formatAmount(statement.balanceForward),
    })
  }
  rows.push({
    key: 'payable',
    particulars: 'PAYABLE',
    total: formatAmount(statement.payable),
    highlight: true,
  })
  if (statement.lateFees > 0) {
    rows.push({ key: 'late-fees', particulars: 'LATE FEES', total: formatAmount(statement.lateFees) })
  }
  if (statement.discounts > 0) {
    rows.push({
      key: 'discounts',
      particulars: 'LESS: DISCOUNT',
      total: formatSigned(-statement.discounts),
    })
  }
  statement.payments.forEach((payment) => {
    rows.push({
      key: payment.key,
      date: formatDate(payment.date),
      particulars: 'PAYMENT',
      orNumber: payment.orNumber,
      total: formatAmount(payment.total),
    })
  })

  const dueLabel = monthly
    ? `FOR ${describeCoveredPeriods(monthly).toUpperCase()}`
    : 'AMOUNT DUE'
  const dueDate = monthly ? formatDate(monthly.selected.due_date, 'long') : ''
  const lateFeePercentage = Number(monthly?.selected.late_fee_percentage || 0)

  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <View style={styles.frame}>
          <View style={styles.header}>
            {logoUrl ? <Image src={logoUrl} style={styles.headerLogo} /> : null}
            <View style={styles.headerText}>
              {institutionName ? (
                <Text style={styles.institutionTitle}>{institutionName}</Text>
              ) : null}
              {institutionAddress ? (
                <Text style={styles.institutionMeta}>{institutionAddress}</Text>
              ) : null}
              <Text style={styles.institutionMeta}>S.Y. {academic_year}</Text>
            </View>
            {logoUrl ? <View style={styles.headerSpacer} /> : null}
          </View>

          <Text style={styles.docTitle}>BILLING STATEMENT</Text>
          <Text style={styles.docDate}>
            DATE:{' '}
            {new Date()
              .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              .toUpperCase()}
          </Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoName}>Name: {fullName}</Text>
            <Text style={styles.infoGrade}>Grade/Level: {(grade_level || '').toUpperCase()}</Text>
          </View>

          <View style={styles.table}>
            <View style={styles.row}>
              <View style={[styles.cell, styles.colDate]}>
                <Text style={styles.head}>Date</Text>
              </View>
              <View style={[styles.cell, styles.colParticulars]}>
                <Text style={styles.head}>Particulars</Text>
              </View>
              <View style={[styles.cell, styles.colOr]}>
                <Text style={styles.head}>OR No</Text>
              </View>
              <View style={[styles.cell, styles.cellLast, styles.colTotal]}>
                <Text style={styles.head}>Total</Text>
              </View>
            </View>

            {rows.map((row, index) => (
              <View
                key={row.key}
                style={[
                  styles.row,
                  ...(row.highlight ? [styles.rowHighlight] : []),
                  ...(index === rows.length - 1 ? [styles.rowLast] : []),
                ]}
              >
                <View style={[styles.cell, styles.colDate]}>
                  <Text style={styles.center}>{row.date ?? ''}</Text>
                </View>
                <View style={[styles.cell, styles.colParticulars]}>
                  <Text style={[styles.center, styles.bold]}>{row.particulars}</Text>
                </View>
                <View style={[styles.cell, styles.colOr]}>
                  <Text style={styles.center}>{row.orNumber ?? ''}</Text>
                </View>
                <View style={[styles.cell, styles.cellLast, styles.colTotal]}>
                  <Text style={styles.amount}>{row.total}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>TOTAL AMOUNT PAID</Text>
              <Text style={styles.summaryValue}>{formatAmount(statement.totalPaid)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>BALANCE FOR S.Y. {academic_year}</Text>
              <Text style={styles.summaryValue}>{formatSigned(statement.balance)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.rowHighlight, styles.rowLast]}>
              <Text style={[styles.summaryLabel, styles.dueLabel]}>{dueLabel}</Text>
              <Text style={[styles.summaryValue, styles.dueValue]}>
                PHP {formatAmount(statement.amountDue)}
              </Text>
            </View>
          </View>

          <View style={styles.notes}>
            {dueDate ? (
              <View style={styles.noteRow}>
                <Text style={styles.noteCenter}>
                  PLEASE SETTLE YOUR PAYMENT ON OR BEFORE {dueDate.toUpperCase()}
                </Text>
              </View>
            ) : null}
            {preparedBy ? (
              <View style={styles.noteRow}>
                <Text style={styles.noteCenter}>Prepared by: {preparedBy}</Text>
              </View>
            ) : null}
            {lateFeePercentage > 0 ? (
              <View style={styles.noteRow}>
                <Text style={styles.noteSmall}>
                  "A LATE PAYMENT FEE of {lateFeePercentage}% shall be charged if installment
                  payments are not paid/settled on or before the specific due dates."
                </Text>
              </View>
            ) : null}
            <View style={[styles.noteRow, styles.noteRowLast]}>
              <Text style={styles.noteLeft}>
                KINDLY DISREGARD THIS NOTICE IF PAYMENT HAS ALREADY BEEN MADE
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
