import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { SF9Data } from '../services/sf9Service';

// Register fonts
Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/helveticaneue/v70/1Ptsg8zYS_SKggPNyC0IT4ttDfA.ttf', fontWeight: 'normal' },
    { src: 'https://fonts.gstatic.com/s/helveticaneue/v70/1Ptsg8zYS_SKggPNyC0IT4ttDfB.ttf', fontWeight: 'bold' },
  ],
});

// Create styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 20,
    fontFamily: 'Helvetica',
    fontSize: 10,
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
    borderBottom: '1px solid #000',
    paddingBottom: 10,
  },
  depedLogo: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  institutionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    textDecoration: 'underline',
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    backgroundColor: '#f0f0f0',
    padding: 4,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
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
    borderColor: '#000',
    marginTop: 5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    minHeight: 25,
    alignItems: 'center',
  },
  tableRowHeader: {
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
  },
  tableCol: {
    borderRightWidth: 1,
    borderRightColor: '#000',
    padding: 4,
    fontSize: 8,
  },
  tableColSubject: {
    width: '25%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    padding: 4,
    fontSize: 8,
  },
  tableColQuarter: {
    width: '15%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    padding: 4,
    fontSize: 8,
    textAlign: 'center',
  },
  tableColFinal: {
    width: '15%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    padding: 4,
    fontSize: 8,
    textAlign: 'center',
  },
  tableColRemarks: {
    width: '15%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    padding: 4,
    fontSize: 8,
    textAlign: 'center',
  },
  tableColCoreValue: {
    width: '20%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    padding: 4,
    fontSize: 8,
  },
  tableColMarking: {
    width: '10%',
    borderRightWidth: 1,
    borderRightColor: '#000',
    padding: 4,
    fontSize: 8,
    textAlign: 'center',
  },
  footer: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 9,
  },
  signatureSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
  },
  signatureBox: {
    width: '45%',
    textAlign: 'center',
  },
  signatureLine: {
    borderBottom: '1px solid #000',
    marginBottom: 5,
    height: 20,
  },
  pageBreak: {
    pageBreakBefore: 'always',
  },
});

interface SF9PDFProps {
  data: SF9Data;
}

const formatGrade = (grade: number | null): string => {
  if (grade === null || grade === undefined) return 'N/A';
  return Math.round(grade).toString();
};

const getRemarks = (grade: number | null): string => {
  if (grade === null || grade === undefined) return 'N/A';
  if (grade >= 90) return 'Outstanding';
  if (grade >= 85) return 'Very Satisfactory';
  if (grade >= 80) return 'Satisfactory';
  if (grade >= 75) return 'Fairly Satisfactory';
  return 'Did Not Meet Expectations';
};

const getQuarterLabel = (quarter: string): string => {
  const quarters: Record<string, string> = {
    '1': 'First Quarter',
    '2': 'Second Quarter',
    '3': 'Third Quarter',
    '4': 'Fourth Quarter',
  };
  return quarters[quarter] || `Quarter ${quarter}`;
};

