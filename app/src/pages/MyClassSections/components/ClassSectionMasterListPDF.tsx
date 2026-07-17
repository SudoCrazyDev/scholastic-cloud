import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import type { Student } from '../../../types';

interface MasterListSection {
  title: string;
  grade_level: string;
  academic_year?: string;
}

interface MasterListInstitution {
  title: string;
  address?: string;
  division?: string;
  region?: string;
}

interface ClassSectionMasterListPDFProps {
  students: Student[];
  section: MasterListSection;
  institution: MasterListInstitution;
  /** Blob/URL for the institution logo (from useInstitutionLogo). Optional. */
  schoolLogoUrl?: string | null;
  /** When the document was generated (pass in to keep render deterministic). */
  generatedOn?: string;
}

const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    paddingVertical: 32,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#4338ca',
    paddingBottom: 12,
    marginBottom: 16,
  },
  headerLogo: {
    height: 64,
    width: 64,
    objectFit: 'contain',
    marginRight: 16,
  },
  headerText: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  institutionTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  institutionSub: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 2,
    textAlign: 'center',
  },
  docTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#4338ca',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 4,
  },
  sectionInfo: {
    fontSize: 11,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 16,
  },
  groupHeading: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    backgroundColor: '#4338ca',
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 12,
  },
  table: {
    width: '100%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderTopWidth: 0,
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
    borderBottomColor: '#d1d5db',
  },
  tableRowAlt: {
    backgroundColor: '#f9fafb',
  },
  colNo: {
    width: '8%',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    textAlign: 'center',
  },
  colLrn: {
    width: '30%',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  colName: {
    width: '62%',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  cell: {
    fontSize: 9,
    color: '#374151',
  },
  cellHeader: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
  },
  summary: {
    marginTop: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 9,
    color: '#6b7280',
  },
});

const GENDER_ORDER = ['male', 'female', 'other'];
const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
};

/** LAST, First M. Ext */
const formatName = (student: Student): string => {
  const parts = [
    student.last_name ? `${student.last_name},` : '',
    student.first_name || '',
    student.middle_name ? `${student.middle_name.charAt(0)}.` : '',
    student.ext_name || '',
  ];
  return parts.filter(Boolean).join(' ');
};

const sortByName = (a: Student, b: Student): number => {
  const nameA = `${a.last_name} ${a.first_name} ${a.middle_name || ''}`.toLowerCase();
  const nameB = `${b.last_name} ${b.first_name} ${b.middle_name || ''}`.toLowerCase();
  return nameA.localeCompare(nameB);
};

export const ClassSectionMasterListPDF: React.FC<ClassSectionMasterListPDFProps> = ({
  students,
  section,
  institution,
  schoolLogoUrl,
  generatedOn,
}) => {
  // Group by gender, then sort each group alphabetically.
  const grouped: Record<string, Student[]> = {};
  students.forEach((student) => {
    const gender = (student.gender || 'other').toLowerCase();
    const key = GENDER_ORDER.includes(gender) ? gender : 'other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(student);
  });
  Object.keys(grouped).forEach((g) => grouped[g].sort(sortByName));

  const orderedGroups = GENDER_ORDER.filter((g) => grouped[g]?.length);

  const maleCount = grouped.male?.length || 0;
  const femaleCount = grouped.female?.length || 0;

  const institutionSubParts = [institution.address, institution.division, institution.region].filter(
    Boolean,
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {schoolLogoUrl ? <Image src={schoolLogoUrl} style={styles.headerLogo} /> : null}
          <View style={styles.headerText}>
            <Text style={styles.institutionTitle}>{institution.title}</Text>
            {institutionSubParts.length > 0 ? (
              <Text style={styles.institutionSub}>{institutionSubParts.join(' • ')}</Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.docTitle}>MASTER LIST OF STUDENTS</Text>
        <Text style={styles.sectionInfo}>
          Grade {section.grade_level} - {section.title}
          {section.academic_year ? ` • A.Y. ${section.academic_year}` : ''}
        </Text>

        {orderedGroups.map((gender) => {
          const list = grouped[gender];
          return (
            <View key={gender} wrap={false}>
              <Text style={styles.groupHeading}>
                {GENDER_LABELS[gender]} ({list.length})
              </Text>
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableRowHeader]}>
                  <View style={styles.colNo}>
                    <Text style={styles.cellHeader}>No.</Text>
                  </View>
                  <View style={styles.colLrn}>
                    <Text style={styles.cellHeader}>LRN</Text>
                  </View>
                  <View style={styles.colName}>
                    <Text style={styles.cellHeader}>Name</Text>
                  </View>
                </View>
                {list.map((student, index) => (
                  <View
                    key={student.id}
                    style={
                      index % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow
                    }
                  >
                    <View style={styles.colNo}>
                      <Text style={styles.cell}>{index + 1}</Text>
                    </View>
                    <View style={styles.colLrn}>
                      <Text style={styles.cell}>{student.lrn || '—'}</Text>
                    </View>
                    <View style={styles.colName}>
                      <Text style={styles.cell}>{formatName(student)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        {students.length === 0 ? (
          <Text style={{ fontSize: 10, color: '#6b7280', textAlign: 'center', marginTop: 20 }}>
            No students assigned to this section.
          </Text>
        ) : null}

        {/* Summary */}
        <View style={styles.summary}>
          <Text>
            Total: {students.length}  •  Male: {maleCount}  •  Female: {femaleCount}
          </Text>
          {generatedOn ? <Text>Generated on: {generatedOn}</Text> : null}
        </View>
      </Page>
    </Document>
  );
};

export default ClassSectionMasterListPDF;
