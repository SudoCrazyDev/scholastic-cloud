import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// Register fonts (you may need to adjust paths based on your setup)
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
    padding: 30,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    textAlign: 'center',
  },
  institutionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1f2937',
  },
  sectionInfo: {
    fontSize: 14,
    marginBottom: 6,
    color: '#374151',
  },
  quarterInfo: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 20,
  },
  table: {
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginTop: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    minHeight: 35,
    alignItems: 'center',
  },
  tableRowHeader: {
    backgroundColor: '#f3f4f6',
    fontWeight: 'bold',
  },
  tableCol: {
    width: '12%',
    borderRightWidth: 1,
    borderRightColor: '#d1d5db',
    padding: 8,
  },
  tableColStudent: {
    width: '25%',
    borderRightWidth: 1,
    borderRightColor: '#d1d5db',
    padding: 8,
  },
  tableColSubject: {
    width: '8%',
    borderRightWidth: 1,
    borderRightColor: '#d1d5db',
    padding: 8,
  },
  tableColFinalGrade: {
    width: '12%',
    borderRightWidth: 1,
    borderRightColor: '#d1d5db',
    padding: 8,
  },
  tableColRemarks: {
    width: '15%',
    borderRightWidth: 1,
    borderRightColor: '#d1d5db',
    padding: 8,
  },
  tableCell: {
    fontSize: 10,
    textAlign: 'center',
  },
  tableCellStudent: {
    fontSize: 10,
    textAlign: 'left',
  },
  tableCellHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tableCellHeaderStudent: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'left',
  },
  subjectHeader: {
    fontSize: 8,
    color: '#6b7280',
    marginTop: 2,
  },
  summary: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 10,
    color: '#6b7280',
  },
});

interface ConsolidatedGradesPDFProps {
  data: {
    section: {
      id: string;
      title: string;
      grade_level: string;
      academic_year: string;
    };
    quarter: number;
    students: Array<{
      student_id: string;
      student_name: string;
      lrn: string;
      subjects: Array<{
        subject_id: string;
        subject_title: string;
        subject_variant: string;
        grade: number | string | null;
        final_grade: number | string | null;
        calculated_grade: number | string | null;
      }>;
    }>;
  };
  institutionName?: string;
}

const formatGrade = (grade: number | string | null) => {
  if (grade === null || grade === undefined) return 'N/A';
  const numGrade = typeof grade === 'string' ? parseFloat(grade) : grade;
  if (isNaN(numGrade)) return 'N/A';
  return numGrade.toFixed(2);
};

const getQuarterLabel = (quarter: number) => {
  const quarters = {
    1: 'First Quarter',
    2: 'Second Quarter',
    3: 'Third Quarter',
    4: 'Fourth Quarter',
  };
  return quarters[quarter as keyof typeof quarters] || `Quarter ${quarter}`;
};

const calculateFinalGrade = (subjects: Array<{ grade: number | string | null }>) => {
  const validGrades = subjects
    .map(subject => {
      const grade = typeof subject.grade === 'string' ? parseFloat(subject.grade) : subject.grade;
      return isNaN(grade as number) ? null : grade;
    })
    .filter(grade => grade !== null) as number[];

  if (validGrades.length === 0) return null;
  
  const sum = validGrades.reduce((acc, grade) => acc + grade, 0);
  return sum / validGrades.length;
};

const getRemarks = (finalGrade: number | null) => {
  if (finalGrade === null) return 'N/A';
  if (finalGrade >= 90) return 'Outstanding';
  if (finalGrade >= 85) return 'Very Satisfactory';
  if (finalGrade >= 80) return 'Satisfactory';
  if (finalGrade >= 75) return 'Fairly Satisfactory';
  return 'Did Not Meet Expectations';
};

export const ConsolidatedGradesPDF: React.FC<ConsolidatedGradesPDFProps> = ({ 
  data, 
  institutionName = 'School Institution' 
}) => {
  const { section, students, quarter } = data;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.institutionTitle}>{institutionName}</Text>
          <Text style={styles.sectionInfo}>
            Grade {section.grade_level} - {section.title}
          </Text>
          <Text style={styles.quarterInfo}>
            {getQuarterLabel(quarter)} • Academic Year {section.academic_year}
          </Text>
        </View>

        {/* Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={[styles.tableRow, styles.tableRowHeader]}>
            <View style={styles.tableColStudent}>
              <Text style={styles.tableCellHeaderStudent}>Student Name</Text>
            </View>
            {students[0]?.subjects.map((subject) => (
              <View key={subject.subject_id} style={styles.tableColSubject}>
                <Text style={styles.tableCellHeader}>{subject.subject_title}</Text>
                {subject.subject_variant && (
                  <Text style={styles.subjectHeader}>{subject.subject_variant}</Text>
                )}
              </View>
            ))}
            <View style={styles.tableColFinalGrade}>
              <Text style={styles.tableCellHeader}>Final Grade</Text>
            </View>
            <View style={styles.tableColRemarks}>
              <Text style={styles.tableCellHeader}>Remarks</Text>
            </View>
          </View>

          {/* Table Rows */}
          {students.map((student) => (
            <View key={student.student_id} style={styles.tableRow}>
              <View style={styles.tableColStudent}>
                <Text style={styles.tableCellStudent}>{student.student_name}</Text>
              </View>
              {student.subjects.map((subject) => (
                <View key={subject.subject_id} style={styles.tableColSubject}>
                  <Text style={styles.tableCell}>
                    {formatGrade(subject.grade)}
                  </Text>
                </View>
              ))}
              <View style={styles.tableColFinalGrade}>
                <Text style={styles.tableCell}>
                  {formatGrade(calculateFinalGrade(student.subjects))}
                </Text>
              </View>
              <View style={styles.tableColRemarks}>
                <Text style={styles.tableCell}>
                  {getRemarks(calculateFinalGrade(student.subjects))}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.summary}>
          <Text>Total Students: {students.length}</Text>
          <Text>Total Subjects: {students[0]?.subjects.length || 0}</Text>
          <Text>Generated on: {new Date().toLocaleDateString()}</Text>
        </View>
      </Page>
    </Document>
  );
}; 