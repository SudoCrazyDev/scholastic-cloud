import React from 'react';
import { useConsolidatedGrades } from '../../../hooks/useConsolidatedGrades';
import { useAuth } from '../../../hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { subjectService } from '../../../services/subjectService';
import { Loader2, X, FileText, User, GraduationCap, Users, FileSpreadsheet } from 'lucide-react';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { ConsolidatedGradesPDF } from '../../ConsolidatedGrades/components/ConsolidatedGradesPDF';
import { exportConsolidatedGradesToExcel } from '../../../utils/excelExport';
import type { Subject } from '../../../types';

interface ClassSectionConsolidatedGradesTabProps {
  sectionId: string;
  selectedQuarter: number;
}

const getQuarterLabel = (quarter: number) => {
  const quarters = {
    1: 'First Quarter',
    2: 'Second Quarter',
    3: 'Third Quarter',
    4: 'Fourth Quarter',
  };
  return quarters[quarter as keyof typeof quarters] || `Quarter ${quarter}`;
};

const formatGrade = (grade: number | string | null) => {
  if (grade === null || grade === undefined) return '';
  const numGrade = typeof grade === 'string' ? parseFloat(grade) : grade;
  if (isNaN(numGrade)) return '';
  return Math.round(numGrade).toString();
};

const getGradeColor = (grade: number | string | null) => {
  if (grade === null || grade === undefined) return 'text-gray-500';
  const numGrade = typeof grade === 'string' ? parseFloat(grade) : grade;
  if (isNaN(numGrade)) return 'text-gray-500';
  if (numGrade >= 90) return 'text-green-600 font-semibold';
  if (numGrade >= 85) return 'text-blue-600 font-semibold';
  if (numGrade >= 80) return 'text-yellow-600 font-semibold';
  if (numGrade >= 75) return 'text-orange-600 font-semibold';
  return 'text-red-600 font-semibold';
};

const calculateFinalGrade = (subjects: Array<{ grade: number | string | null; subject_type?: string; parent_subject_id?: string | null }>) => {
  // Filter out child subjects - only include parent subjects and regular subjects
  const parentAndRegularSubjects = subjects.filter(subject => 
    subject.subject_type !== 'child'
  );
  
  const validGrades = parentAndRegularSubjects
    .map(subject => {
      const grade = typeof subject.grade === 'string' ? parseFloat(subject.grade) : subject.grade;
      return isNaN(grade as number) ? null : grade;
    })
    .filter(grade => grade !== null) as number[];

  if (validGrades.length === 0) return null;
  const sum = validGrades.reduce((acc, grade) => acc + grade, 0);
  return Math.round(sum / validGrades.length);
};

const getRemarks = (finalGrade: number | null) => {
  if (finalGrade === null) return 'N/A';
  if (finalGrade >= 98) return 'With Highest Honors';
  if (finalGrade >= 95) return 'With High Honor';
  if (finalGrade >= 90) return 'With Honors';
  return '';
};

const getRemarksColor = (finalGrade: number | null) => {
  if (finalGrade === null) return 'text-gray-500';
  if (finalGrade >= 90) return 'text-green-600';
  if (finalGrade >= 85) return 'text-blue-600';
  if (finalGrade >= 80) return 'text-yellow-600';
  if (finalGrade >= 75) return 'text-orange-600';
  return 'text-red-600';
};

/** Get grade for a column (single subject or average of variant group) from student's subject list. */
const getGradeForColumn = (
  grouped: Array<{ subject_id: string; grade: number | string | null }>,
  subjectIds: string[]
): number | string | null => {
  const grades = subjectIds
    .map(id => {
      const s = grouped.find((g: any) => g.subject_id === id);
      const g = s?.grade;
      if (g == null) return null;
      return typeof g === 'string' ? parseFloat(g) : g;
    })
    .filter((g): g is number => g !== null && !Number.isNaN(g));
  if (grades.length === 0) return null;
  if (grades.length === 1) return grades[0];
  return Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);
};


