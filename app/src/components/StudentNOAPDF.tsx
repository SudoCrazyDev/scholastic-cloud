import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import type { StudentNOAResponse } from '../types'
import { periodCharged, periodUnpaid, summarizeMonthlyNOA } from './studentNOAStatement'
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

const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 24,
    fontFamily: 'Helvetica',
    fontSize: 10,
  },
  header: {
    textAlign: 'center',
    marginBottom: 18,
  },
  institutionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  subTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  meta: {
    fontSize: 9,
    color: '#4b5563',
  },
  section: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  label: {
    width: '30%',
    fontWeight: 'bold',
    fontSize: 9,
  },
  value: {
    width: '70%',
    fontSize: 9,
  },
  table: {
    width: '100%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginTop: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    minHeight: 20,
    alignItems: 'center',
  },
  tableRowHeader: {
    backgroundColor: '#f3f4f6',
  },
  tableCol: {
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    padding: 4,
    fontSize: 8,
  },
  tableColFee: {
    width: '60%',
  },
  tableColAmount: {
    width: '40%',
    textAlign: 'right',
  },
  tableColDiscountDesc: {
    width: '50%',
  },
  tableColDiscountType: {
    width: '20%',
    textAlign: 'center',
  },
  tableColDiscountAmount: {
    width: '30%',
    textAlign: 'right',
  },
  tableColPaymentDesc: {
    width: '55%',
  },
  tableColPaymentAmount: {
    width: '25%',
    textAlign: 'right',
  },
  tableColPaymentDate: {
    width: '20%',
    textAlign: 'center',
  },
  tableColPeriod: {
    width: '34%',
  },
  tableColPeriodDate: {
    width: '18%',
    textAlign: 'center',
  },
  tableColPeriodAmount: {
    width: '16%',
    textAlign: 'right',
  },
  tableRowArrears: {
    backgroundColor: '#fef2f2',
  },
  tableRowSelected: {
    backgroundColor: '#eff6ff',
  },
  tableRowTotal: {
    backgroundColor: '#f3f4f6',
  },
  periodNote: {
    fontSize: 7,
    color: '#6b7280',
  },
  note: {
    fontSize: 8,
    color: '#6b7280',
    marginTop: 4,
  },
  scopeBanner: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: 'bold',
  },
  footer: {
    marginTop: 14,
    fontSize: 8,
    color: '#6b7280',
    textAlign: 'right',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 9,
    marginTop: 2,
  },
  totalsLabel: {
    color: '#4b5563',
  },
  totalsValue: {
    fontWeight: 'bold',
  },
  strong: {
    fontWeight: 'bold',
  },
})

interface StudentNOAPDFProps {
  data: StudentNOAResponse
  institutionName?: string
  scope?: NOAScopeMode
  // Sequence of the installment being billed. Ignored unless `scope` is 'month'; a
  // sequence with no matching installment falls back to the full-year statement.
  installmentSequence?: number | null
}

const formatAmount = (amount?: number | null) => {
  const value = Number(amount || 0)
  return value.toFixed(2)
}

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const StudentNOAPDF: React.FC<StudentNOAPDFProps> = ({
  data,
  institutionName,
  scope = 'total',
  installmentSequence = null,
}) => {
  const { student, academic_year, grade_level, fees, discounts, payments, totals } = data

  // Without a matching period there is no month to bill, so the notice falls back to the
  // full-year statement rather than printing an empty schedule.
  const monthly = scope === 'month' ? summarizeMonthlyNOA(data, installmentSequence) : null
  const isMonthly = Boolean(monthly)

  const fullName = `${student.last_name}, ${student.first_name}${
    student.middle_name ? ' ' + student.middle_name : ''
  }${student.ext_name ? ' ' + student.ext_name : ''}`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {institutionName && (
            <Text style={styles.institutionTitle}>{institutionName}</Text>
          )}
          <Text style={styles.subTitle}>NOTICE / STATEMENT OF ACCOUNT</Text>
          <Text style={styles.meta}>Academic Year: {academic_year}</Text>
          {isMonthly && (
            <Text style={styles.scopeBanner}>Statement for {monthly!.selected.label}</Text>
          )}
        </View>

        {/* Student Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Student Information</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Name:</Text>
            <Text style={styles.value}>{fullName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>LRN:</Text>
            <Text style={styles.value}>{student.lrn || 'N/A'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Grade Level:</Text>
            <Text style={styles.value}>{grade_level || 'N/A'}</Text>
          </View>
        </View>

        {/* Amount due for the selected month, arrears folded in */}
        {isMonthly && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Amount Due - {monthly!.selected.label}</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableRowHeader]}>
                <View style={[styles.tableCol, styles.tableColPeriod]}>
                  <Text>Period</Text>
                </View>
                <View style={[styles.tableCol, styles.tableColPeriodDate]}>
                  <Text>Due Date</Text>
                </View>
                <View style={[styles.tableCol, styles.tableColPeriodAmount]}>
                  <Text>Charged</Text>
                </View>
                <View style={[styles.tableCol, styles.tableColPeriodAmount]}>
                  <Text>Paid</Text>
                </View>
                <View style={[styles.tableCol, styles.tableColPeriodAmount]}>
                  <Text>Unpaid</Text>
                </View>
              </View>

              {monthly!.balanceForward > 0 && (
                <View style={[styles.tableRow, styles.tableRowArrears]}>
                  <View style={[styles.tableCol, styles.tableColPeriod]}>
                    <Text>Balance Forward</Text>
                    <Text style={styles.periodNote}>Unpaid from a previous academic year</Text>
                  </View>
                  <View style={[styles.tableCol, styles.tableColPeriodDate]}>
                    <Text>-</Text>
                  </View>
                  <View style={[styles.tableCol, styles.tableColPeriodAmount]}>
                    <Text>{formatAmount(monthly!.balanceForward)}</Text>
                  </View>
                  <View style={[styles.tableCol, styles.tableColPeriodAmount]}>
                    <Text>-</Text>
                  </View>
                  <View style={[styles.tableCol, styles.tableColPeriodAmount]}>
                    <Text>{formatAmount(monthly!.balanceForward)}</Text>
                  </View>
                </View>
              )}

              {monthly!.arrears.map((installment) => (
                <View
                  key={`arrear-${installment.sequence}`}
                  style={[styles.tableRow, styles.tableRowArrears]}
                >
                  <View style={[styles.tableCol, styles.tableColPeriod]}>
                    <Text>{installment.label}</Text>
                    <Text style={styles.periodNote}>
                      Unpaid balance
                      {Number(installment.late_fee_amount || 0) > 0
                        ? ` (includes ${formatAmount(installment.late_fee_amount)} surcharge)`
                        : ''}
                    </Text>
                  </View>
                  <View style={[styles.tableCol, styles.tableColPeriodDate]}>
                    <Text>{formatDate(installment.due_date)}</Text>
                  </View>
                  <View style={[styles.tableCol, styles.tableColPeriodAmount]}>
                    <Text>{formatAmount(periodCharged(installment))}</Text>
                  </View>
                  <View style={[styles.tableCol, styles.tableColPeriodAmount]}>
                    <Text>
                      {formatAmount(
                        Math.max(0, periodCharged(installment) - periodUnpaid(installment))
                      )}
                    </Text>
                  </View>
                  <View style={[styles.tableCol, styles.tableColPeriodAmount]}>
                    <Text>{formatAmount(periodUnpaid(installment))}</Text>
                  </View>
                </View>
              ))}

              <View style={[styles.tableRow, styles.tableRowSelected]}>
                <View style={[styles.tableCol, styles.tableColPeriod]}>
                  <Text style={styles.strong}>{monthly!.selected.label}</Text>
                  <Text style={styles.periodNote}>
                    This period
                    {Number(monthly!.selected.late_fee_amount || 0) > 0
                      ? ` (includes ${formatAmount(monthly!.selected.late_fee_amount)} surcharge)`
                      : ''}
                  </Text>
                </View>
                <View style={[styles.tableCol, styles.tableColPeriodDate]}>
                  <Text>{formatDate(monthly!.selected.due_date)}</Text>
                </View>
                <View style={[styles.tableCol, styles.tableColPeriodAmount]}>
                  <Text>{formatAmount(periodCharged(monthly!.selected))}</Text>
                </View>
                <View style={[styles.tableCol, styles.tableColPeriodAmount]}>
                  <Text>
                    {formatAmount(
                      Math.max(
                        0,
                        periodCharged(monthly!.selected) - periodUnpaid(monthly!.selected)
                      )
                    )}
                  </Text>
                </View>
                <View style={[styles.tableCol, styles.tableColPeriodAmount]}>
                  <Text>{formatAmount(periodUnpaid(monthly!.selected))}</Text>
                </View>
              </View>

              <View style={[styles.tableRow, styles.tableRowTotal]}>
                <View style={[styles.tableCol, { width: '68%' }]}>
                  <Text style={styles.strong}>
                    TOTAL AMOUNT DUE - {monthly!.selected.label}
                  </Text>
                  <Text style={styles.periodNote}>
                    This period plus every unpaid balance before it
                  </Text>
                </View>
                <View style={[styles.tableCol, { width: '32%', textAlign: 'right' }]}>
                  <Text style={styles.strong}>{formatAmount(monthly!.totalDue)}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Other fees: listed for information, deliberately outside the amount due */}
        {isMonthly && monthly!.otherFees.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Other Fees</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableRowHeader]}>
                <View style={[styles.tableCol, styles.tableColFee]}>
                  <Text>Fee</Text>
                </View>
                <View style={[styles.tableCol, styles.tableColAmount]}>
                  <Text>Amount (PHP)</Text>
                </View>
              </View>
              {monthly!.otherFees.map((fee) => (
                <View key={`other-${fee.fee_id}`} style={styles.tableRow}>
                  <View style={[styles.tableCol, styles.tableColFee]}>
                    <Text>{fee.fee_name}</Text>
                  </View>
                  <View style={[styles.tableCol, styles.tableColAmount]}>
                    <Text>{formatAmount(fee.amount)}</Text>
                  </View>
                </View>
              ))}
              <View style={[styles.tableRow, styles.tableRowTotal]}>
                <View style={[styles.tableCol, styles.tableColFee]}>
                  <Text style={styles.strong}>Outstanding on other fees</Text>
                  <Text style={styles.periodNote}>
                    Charged {formatAmount(monthly!.otherFeesCharged)} - Paid {formatAmount(monthly!.otherFeesPaid)}
                  </Text>
                </View>
                <View style={[styles.tableCol, styles.tableColAmount]}>
                  <Text style={styles.strong}>{formatAmount(monthly!.otherFeesOutstanding)}</Text>
                </View>
              </View>
            </View>
            <Text style={styles.note}>
              Other fees are collected separately and are NOT included in the total amount due for{' '}
              {monthly!.selected.label}.
            </Text>
          </View>
        )}

        {/* Fees */}
        {!isMonthly && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assessed Fees</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableRowHeader]}>
              <View style={[styles.tableCol, styles.tableColFee]}>
                <Text>Fee</Text>
              </View>
              <View style={[styles.tableCol, styles.tableColAmount]}>
                <Text>Amount (PHP)</Text>
              </View>
            </View>
            {fees.length ? (
              fees.map((fee) => (
                <View key={fee.fee_id} style={styles.tableRow}>
                  <View style={[styles.tableCol, styles.tableColFee]}>
                    <Text>{fee.fee_name}</Text>
                  </View>
                  <View style={[styles.tableCol, styles.tableColAmount]}>
                    <Text>{formatAmount(fee.amount)}</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.tableRow}>
                <View style={[styles.tableCol, styles.tableColFee]}>
                  <Text>No fees configured for this academic year.</Text>
                </View>
                <View style={[styles.tableCol, styles.tableColAmount]}>
                  <Text>-</Text>
                </View>
              </View>
            )}
          </View>
        </View>
        )}

        {/* Discounts */}
        {!isMonthly && discounts && discounts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Discounts</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableRowHeader]}>
                <View style={[styles.tableCol, styles.tableColDiscountDesc]}>
                  <Text>Description</Text>
                </View>
                <View style={[styles.tableCol, styles.tableColDiscountType]}>
                  <Text>Type</Text>
                </View>
                <View style={[styles.tableCol, styles.tableColDiscountAmount]}>
                  <Text>Amount (PHP)</Text>
                </View>
              </View>
              {discounts.map((discount) => {
                const label = discount.fee_name || 'General Discount'
                return (
                  <View key={discount.discount_id} style={styles.tableRow}>
                    <View style={[styles.tableCol, styles.tableColDiscountDesc]}>
                      <Text>
                        {label}
                        {discount.description ? ` - ${discount.description}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.tableCol, styles.tableColDiscountType]}>
                      <Text>{discount.discount_type}</Text>
                    </View>
                    <View style={[styles.tableCol, styles.tableColDiscountAmount]}>
                      <Text>{formatAmount(discount.amount)}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Payments */}
        {!isMonthly && payments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payments</Text>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableRowHeader]}>
                <View style={[styles.tableCol, styles.tableColPaymentDesc]}>
                  <Text>Description</Text>
                </View>
                <View style={[styles.tableCol, styles.tableColPaymentAmount]}>
                  <Text>Amount (PHP)</Text>
                </View>
                <View style={[styles.tableCol, styles.tableColPaymentDate]}>
                  <Text>Date</Text>
                </View>
              </View>
              {payments.map((payment) => {
                const label = payment.fee_name ? `Payment - ${payment.fee_name}` : 'Payment'
                return (
                  <View key={payment.payment_id} style={styles.tableRow}>
                    <View style={[styles.tableCol, styles.tableColPaymentDesc]}>
                      <Text>
                        {label}
                        {payment.receipt_number ? ` (OR: ${payment.receipt_number})` : ''}
                      </Text>
                    </View>
                    <View style={[styles.tableCol, styles.tableColPaymentAmount]}>
                      <Text>{formatAmount(payment.amount)}</Text>
                    </View>
                    <View style={[styles.tableCol, styles.tableColPaymentDate]}>
                      <Text>{payment.payment_date || ''}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Totals Summary. On a monthly notice this is context for the amount due above,
            never a replacement for it — it covers the whole year, other fees included. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isMonthly ? 'Account Summary (whole academic year)' : 'Summary'}
          </Text>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Balance Forward</Text>
            <Text style={styles.totalsValue}>{formatAmount(totals.balance_forward)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total Charges</Text>
            <Text style={styles.totalsValue}>{formatAmount(totals.charges)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total Discounts</Text>
            <Text style={styles.totalsValue}>{formatAmount(totals.discounts)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total Payments</Text>
            <Text style={styles.totalsValue}>{formatAmount(totals.payments)}</Text>
          </View>
          <View style={[styles.totalsRow, { marginTop: 4 }]}>
            <Text style={[styles.totalsLabel, styles.strong]}>Outstanding Balance</Text>
            <Text style={[styles.totalsValue, styles.strong]}>{formatAmount(totals.balance)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Generated on: {new Date().toLocaleDateString()}</Text>
        </View>
      </Page>
    </Document>
  )
}