export const SF9PDF: React.FC<SF9PDFProps> = ({ data }) => {
  const { student, institution, academic_performance, core_values, attendance_summary, enrollment_history } = data;

  return (
    <Document>
      {/* Front Page */}
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.depedLogo}>Republic of the Philippines</Text>
          <Text style={styles.depedLogo}>Department of Education</Text>
          <Text style={styles.institutionTitle}>{institution.title}</Text>
          <Text style={styles.formTitle}>STUDENT'S PERMANENT RECORD</Text>
          <Text style={styles.formTitle}>(SF9)</Text>
        </View>

        {/* Student Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STUDENT INFORMATION</Text>
          
          <View style={styles.row}>
            <Text style={styles.label}>Learner Reference Number (LRN):</Text>
            <Text style={styles.value}>{student.lrn}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>Name:</Text>
            <Text style={styles.value}>
              {student.last_name}, {student.first_name} {student.middle_name || ''} {student.ext_name || ''}
            </Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>Gender:</Text>
            <Text style={styles.value}>{student.gender}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>Birth Date:</Text>
            <Text style={styles.value}>{new Date(student.birthdate).toLocaleDateString()}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>Religion:</Text>
            <Text style={styles.value}>{student.religion}</Text>
          </View>
        </View>

        {/* Current Academic Year */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CURRENT ACADEMIC YEAR: {data.current_academic_year}</Text>
        </View>

        {/* Academic Performance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACADEMIC PERFORMANCE</Text>
          
          {Object.entries(academic_performance).map(([quarter, grades]) => (
            <View key={quarter} style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 5 }}>
                {getQuarterLabel(quarter)}
              </Text>
              
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableRowHeader]}>
                  <View style={styles.tableColSubject}>
                    <Text style={{ fontSize: 8, fontWeight: 'bold' }}>Subject</Text>
                  </View>
                  <View style={styles.tableColQuarter}>
                    <Text style={{ fontSize: 8, fontWeight: 'bold' }}>Quarter Grade</Text>
                  </View>
                  <View style={styles.tableColFinal}>
                    <Text style={{ fontSize: 8, fontWeight: 'bold' }}>Final Grade</Text>
                  </View>
                  <View style={styles.tableColRemarks}>
                    <Text style={{ fontSize: 8, fontWeight: 'bold' }}>Remarks</Text>
                  </View>
                </View>
                
                {grades.map((grade, index) => (
                  <View key={index} style={styles.tableRow}>
                    <View style={styles.tableColSubject}>
                      <Text style={{ fontSize: 8 }}>{grade.subject_title}</Text>
                    </View>
                    <View style={styles.tableColQuarter}>
                      <Text style={{ fontSize: 8, textAlign: 'center' }}>
                        {formatGrade(grade.grade)}
                      </Text>
                    </View>
                    <View style={styles.tableColFinal}>
                      <Text style={{ fontSize: 8, textAlign: 'center' }}>
                        {formatGrade(grade.final_grade)}
                      </Text>
                    </View>
                    <View style={styles.tableColRemarks}>
                      <Text style={{ fontSize: 8, textAlign: 'center' }}>
                        {getRemarks(grade.final_grade)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* Core Values */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CORE VALUES</Text>
          
          {Object.entries(core_values).map(([quarter, values]) => (
            <View key={quarter} style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 5 }}>
                {getQuarterLabel(quarter)}
              </Text>
              
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableRowHeader]}>
                  <View style={styles.tableColCoreValue}>
                    <Text style={{ fontSize: 8, fontWeight: 'bold' }}>Core Value</Text>
                  </View>
                  <View style={styles.tableColCoreValue}>
                    <Text style={{ fontSize: 8, fontWeight: 'bold' }}>Behavior Statement</Text>
                  </View>
                  <View style={styles.tableColMarking}>
                    <Text style={{ fontSize: 8, fontWeight: 'bold' }}>Marking</Text>
                  </View>
                </View>
                
                {values.map((value, index) => (
                  <View key={index} style={styles.tableRow}>
                    <View style={styles.tableColCoreValue}>
                      <Text style={{ fontSize: 8 }}>{value.core_value}</Text>
                    </View>
                    <View style={styles.tableColCoreValue}>
                      <Text style={{ fontSize: 8 }}>{value.behavior_statement}</Text>
                    </View>
                    <View style={styles.tableColMarking}>
                      <Text style={{ fontSize: 8, textAlign: 'center' }}>{value.marking}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* Attendance Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ATTENDANCE SUMMARY</Text>
          
          <View style={styles.row}>
            <Text style={styles.label}>Total Days:</Text>
            <Text style={styles.value}>{attendance_summary.total_days}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>Present Days:</Text>
            <Text style={styles.value}>{attendance_summary.present_days}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>Absent Days:</Text>
            <Text style={styles.value}>{attendance_summary.absent_days}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>Late Days:</Text>
            <Text style={styles.value}>{attendance_summary.late_days}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>Attendance Rate:</Text>
            <Text style={styles.value}>{attendance_summary.attendance_rate}%</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>This document is computer-generated and does not require a signature.</Text>
          <Text>Generated on: {new Date().toLocaleDateString()}</Text>
        </View>
      </Page>

      {/* Back Page - Enrollment History */}
      <Page size="A4" style={[styles.page, styles.pageBreak]}>
        <View style={styles.header}>
          <Text style={styles.depedLogo}>Republic of the Philippines</Text>
          <Text style={styles.depedLogo}>Department of Education</Text>
          <Text style={styles.institutionTitle}>{institution.title}</Text>
          <Text style={styles.formTitle}>STUDENT'S PERMANENT RECORD</Text>
          <Text style={styles.formTitle}>(SF9) - Back Page</Text>
        </View>

        {/* Enrollment History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ENROLLMENT HISTORY</Text>
          
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableRowHeader]}>
              <View style={styles.tableColSubject}>
                <Text style={{ fontSize: 8, fontWeight: 'bold' }}>Academic Year</Text>
              </View>
              <View style={styles.tableColSubject}>
                <Text style={{ fontSize: 8, fontWeight: 'bold' }}>Grade Level</Text>
              </View>
              <View style={styles.tableColSubject}>
                <Text style={{ fontSize: 8, fontWeight: 'bold' }}>Section</Text>
              </View>
              <View style={styles.tableColSubject}>
                <Text style={{ fontSize: 8, fontWeight: 'bold' }}>Institution</Text>
              </View>
              <View style={styles.tableColMarking}>
                <Text style={{ fontSize: 8, fontWeight: 'bold' }}>Status</Text>
              </View>
            </View>
            
            {Object.entries(enrollment_history).map(([year, sections]) =>
              sections.map((section, index) => (
                <View key={`${year}-${index}`} style={styles.tableRow}>
                  <View style={styles.tableColSubject}>
                    <Text style={{ fontSize: 8 }}>{section.academic_year}</Text>
                  </View>
                  <View style={styles.tableColSubject}>
                    <Text style={{ fontSize: 8 }}>Grade {section.grade_level}</Text>
                  </View>
                  <View style={styles.tableColSubject}>
                    <Text style={{ fontSize: 8 }}>{section.section_title}</Text>
                  </View>
                  <View style={styles.tableColSubject}>
                    <Text style={{ fontSize: 8 }}>{section.institution_name}</Text>
                  </View>
                  <View style={styles.tableColMarking}>
                    <Text style={{ fontSize: 8, textAlign: 'center' }}>
                      {section.is_promoted ? 'Promoted' : 'Not Promoted'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Certification Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CERTIFICATION</Text>
          <Text style={{ fontSize: 9, marginBottom: 10 }}>
            This is to certify that the above information is true and correct based on the records of this school.
          </Text>
        </View>

        {/* Signature Section */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={{ fontSize: 9 }}>School Principal</Text>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={{ fontSize: 9 }}>Date</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>This document is computer-generated and does not require a signature.</Text>
          <Text>Generated on: {new Date().toLocaleDateString()}</Text>
        </View>
      </Page>
    </Document>
  );
}; 