const ClassSectionConsolidatedGradesTab: React.FC<ClassSectionConsolidatedGradesTabProps> = ({
  sectionId,
  selectedQuarter,
}) => {
  const { user } = useAuth();
  const { data, isLoading, error } = useConsolidatedGrades(sectionId, selectedQuarter);
  // Fetch subjects with hierarchical data like the report card
  const {
    data: subjectsResponse,
    isLoading: subjectsLoading,
    error: subjectsError,
  } = useQuery({
    queryKey: ['subjects', { class_section_id: sectionId }],
    queryFn: () => subjectService.getSubjects({ class_section_id: sectionId }),
    enabled: !!sectionId,
  });

  // Helper function to get base title (without variant)
  const getBaseTitle = (title: string) => {
    return title.split(/[-(]/)[0].trim();
  };

  // Use subjects with hierarchical sorting: order by subject order, child subjects beside their parent.
  // Only group "variant siblings" (same base title, same parent, multiple with variant); never merge parent and child.
  const baseSubjects = React.useMemo(() => {
    if (!subjectsResponse?.data || !data || !data.students.length) return [];
    
    const subjects = subjectsResponse.data as Subject[];
    
    // Sort: parent subjects by order, then each parent's children immediately after by their order
    const sortedSubjects = [...subjects].sort((a, b) => {
      if (a.subject_type === 'parent' && b.subject_type === 'parent') {
        return a.order - b.order;
      }
      if (a.subject_type === 'child' && b.subject_type === 'child') {
        const aParentOrder = subjects.find(s => s.id === a.parent_subject_id)?.order ?? 999;
        const bParentOrder = subjects.find(s => s.id === b.parent_subject_id)?.order ?? 999;
        if (aParentOrder !== bParentOrder) return aParentOrder - bParentOrder;
        return a.order - b.order;
      }
      if (a.subject_type === 'parent' && b.subject_type === 'child') {
        if (b.parent_subject_id === a.id) return -1;
        return a.order - (subjects.find(s => s.id === b.parent_subject_id)?.order ?? 999);
      }
      if (a.subject_type === 'child' && b.subject_type === 'parent') {
        if (a.parent_subject_id === b.id) return 1;
        return (subjects.find(s => s.id === a.parent_subject_id)?.order ?? 999) - b.order;
      }
      return a.order - b.order;
    });
    
    // Build columns in sorted order: one per subject, or one per variant-sibling group (same base + same parent, multiple with variant)
    const result: Array<{ base: string; subject_ids: string[]; subject_title: string; order: number }> = [];
    let i = 0;
    while (i < sortedSubjects.length) {
      const s = sortedSubjects[i];
      const baseTitle = getBaseTitle(s.title);
      const parentId = s.parent_subject_id ?? null;
      const hasVariant = !!(s.variant && s.variant.trim() !== '');
      if (hasVariant) {
        const group = [s];
        let j = i + 1;
        while (j < sortedSubjects.length) {
          const t = sortedSubjects[j];
          if (!t.variant || t.variant.trim() === '') break;
          if (getBaseTitle(t.title) !== baseTitle || (t.parent_subject_id ?? null) !== parentId) break;
          group.push(t);
          j++;
        }
        if (group.length > 1) {
          result.push({
            base: baseTitle,
            subject_ids: group.map(x => x.id),
            subject_title: baseTitle,
            order: Math.min(...group.map(x => x.order)),
          });
          i = j;
        } else {
          result.push({ base: s.title, subject_ids: [s.id], subject_title: s.title, order: s.order });
          i++;
        }
      } else {
        result.push({ base: s.title, subject_ids: [s.id], subject_title: s.title, order: s.order });
        i++;
      }
    }
    return result;
  }, [subjectsResponse, data]);
  // Per-student list of subjects with subject_id for lookup; no merging of parent/child
  const studentsWithGroupedSubjects = React.useMemo(() => {
    if (!data) return [];
    return data.students.map((student: any) => ({
      ...student,
      groupedSubjects: (student.subjects || []).map((s: any) => ({
        subject_id: s.subject_id,
        subject_title: s.subject_title,
        grade: s.grade,
        subject_type: s.subject_type,
        parent_subject_id: s.parent_subject_id,
      })),
    }));
  }, [data]);

  if (isLoading || subjectsLoading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-2 text-sm text-gray-600">Loading consolidated grades...</p>
        </div>
      </div>
    );
  }

  if (error || subjectsError) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <div className="text-center">
          <X className="mx-auto h-8 w-8 text-red-600" />
          <p className="mt-2 text-sm text-gray-600">
            Failed to load consolidated grades. Please try again.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { section, students } = data;

  // Add a local type for students with gender
  type ConsolidatedStudent = typeof students[number] & { gender?: string };
  const studentsWithGender = students as ConsolidatedStudent[];

  // Group students by gender and sort each group by last name
  const groupedStudents: Record<string, ConsolidatedStudent[]> = studentsWithGender.reduce((acc, student) => {
    const gender = student.gender ? student.gender.toLowerCase() : 'other';
    if (!acc[gender]) acc[gender] = [];
    acc[gender].push(student);
    return acc;
  }, {} as Record<string, ConsolidatedStudent[]>);

  // Sort each gender group by last name alphabetically
  Object.keys(groupedStudents).forEach(gender => {
    groupedStudents[gender].sort((a, b) => {
      const lastNameA = a.student_name.split(',')[0]?.trim() || '';
      const lastNameB = b.student_name.split(',')[0]?.trim() || '';
      return lastNameA.localeCompare(lastNameB);
    });
  });

  const genderLabels: Record<string, string> = {
    male: 'Male',
    female: 'Female',
    other: 'Other',
  };

  // Get institution name from user's default institution
  const defaultInstitution = user?.user_institutions?.find((ui: any) => ui.is_default)?.institution;
  const institutionName = defaultInstitution?.name || 'School Institution';

  return (
    <div className="">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Consolidated Grades
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4" />
                <span className="font-medium">{section.title}</span>
              </div>
              <Badge color="blue">{getQuarterLabel(selectedQuarter)}</Badge>
              <Badge color="green">{section.academic_year}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <>
                <PDFDownloadLink
                  document={
                    <ConsolidatedGradesPDF 
                      data={data} 
                      institutionName={institutionName}
                    />
                  }
                  fileName={`consolidated-grades-${section.title}-q${selectedQuarter}-${section.academic_year}.pdf`}
                >
                  {({loading }) => (
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={loading}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      {loading ? 'Generating PDF...' : 'Export PDF'}
                    </Button>
                  )}
                </PDFDownloadLink>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => exportConsolidatedGradesToExcel(
                    data, 
                    baseSubjects, 
                    studentsWithGroupedSubjects, 
                    institutionName, 
                    selectedQuarter
                  )}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Export Excel
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Grades Table Grouped by Gender: Male first, then Female, then Others */}
      {/* Male Students Table */}
      {groupedStudents["male"] && groupedStudents["male"].length > 0 && (
        <div key="male" className="mb-10">
          <h2 className="text-xl font-bold text-gray-700 mb-2">
            {genderLabels["male"]} Students
          </h2>
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
                  <tr>
                    <th className="sticky left-0 z-10 px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gradient-to-r from-blue-50 to-indigo-50 border-r border-gray-200">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Student
                      </div>
                    </th>
                    {baseSubjects.map((subject) => (
                      <th
                        key={subject.subject_ids.join('-')}
                        className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-gray-200 min-w-[140px]"
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-800">{subject.subject_title}</span>
                        </div>
                      </th>
                    ))}
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-gray-200 min-w-[120px]">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-800">Final Grade</span>
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[120px]">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-800">Remarks</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {groupedStudents["male"].map((student, index) => {
                    const grouped = studentsWithGroupedSubjects.find((s: any) => s.student_id === student.student_id)?.groupedSubjects || [];
                    return (
                      <tr 
                        key={student.student_id} 
                        className={`hover:bg-gray-50 transition-colors duration-150 ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
                        }`}
                      >
                        <td className="sticky left-0 z-10 px-6 py-4 whitespace-nowrap bg-white border-r border-gray-200">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900 uppercase">
                                {student.student_name}
                              </div>
                            </div>
                          </div>
                        </td>
                        {baseSubjects.map((subject) => {
                          const grade = getGradeForColumn(grouped, subject.subject_ids);
                          return (
                            <td key={subject.subject_ids.join('-')} className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                              <div className="text-center">
                                <div className={`text-sm font-medium ${getGradeColor(grade)}`}>
                                  {formatGrade(grade)}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                          <div className="text-center">
                            <div className={`text-sm font-medium ${getGradeColor(calculateFinalGrade(grouped))}`}> 
                              {formatGrade(calculateFinalGrade(grouped))}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-center">
                            <div className={`text-xs font-medium ${getRemarksColor(calculateFinalGrade(grouped))}`}> 
                              {getRemarks(calculateFinalGrade(grouped))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* Female Students Table */}
      {groupedStudents["female"] && groupedStudents["female"].length > 0 && (
        <div key="female" className="mb-10">
          <h2 className="text-xl font-bold text-gray-700 mb-2">
            {genderLabels["female"]} Students
          </h2>
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
                  <tr>
                    <th className="sticky left-0 z-10 px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gradient-to-r from-blue-50 to-indigo-50 border-r border-gray-200">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Student
                      </div>
                    </th>
                    {baseSubjects.map((subject) => (
                      <th
                        key={subject.subject_ids.join('-')}
                        className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-gray-200 min-w-[140px]"
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-800">{subject.subject_title}</span>
                        </div>
                      </th>
                    ))}
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-gray-200 min-w-[120px]">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-800">Final Grade</span>
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[120px]">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-800">Remarks</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {groupedStudents["female"].map((student, index) => {
                    const grouped = studentsWithGroupedSubjects.find((s: any) => s.student_id === student.student_id)?.groupedSubjects || [];
                    return (
                      <tr 
                        key={student.student_id} 
                        className={`hover:bg-gray-50 transition-colors duration-150 ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
                        }`}
                      >
                        <td className="sticky left-0 z-10 px-6 py-4 whitespace-nowrap bg-white border-r border-gray-200">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900 uppercase">
                                {student.student_name}
                              </div>
                            </div>
                          </div>
                        </td>
                        {baseSubjects.map((subject) => {
                          const grade = getGradeForColumn(grouped, subject.subject_ids);
                          return (
                            <td key={subject.subject_ids.join('-')} className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                              <div className="text-center">
                                <div className={`text-sm font-medium ${getGradeColor(grade)}`}>
                                  {formatGrade(grade)}
                                </div>
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                          <div className="text-center">
                            <div className={`text-sm font-medium ${getGradeColor(calculateFinalGrade(grouped))}`}> 
                              {formatGrade(calculateFinalGrade(grouped))}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-center">
                            <div className={`text-xs font-medium ${getRemarksColor(calculateFinalGrade(grouped))}`}> 
                              {getRemarks(calculateFinalGrade(grouped))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* Other Gender Tables */}
      {Object.entries(groupedStudents)
        .filter(([gender]) => gender !== "male" && gender !== "female")
        .map(([gender, studentsList]) => (
          studentsList.length === 0 ? null : (
            <div key={gender} className="mb-10">
              <h2 className="text-xl font-bold text-gray-700 mb-2">
                {genderLabels[gender] || 'Other'} Students
              </h2>
              <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
                      <tr>
                        <th className="sticky left-0 z-10 px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gradient-to-r from-blue-50 to-indigo-50 border-r border-gray-200">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Student
                          </div>
                        </th>
                        {baseSubjects.map((subject) => (
                          <th
                            key={subject.subject_ids.join('-')}
                            className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-gray-200 min-w-[140px]"
                          >
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-800">{subject.subject_title}</span>
                            </div>
                          </th>
                        ))}
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-gray-200 min-w-[120px]">
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-800">Final Grade</span>
                          </div>
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[120px]">
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-800">Remarks</span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {studentsList.map((student, index) => {
                        const grouped = studentsWithGroupedSubjects.find((s: any) => s.student_id === student.student_id)?.groupedSubjects || [];
                        return (
                          <tr 
                            key={student.student_id} 
                            className={`hover:bg-gray-50 transition-colors duration-150 ${
                              index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
                            }`}
                          >
                            <td className="sticky left-0 z-10 px-6 py-4 whitespace-nowrap bg-white border-r border-gray-200">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                                  <User className="w-4 h-4 text-blue-600" />
                                </div>
                                <div className="ml-3">
<div className="text-sm font-medium text-gray-900 uppercase">
                                  {student.student_name}
                                </div>
                                </div>
                              </div>
                            </td>
                            {baseSubjects.map((subject) => {
                              const grade = getGradeForColumn(grouped, subject.subject_ids);
                              return (
                                <td key={subject.subject_ids.join('-')} className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                                  <div className="text-center">
                                    <div className={`text-sm font-medium ${getGradeColor(grade)}`}>
                                      {formatGrade(grade)}
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                            <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                              <div className="text-center">
                                <div className={`text-sm font-medium ${getGradeColor(calculateFinalGrade(grouped))}`}> 
                                  {formatGrade(calculateFinalGrade(grouped))}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-center">
                                <div className={`text-xs font-medium ${getRemarksColor(calculateFinalGrade(grouped))}`}> 
                                  {getRemarks(calculateFinalGrade(grouped))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        ))}

      {/* Summary */}
      <div className="mt-6 bg-white shadow-sm border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              <span className="font-medium">Total Students:</span>
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md font-semibold">
                {students.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-green-500" />
              <span className="font-medium">Total Subjects:</span>
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-md font-semibold">
                {students[0]?.subjects.length || 0}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileText className="w-4 h-4" />
            <span>Consolidated Grades Report</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassSectionConsolidatedGradesTab; 