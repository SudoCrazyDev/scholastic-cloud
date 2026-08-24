import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'
import type { StudentNOAResponse } from '../types'
import { periodUnpaid, summarizeMonthlyNOA } from './studentNOAStatement'
import type { NOAScopeMode } from './studentNOAStatement'

// Register basic font
Font.register({
  family: 'Helvetica',
  fonts: [
    {
      src: 'https://fonts.gstatic.com/s/helveticaneue/v70/1Ptsg8zYS_SKggPNyC0IT4ttDfA.ttf',
      fontWeight: 'normal',
    },
    {
      src: 'https://fonts.gstatic.com/s/helveticaneue/v70/1Ptsg8zYS_SKggPNyC0IT4ttDfB.ttf',
      fontWeight: 'bold',
    },
  ],
})

const INK = '#111827'
const RULE = '#111827'

// The notice is drawn at one set of proportions and photo-reduced for the smaller page,
// so a quarter-A4 slip reads like the A4 statement rather than a differently-designed
// document. Only lengths scale; widths are percentages and colors are shared.
const buildStyles = (scale: number) => {
  const s = (value: number) => Math.round(value * scale * 100) / 100

  return StyleSheet.create({
    page: {
      flexDirection: 'column',
      backgroundColor: '#ffffff',
      padding: s(14),
      fontFamily: 'Helvetica',
      fontSize: s(9),
      color: INK,
    },
    // The slip is cut from the sheet, so it carries its own edge.
    frame: {
      borderWidth: 1,
      borderColor: RULE,
      padding: s(10),
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerLogo: {
      width: s(42),
      height: s(42),
      objectFit: 'contain',
    },
    // Balances the logo on the opposite side so the wordmark stays centred on the slip
    // rather than on the space the logo leaves behind.
    headerSpacer: {
      width: s(42),
    },
    // flexBasis 0 is what makes this fill the row: left at `auto` the block sizes to its
    // text and the letterhead sits against the logo instead of centred on the slip.
    headerText: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
    },
    institutionTitle: {
      fontSize: s(13),
      fontWeight: 'bold',
      textAlign: 'center',
      textTransform: 'uppercase',
    },
    institutionMeta: {
      fontSize: s(8),
      marginTop: s(1),
      textAlign: 'center',
    },

    docTitle: {
      fontSize: s(13),
      fontWeight: 'bold',
      textAlign: 'center',
      marginTop: s(8),
      marginBottom: s(8),
    },

    infoRow: {
      flexDirection: 'row',
      marginBottom: s(6),
    },
    infoField: {
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    infoFieldWide: {
      width: '58%',
      paddingRight: s(6),
    },
    infoFieldNarrow: {
      width: '42%',
    },
    infoLabel: {
      fontSize: s(9),
    },
    // Grows to fill the row so the rule runs the full width of the field, printed or blank.
    infoValue: {
      flexGrow: 1,
      flexShrink: 1,
      fontSize: s(9),
      borderBottomWidth: 0.75,
      borderBottomColor: RULE,
      paddingLeft: s(3),
      paddingBottom: s(1),
    },

    table: {
      borderWidth: 1,
      borderColor: RULE,
      marginTop: s(4),
    },
    tableRow: {
      flexDirection: 'row',
      minHeight: s(16),
      alignItems: 'stretch',
      borderBottomWidth: 0.75,
      borderBottomColor: RULE,
    },
    tableRowLast: {
      borderBottomWidth: 0,
    },
    cell: {
      paddingVertical: s(3),
      paddingHorizontal: s(4),
      justifyContent: 'center',
    },
    cellDesc: {
      width: '62%',
      borderRightWidth: 0.75,
      borderRightColor: RULE,
      textAlign: 'center',
    },
    cellAmount: {
      width: '38%',
      textAlign: 'right',
    },
    columnHead: {
      fontSize: s(9),
      fontWeight: 'bold',
      textAlign: 'center',
    },
    lineText: {
      fontSize: s(8.5),
      textAlign: 'center',
    },
    lineAmount: {
      fontSize: s(8.5),
      textAlign: 'right',
    },
    totalRow: {
      borderTopWidth: 1,
      borderTopColor: RULE,
    },
    totalText: {
      fontSize: s(9),
      fontWeight: 'bold',
      textAlign: 'center',
    },
    totalAmount: {
      fontSize: s(9),
      fontWeight: 'bold',
      textAlign: 'right',
    },

    otherFees: {
      marginTop: s(8),
    },
    otherFeesTitle: {
      fontSize: s(8.5),
      fontWeight: 'bold',
      marginBottom: s(2),
    },
    otherFeesNote: {
      fontSize: s(7.5),
      marginTop: s(2),
    },

    footer: {
      marginTop: s(10),
    },
    footerLine: {
      fontSize: s(8.5),
      lineHeight: 1.5,
    },
    noteLine: {
      fontSize: s(8.5),
      fontWeight: 'bold',
      marginTop: s(8),
    },
    noteIndent: {
      fontSize: s(8.5),
      fontWeight: 'bold',
      marginLeft: s(14),
    },
  })
}

// A4 for the full-year statement; A6 — a quarter of A4 — for the month slip, whose
// content is short enough to hand over as a billing stub.
const A4_STYLES = buildStyles(1)
// Not the exact 0.5 linear ratio between the two sheets: at half size the type would be
// unreadable, and the month notice carries a fraction of the statement's content, so it
// can afford proportionally larger text.
const A6_STYLES = buildStyles(0.75)

interface StudentNOAPDFProps {
  data: StudentNOAResponse
  institutionName?: string
  institutionAddress?: string
  // Blob URL from useInstitutionLogo. The logo endpoint is authenticated and react-pdf
  // cannot send a bearer token when it loads an image by URL, so the caller fetches it.
  logoUrl?: string | null
  scope?: NOAScopeMode
  // Sequence of the installment being billed. Ignored unless `scope` is 'month'; a
  // sequence with no matching installment falls back to the full-year statement.
  installmentSequence?: number | null
}

const formatAmount = (amount?: number | null) =>
  Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

// One printed line of the DESCRIPTION / AMOUNT table. Charges are positive and
// settlements negative, so the column adds up to the TOTAL beneath it.
interface NOALine {
  key: string
  description: string
  amount: number
}

export const StudentNOAPDF: React.FC<StudentNOAPDFProps> = ({
  data,
  institutionName,
  institutionAddress,
  logoUrl,
  scope = 'total',
  installmentSequence = null,
}) => {
  const { student, academic_year, grade_level, fees, discounts, payments, totals } = data

  // Without a matching period there is no month to bill, so the notice falls back to the
  // full-year statement rather than printing an empty schedule.
  const monthly = scope === 'month' ? summarizeMonthlyNOA(data, installmentSequence) : null
  const isMonthly = Boolean(monthly)
  const styles = isMonthly ? A6_STYLES : A4_STYLES

  const lines: NOALine[] = []
  let total: number

  if (monthly) {
    if (monthly.balanceForward > 0) {
      lines.push({
        key: 'balance-forward',
        description: 'Balance Forward (previous academic year)',
        amount: monthly.balanceForward,
      })
    }
    monthly.arrears.forEach((installment) => {
      lines.push({
        key: `arrear-${installment.sequence}`,
        description: `${installment.label} - unpaid balance`,
        amount: periodUnpaid(installment),
      })
    })
    lines.push({
      key: 'selected',
      description: monthly.selected.label,
      amount: periodUnpaid(monthly.selected),
    })
    total = monthly.totalDue
  } else {
    const balanceForward = Number(totals.balance_forward || 0)
    if (balanceForward > 0) {
      lines.push({
        key: 'balance-forward',
        description: 'Balance Forward (previous academic year)',
        amount: balanceForward,
      })
    }
    fees.forEach((fee) => {
      lines.push({
        key: `fee-${fee.fee_id}`,
        description: fee.fee_name,
        amount: Number(fee.amount || 0),
      })
    })
    ;(discounts ?? []).forEach((discount) => {
      lines.push({
        key: `discount-${discount.discount_id}`,
        description: `Discount${discount.fee_name ? ` - ${discount.fee_name}` : ''}`,
        amount: -Number(discount.amount || 0),
      })
    })
    payments.forEach((payment) => {
      lines.push({
        key: `payment-${payment.payment_id}`,
        description: `Payment${payment.fee_name ? ` - ${payment.fee_name}` : ''}${
          payment.receipt_number ? ` (OR: ${payment.receipt_number})` : ''
        }`,
        amount: -Number(payment.amount || 0),
      })
    })
    total = Number(totals.balance || 0)
  }

  const fullName = `${student.last_name}, ${student.first_name}${
    student.middle_name ? ' ' + student.middle_name : ''
  }${student.ext_name ? ' ' + student.ext_name : ''}`

  const printedOn = new Date().toLocaleDateString('en-US')

  return (
    <Document>
      <Page size={isMonthly ? 'A6' : 'A4'} style={styles.page}>
        <View style={styles.frame}>
          {/* Letterhead */}
          <View style={styles.header}>
            {logoUrl ? <Image src={logoUrl} style={styles.headerLogo} /> : null}
            <View style={styles.headerText}>
              {institutionName ? (
                <Text style={styles.institutionTitle}>{institutionName}</Text>
              ) : null}
              {institutionAddress ? (
                <Text style={styles.institutionMeta}>{institutionAddress}</Text>
              ) : null}
              <Text style={styles.institutionMeta}>
                A.Y. {academic_year}
                {monthly ? ` - ${monthly.selected.label}` : ''}
              </Text>
            </View>
            {logoUrl ? <View style={styles.headerSpacer} /> : null}
          </View>

          <Text style={styles.docTitle}>NOTICE OF ACCOUNT</Text>

          {/* Filled-in form fields */}
          <View style={styles.infoRow}>
            <View style={[styles.infoField, styles.infoFieldWide]}>
              <Text style={styles.infoLabel}>Name:</Text>
              <Text style={styles.infoValue}>{fullName}</Text>
            </View>
            <View style={[styles.infoField, styles.infoFieldNarrow]}>
              <Text style={styles.infoLabel}>Student No.:</Text>
              <Text style={styles.infoValue}>{student.lrn || ''}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={[styles.infoField, styles.infoFieldWide]}>
              <Text style={styles.infoLabel}>Grade/Level:</Text>
              <Text style={styles.infoValue}>{grade_level || ''}</Text>
            </View>
            <View style={[styles.infoField, styles.infoFieldNarrow]}>
              <Text style={styles.infoLabel}>Date:</Text>
              <Text style={styles.infoValue}>{printedOn}</Text>
            </View>
          </View>

          {/* What is being billed */}
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <View style={[styles.cell, styles.cellDesc]}>
                <Text style={styles.columnHead}>DESCRIPTION</Text>
              </View>
              <View style={[styles.cell, styles.cellAmount]}>
                <Text style={styles.columnHead}>AMOUNT</Text>
              </View>
            </View>

            {lines.map((line) => (
              <View key={line.key} style={styles.tableRow}>
                <View style={[styles.cell, styles.cellDesc]}>
                  <Text style={styles.lineText}>{line.description}</Text>
                </View>
                <View style={[styles.cell, styles.cellAmount]}>
                  <Text style={styles.lineAmount}>{formatAmount(line.amount)}</Text>
                </View>
              </View>
            ))}

            <View style={[styles.tableRow, styles.tableRowLast, styles.totalRow]}>
              <View style={[styles.cell, styles.cellDesc]}>
                <Text style={styles.totalText}>TOTAL</Text>
              </View>
              <View style={[styles.cell, styles.cellAmount]}>
                <Text style={styles.totalAmount}>{formatAmount(total)}</Text>
              </View>
            </View>
          </View>

          {/* Cash-basis fees: shown for information, deliberately outside the total */}
          {monthly && monthly.otherFees.length > 0 ? (
            <View style={styles.otherFees}>
              <Text style={styles.otherFeesTitle}>OTHER FEES</Text>
              <View style={styles.table}>
                {monthly.otherFees.map((fee, index) => (
                  <View
                    key={`other-${fee.fee_id}`}
                    style={[
                      styles.tableRow,
                      index === monthly.otherFees.length - 1 ? styles.tableRowLast : styles.tableRow,
                    ]}
                  >
                    <View style={[styles.cell, styles.cellDesc]}>
                      <Text style={styles.lineText}>{fee.fee_name}</Text>
                    </View>
                    <View style={[styles.cell, styles.cellAmount]}>
                      <Text style={styles.lineAmount}>{formatAmount(fee.amount)}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Text style={styles.otherFeesNote}>
                Collected separately - not included in the TOTAL above. Outstanding:{' '}
                {formatAmount(monthly.otherFeesOutstanding)}
              </Text>
            </View>
          ) : null}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerLine}>
              Please settle your account on/before the Examination day which will be on
              ______________________.
            </Text>
            <Text style={styles.noteLine}>
              NOTE: Disregard this notice if payments have been made.
            </Text>
            <Text style={styles.noteIndent}>Kindly present this to the cashier when paying.</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
