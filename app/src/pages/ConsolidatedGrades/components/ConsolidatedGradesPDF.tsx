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
    padding: 4, // reduce padding for more columns
  },
  tableColChildSubject: {
    width: '8%',
    borderRightWidth: 1,
    borderRightColor: '#d1d5db',
    padding: 2,
    backgroundColor: '#f9fafb',
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
    fontSize: 8,
    textAlign: 'center',
  },
  tableCellStudent: {
    fontSize: 10,
    textAlign: 'left',
  },
  tableCellHeader: {
    fontSize: 8, // smaller font for subject headers
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tableCellHeaderStudent: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'left',
  },
  tableCellHeaderChild: {
    fontSize: 7,
    fontWeight: 'normal',
    textAlign: 'center',
    color: '#6b7280',
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
      gender?: string;
      subjects: Array<{
        subject_id: string;
        subject_title: string;
        subject_variant: string;
        subject_type: string;
        parent_subject_id: string | null;
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
  return Math.round(numGrade).toString();
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

const getRemarks = (finalGrade: number | null) => {
  if (finalGrade === null) return 'N/A';
  if (finalGrade >= 98) return 'With Highest Honors';
  if (finalGrade >= 95) return 'With High Honor';
  if (finalGrade >= 90) return 'With Honors';
  return '';
};

export const ConsolidatedGradesPDF: React.FC<ConsolidatedGradesPDFProps> = ({ 
  data, 
  institutionName = 'School Institution' 
}) => {
  const { section, students, quarter } = data;

  // Helper to get base subject title
  const getBaseTitle = (title: string) => title.split(/[-(]/)[0].trim();

  // --- Group subjects by base and variants for table columns (flattened for header/columns) ---
  const subjectGroups = React.useMemo(() => {
    if (!students.length) return [];
    const map: Record<string, { base: string; variants: string[] }> = {};
    students[0].subjects.forEach((subject: any) => {
      const base = getBaseTitle(subject.subject_title);
      if (!map[base]) map[base] = { base, variants: [] };
      if (!map[base].variants.includes(subject.subject_title)) {
        map[base].variants.push(subject.subject_title);
      }
    });
    return Object.values(map);
  }, [students]);

  // --- Flatten all subject columns for header/rows ---
  const allSubjectColumns = React.useMemo(() => {
    return subjectGroups.flatMap(group => group.variants.map(variant => ({
      base: group.base,
      variant,
    })));
  }, [subjectGroups]);

  // Group students by gender
  const studentsWithGender = students as (typeof students[number] & { gender?: string })[];
  const groupedStudents: Record<string, typeof studentsWithGender> = studentsWithGender.reduce((acc, student) => {
    const gender = student.gender ? student.gender.toLowerCase() : 'other';
    if (!acc[gender]) acc[gender] = [];
    acc[gender].push(student);
    return acc;
  }, {} as Record<string, typeof studentsWithGender>);
  const genderLabels: Record<string, string> = {
    male: 'Male',
    female: 'Female',
    other: 'Other',
  };

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

        {/* Table for each gender group */}
        {Object.entries(groupedStudents).map(([gender, studentsList]) => (
          studentsList.length === 0 ? null : (
            <View key={gender} wrap={false}>
              <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 6, color: '#374151' }}>
                {genderLabels[gender] || 'Other'} Students
              </Text>
              <View style={styles.table}>
                {/* Single Header Row: Show full subject titles (including child/variant) */}
                <View style={[styles.tableRow, styles.tableRowHeader]}>
                  <View style={styles.tableColStudent}>
                    <Text style={styles.tableCellHeaderStudent}>Student Name</Text>
                  </View>
                  {allSubjectColumns.map(({ base, variant }) => {
                    // Split variant into parent and child (e.g., "Math - Written Work")
                    let parent = base;
                    let child = variant.replace(base, '').replace(/^[-\s]+/, '');
                    // If no child, just show parent
                    return (
                      <View key={base + variant} style={styles.tableColChildSubject}>
                        <Text style={styles.tableCellHeader}>
                          {parent}
                        </Text>
                        {child ? (
                          <Text style={styles.tableCellHeaderChild}>{child}</Text>
                        ) : null}
                      </View>
                    );
                  })}
                  <View style={styles.tableColFinalGrade}>
                    <Text style={styles.tableCellHeader}>Final Grade</Text>
                  </View>
                  <View style={styles.tableColRemarks}>
                    <Text style={styles.tableCellHeader}>Remarks</Text>
                  </View>
                </View>
                {/* Table Rows */}
                {studentsList.map((student) => {
                  // Group grades by base and variant
                  const grouped: Record<string, { [variant: string]: number | string | null }> = {};
                  student.subjects.forEach((subject: any) => {
                    const base = getBaseTitle(subject.subject_title);
                    if (!grouped[base]) grouped[base] = {};
                    grouped[base][subject.subject_title] = subject.grade;
                  });
                  // For each base, average grades for final grade (excluding child subjects)
                  // const allGrades = Object.values(grouped)
                  //   .flatMap(variants => Object.values(variants)
                  //     .map(g => typeof g === 'string' ? parseFloat(g) : g)
                  //     .filter((g): g is number => g !== null && !isNaN(g)));
                  
                  // Filter out child subjects from final grade calculation
                  const parentAndRegularGrades = student.subjects
                    .filter(subject => subject.subject_type !== 'child')
                    .map(subject => {
                      const grade = typeof subject.grade === 'string' ? parseFloat(subject.grade) : subject.grade;
                      return grade !== null && !isNaN(grade) ? grade : null;
                    })
                    .filter((grade): grade is number => grade !== null);
                  
                  const finalGrade = parentAndRegularGrades.length > 0 ? Math.round(parentAndRegularGrades.reduce((a, b) => a + b, 0) / parentAndRegularGrades.length) : null;
                  return (
                    <View key={student.student_id} style={styles.tableRow}>
                      <View style={styles.tableColStudent}>
                        <Text style={styles.tableCellStudent}>{student.student_name}</Text>
                      </View>
                      {/* Render each subject variant as its own column */}
                      {allSubjectColumns.map(({ base, variant }) => (
                        <View key={base + variant} style={styles.tableColChildSubject}>
                          <Text style={styles.tableCell}>{formatGrade(grouped[base]?.[variant])}</Text>
                        </View>
                      ))}
                      <View style={styles.tableColFinalGrade}>
                        <Text style={styles.tableCell}>{formatGrade(finalGrade)}</Text>
                      </View>
                      <View style={styles.tableColRemarks}>
                        <Text style={styles.tableCell}>{getRemarks(finalGrade)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )
        ))}

        {/* Summary */}
        <View style={styles.summary}>
          <Text>Total Students: {students.length}</Text>
          <Text>Total Subjects: {allSubjectColumns.length}</Text>
          <Text>Generated on: {new Date().toLocaleDateString()}</Text>
        </View>
      </Page>
    </Document>
  );
}; 