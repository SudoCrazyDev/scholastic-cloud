import React from 'react';
import { FinalGradeInput } from './FinalGradeInput';
import type { StudentRunningGrade } from '../../../services/studentRunningGradeService';
import type { Student } from '../../../types';
import { toNumber } from '../../../utils/gradeUtils';

interface StudentGradesByQuarterProps {
  student: Student;
  subjectId: string;
  runningGrades: StudentRunningGrade[];
  academicYear?: string;
  selectedQuarter?: string;
  // Batch submission props
  isBatchMode?: boolean;
  onGradeChange?: (data: {
    studentId: string;
    subjectId: string;
    quarter: '1' | '2' | '3' | '4';
    finalGrade: number;
    gradeId?: string;
    academicYear: string;
    hasChanged: boolean;
  }) => void;
  isDisabled?: boolean;
}

export const StudentGradesByQuarter: React.FC<StudentGradesByQuarterProps> = ({
  student,
  subjectId,
  runningGrades,
  academicYear = '2025-2026',
  selectedQuarter,
  isBatchMode = false,
  onGradeChange,
  isDisabled = false,
}) => {
  // Group grades by quarter
  const gradesByQuarter = runningGrades.reduce((acc, grade) => {
    acc[grade.quarter] = grade;
    return acc;
  }, {} as Record<string, StudentRunningGrade>);

  // All quarters for desktop display
  const allQuarters: ('1' | '2' | '3' | '4')[] = ['1', '2', '3', '4'];
  
  // Filtered quarters for mobile/tablet
  const filteredQuarters = selectedQuarter 
    ? [selectedQuarter as '1' | '2' | '3' | '4']
    : allQuarters;

  // Format student name: first_name last_name middle_name(first letter only)
  const formatStudentName = () => {
    const firstName = student.first_name;
    const lastName = student.last_name;
    const middleInitial = student.middle_name ? student.middle_name.charAt(0) + '.' : '';
    const extName = student.ext_name ? ` ${student.ext_name}` : '';
    
    return `${lastName}, ${firstName} ${middleInitial ? ` ${middleInitial}` : ''}${extName}`;
  };

  return (
    <div className="group relative bg-white rounded-xl border border-gray-200/60 shadow-sm hover:shadow-md hover:border-gray-300/60 transition-all duration-300 ease-out overflow-hidden">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-50/30 via-transparent to-purple-50/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative flex items-center justify-between p-4">
        {/* Student Info Section */}
        <div className="flex-1 min-w-0">
          <h4 className="text-lg font-semibold text-gray-900 truncate leading-tight">
            {formatStudentName()}
          </h4>
          <div className="flex items-center space-x-4 mt-1">
            <p className="text-sm text-gray-600 font-medium">
              LRN: <span className="text-gray-800">{student.lrn || 'N/A'}</span>
            </p>
            <div className="flex items-center space-x-1">
              <div className={`w-2 h-2 rounded-full ${student.gender === 'male' ? 'bg-blue-400' : student.gender === 'female' ? 'bg-pink-400' : 'bg-gray-400'}`} />
              <span className="text-xs text-gray-500 capitalize">{student.gender || 'N/A'}</span>
            </div>
          </div>
          {selectedQuarter && (
            <div className="lg:hidden flex items-center space-x-1 mt-1">
              <span className="text-xs text-blue-600 font-medium">Showing: Quarter {selectedQuarter}</span>
            </div>
          )}
        </div>

        {/* Quarter Grades Section */}
        <div className="flex items-center space-x-6">
          {/* Grade Inputs - Desktop: Show all quarters */}
          <div className="hidden lg:flex items-center space-x-6">
            {allQuarters.map((quarter) => {
              const grade = gradesByQuarter[quarter];
              const calculatedGrade = grade?.grade;
              const finalGrade = grade?.final_grade || 0;

              return (
                <div key={quarter} className="flex flex-col items-center space-y-2">
                  <div className="relative">
                    <FinalGradeInput
                      studentId={student.id}
                      subjectId={subjectId}
                      quarter={quarter}
                      currentFinalGrade={toNumber(finalGrade)}
                      calculatedGrade={calculatedGrade}
                      gradeId={grade?.id}
                      academicYear={academicYear}
                      isBatchMode={isBatchMode}
                      onGradeChange={onGradeChange}
                      isDisabled={isDisabled}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Grade Inputs - Mobile/Tablet: Show filtered quarters */}
          <div className={`lg:hidden flex items-center ${filteredQuarters.length === 1 ? 'justify-center' : 'space-x-6'}`}>
            {filteredQuarters.map((quarter) => {
              const grade = gradesByQuarter[quarter];
              const calculatedGrade = grade?.grade;
              const finalGrade = grade?.final_grade || 0;

              return (
                <div key={quarter} className="flex flex-col items-center space-y-2">
                  <div className="relative">
                    <FinalGradeInput
                      studentId={student.id}
                      subjectId={subjectId}
                      quarter={quarter}
                      currentFinalGrade={toNumber(finalGrade)}
                      calculatedGrade={calculatedGrade}
                      gradeId={grade?.id}
                      academicYear={academicYear}
                      isBatchMode={isBatchMode}
                      onGradeChange={onGradeChange}
                      isDisabled={isDisabled}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </div>
  );
}; 