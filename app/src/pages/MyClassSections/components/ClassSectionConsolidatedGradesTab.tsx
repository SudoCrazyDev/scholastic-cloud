import React from 'react';
import { useConsolidatedGrades } from '../../../hooks/useConsolidatedGrades';
import { useAuth } from '../../../hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { subjectService } from '../../../services/subjectService';
import { Loader2, X, FileText, User, GraduationCap, Users } from 'lucide-react';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { ConsolidatedGradesPDF } from '../../ConsolidatedGrades/components/ConsolidatedGradesPDF';
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
  if (grade === null || grade === undefined) return 'N/A';
  const numGrade = typeof grade === 'string' ? parseFloat(grade) : grade;
  if (isNaN(numGrade)) return 'N/A';
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

const calculateFinalGrade = (subjects: Array<{ grade: number | string | null }>) => {
  const validGrades = subjects
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

  // Use subjects with hierarchical sorting and group variants by base title
  const baseSubjects = React.useMemo(() => {
    if (!subjectsResponse?.data || !data || !data.students.length) return [];
    
    const subjects = subjectsResponse.data as Subject[];
    
    // Apply the same sorting logic as the report card
    const sortedSubjects = subjects
      .sort((a, b) => {
        // If both are parent subjects, sort by order
        if (a.subject_type === 'parent' && b.subject_type === 'parent') {
          return a.order - b.order;
        }
        
        // If both are child subjects, group by parent and then by order
        if (a.subject_type === 'child' && b.subject_type === 'child') {
          // First sort by parent order, then by child order
          const aParentOrder = subjects.find(s => s.id === a.parent_subject_id)?.order || 0;
          const bParentOrder = subjects.find(s => s.id === b.parent_subject_id)?.order || 0;
          
          if (aParentOrder !== bParentOrder) {
            return aParentOrder - bParentOrder;
          }
          // Then by order within the same parent
          return a.order - b.order;
        }
        
        // If one is parent and one is child
        if (a.subject_type === 'parent' && b.subject_type === 'child') {
          // If the child belongs to this parent, child comes after parent
          if (b.parent_subject_id === a.id) {
            return -1;
          }
          // If the child belongs to a different parent, sort by parent order
          const aOrder = a.order;
          const bParentOrder = subjects.find(s => s.id === b.parent_subject_id)?.order || 0;
          return aOrder - bParentOrder;
        }
        
        if (a.subject_type === 'child' && b.subject_type === 'parent') {
          // If the child belongs to this parent, child comes after parent
          if (a.parent_subject_id === b.id) {
            return 1;
          }
          // If the child belongs to a different parent, sort by parent order
          const aParentOrder = subjects.find(s => s.id === a.parent_subject_id)?.order || 0;
          const bOrder = b.order;
          return aParentOrder - bOrder;
        }
        
        return a.order - b.order;
      });
    
    // Group subjects by base title (without variant)
    const groupedSubjects: Record<string, Subject[]> = {};
    sortedSubjects.forEach(subject => {
      const baseTitle = getBaseTitle(subject.title);
      if (!groupedSubjects[baseTitle]) {
        groupedSubjects[baseTitle] = [];
      }
      groupedSubjects[baseTitle].push(subject);
    });
    
    console.log('Grouped subjects:', Object.keys(groupedSubjects).map(baseTitle => ({
      baseTitle,
      subjects: groupedSubjects[baseTitle].map(s => ({
        title: s.title,
        type: s.subject_type,
        order: s.order,
        parent_id: s.parent_subject_id,
      }))
    })));
    
    // Return grouped subjects with all subject IDs for each base title
    return Object.keys(groupedSubjects).map(baseTitle => ({
      base: baseTitle,
      subject_ids: groupedSubjects[baseTitle].map(s => s.id),
      subject_title: baseTitle,
    }));
  }, [subjectsResponse, data]);
  // For each student, group grades by base subject title
  const studentsWithGroupedSubjects = React.useMemo(() => {
    if (!data) return [];
    return data.students.map((student: any) => {
      const grouped: Record<string, { grades: (number | string | null)[] }> = {};
      student.subjects.forEach((subject: any) => {
        const base = getBaseTitle(subject.subject_title);
        if (!grouped[base]) grouped[base] = { grades: [] };
        grouped[base].grades.push(subject.grade);
      });
      
      // For each base, average grades (or use single if only one)
      const groupedSubjects = Object.keys(grouped).map(base => {
        const grades = grouped[base].grades
          .map(g => (g === null || g === undefined ? null : typeof g === 'string' ? parseFloat(g) : g))
          .filter(g => g !== null && !isNaN(g as number)) as number[];
        let avg: number | null = null;
        if (grades.length > 0) {
          avg = Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);
        }
        return {
          subject_title: base,
          grade: avg,
        };
      });
      
      return {
        ...student,
        groupedSubjects,
      };
    });
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

  // Group students by gender
  const groupedStudents: Record<string, ConsolidatedStudent[]> = studentsWithGender.reduce((acc, student) => {
    const gender = student.gender ? student.gender.toLowerCase() : 'other';
    if (!acc[gender]) acc[gender] = [];
    acc[gender].push(student);
    return acc;
  }, {} as Record<string, ConsolidatedStudent[]>);

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
                        key={subject.base}
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
                              <div className="text-sm font-medium text-gray-900">
                                {student.student_name}
                              </div>
                            </div>
                          </div>
                        </td>
                        {baseSubjects.map((subject) => {
                          const subj = grouped.find((g: any) => g.subject_title === subject.subject_title);
                          return (
                            <td key={subject.base} className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                              <div className="text-center">
                                <div className={`text-sm font-medium ${getGradeColor(subj?.grade)}`}>
                                  {formatGrade(subj?.grade)}
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
                        key={subject.base}
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
                              <div className="text-sm font-medium text-gray-900">
                                {student.student_name}
                              </div>
                            </div>
                          </div>
                        </td>
                        {baseSubjects.map((subject) => {
                          const subj = grouped.find((g: any) => g.subject_title === subject.subject_title);
                          return (
                            <td key={subject.base} className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                              <div className="text-center">
                                <div className={`text-sm font-medium ${getGradeColor(subj?.grade)}`}>
                                  {formatGrade(subj?.grade)}
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
                            key={subject.base}
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
                                  <div className="text-sm font-medium text-gray-900">
                                    {student.student_name}
                                  </div>
                                </div>
                              </div>
                            </td>
                            {baseSubjects.map((subject) => {
                              const subj = grouped.find((g: any) => g.subject_title === subject.subject_title);
                              return (
                                <td key={subject.base} className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                                  <div className="text-center">
                                    <div className={`text-sm font-medium ${getGradeColor(subj?.grade)}`}>
                                      {formatGrade(subj?.grade)}
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