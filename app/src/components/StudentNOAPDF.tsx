import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import type { StudentNOAResponse } from '../types'

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
}

const formatAmount = (amount?: number | null) => {
  const value = Number(amount || 0)
  return value.toFixed(2)
}

export const StudentNOAPDF: React.FC<StudentNOAPDFProps> = ({ data, institutionName }) => {
  const { student, academic_year, grade_level, fees, discounts, payments, totals } = data

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

        {/* Fees */}
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

        {/* Discounts */}
        {discounts && discounts.length > 0 && (
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
        {payments.length > 0 && (
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

        {/* Totals Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
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

