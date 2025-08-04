import React, { useState, useEffect } from 'react'
import { 
  UserIcon,
  UsersIcon,
  UserGroupIcon,
  AcademicCapIcon,
  CalculatorIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'
import { Select } from '../../../components/select'
import { useStudents } from '../../../hooks/useStudents'
import { useStudentRunningGrades } from '../../../hooks/useStudentRunningGrades'
import { StudentGradesByQuarter } from './StudentGradesByQuarter'
import { Alert } from '../../../components/alert'
import { ErrorHandler } from '../../../utils/errorHandler'

interface ClassRecordTabProps {
  subjectId: string
  classSectionId?: string
}

export const ClassRecordTab: React.FC<ClassRecordTabProps> = ({ subjectId, classSectionId }) => {
  // Fetch students
  const { students, loading: studentsLoading, error: studentsError } = useStudents({ class_section_id: classSectionId });
  
  // Fetch running grades for all students
  const { data: runningGradesData, isLoading: gradesLoading, error: gradesError } = useStudentRunningGrades({
    subjectId,
    classSectionId,
  });
console.log(students);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Quarter filter state for mobile/tablet
  const [selectedQuarter, setSelectedQuarter] = useState<string>('1');
  
  // Quarter options for the filter
  const quarterOptions = [
    { value: '1', label: 'Quarter 1' },
    { value: '2', label: 'Quarter 2' },
    { value: '3', label: 'Quarter 3' },
    { value: '4', label: 'Quarter 4' },
  ];

  // Handle errors
  useEffect(() => {
    if (studentsError) {
      setAlert({ type: 'error', message: ErrorHandler.handle(studentsError).message });
    } else if (gradesError) {
      setAlert({ type: 'error', message: ErrorHandler.handle(gradesError).message });
    } else {
      setAlert(null);
    }
  }, [studentsError, gradesError]);

  // Group running grades by student
  const gradesByStudent = runningGradesData?.data?.reduce((acc: any, grade: any) => {
    if (!acc[grade.student_id]) {
      acc[grade.student_id] = [];
    }
    acc[grade.student_id].push(grade);
    return acc;
  }, {}) || {};

  // Calculate statistics
  const totalStudents = students.length;
  const totalGrades = runningGradesData?.data?.length || 0;
  const gradesWithFinalGrade = runningGradesData?.data?.filter((grade: any) => grade.final_grade !== null).length || 0;
  const completionRate = totalGrades > 0 ? Math.round((gradesWithFinalGrade / totalGrades) * 100) : 0;

  // Gender distribution
  const genderDistribution = students.reduce((acc: any, student: any) => {
    acc[student.gender] = (acc[student.gender] || 0) + 1;
    return acc;
  }, {});

  if (studentsLoading || gradesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {alert && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
          show={true}
        />
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Class Records</h3>
          <p className="text-sm text-gray-500">Manage final grades for {students.length} students</p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <CalculatorIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Click calculator icon to use calculated grade</span>
          <span className="sm:hidden">Use calculator for auto-grade</span>
        </div>
      </div>

      {/* Mobile Summary - Only visible on mobile and tablet */}
      <div className="lg:hidden bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <UserGroupIcon className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-900">{totalStudents} Students</span>
            </div>
            <div className="flex items-center space-x-2">
              <AcademicCapIcon className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-900">{totalGrades} Grades</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <CalculatorIcon className="w-5 h-5 text-yellow-600" />
            <span className="text-sm font-medium text-gray-900">{completionRate}% Complete</span>
          </div>
        </div>
      </div>

      {/* Quarter Filter - Only visible on mobile and tablet */}
      <div className="lg:hidden bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-900">Filter by Quarter</h4>
          <span className="text-xs text-gray-500">Select to focus on specific quarter</span>
        </div>
        <Select
          value={selectedQuarter}
          onChange={(e) => setSelectedQuarter(e.target.value)}
          options={quarterOptions}
          placeholder="Select quarter"
          className="w-full"
        />
        <div className="mt-3 p-2 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-700">
            Showing Quarter {selectedQuarter} grades for {students.length} students
          </p>
        </div>
      </div>

      {/* Statistics - Hidden on mobile and tablet */}
      <div className="hidden lg:grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <UserGroupIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Students</p>
              <p className="text-lg font-semibold text-gray-900">{totalStudents}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <AcademicCapIcon className="w-4 h-4 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Grades</p>
              <p className="text-lg font-semibold text-gray-900">{totalGrades}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
              <CalculatorIcon className="w-4 h-4 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Final Grades Set</p>
              <p className="text-lg font-semibold text-gray-900">{gradesWithFinalGrade}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
              <ChartBarIcon className="w-4 h-4 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Completion</p>
              <p className="text-lg font-semibold text-gray-900">{completionRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gender Distribution - Hidden on mobile and tablet */}
      <div className="hidden lg:block bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Student Distribution</h4>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
            <UserIcon className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-900">Male Students</p>
              <p className="text-lg font-semibold text-blue-700">{genderDistribution.male || 0}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-pink-50 rounded-lg">
            <UsersIcon className="w-5 h-5 text-pink-600" />
            <div>
              <p className="text-sm font-medium text-pink-900">Female Students</p>
              <p className="text-lg font-semibold text-pink-700">{genderDistribution.female || 0}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <UserGroupIcon className="w-5 h-5 text-gray-600" />
            <div>
              <p className="text-sm font-medium text-gray-900">Other Students</p>
              <p className="text-lg font-semibold text-gray-700">{genderDistribution.other || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">How to Use Final Grades</h4>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm text-blue-800">
          <div>
            <span className="font-medium">Manual Input:</span> Type the final grade directly in the input field
          </div>
          <div>
            <span className="font-medium">Calculated Grade:</span> Click the calculator icon to use the system-calculated grade
          </div>
        </div>
      </div>

      {/* Student Grades List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h4 className="text-sm font-medium text-gray-900">Student Final Grades by Quarter</h4>
        </div>
        
        <div className="divide-y divide-gray-200">
          {students.length === 0 ? (
            <div className="text-center py-12">
              <UserGroupIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Students Found</h3>
              <p className="text-gray-500">No students are assigned to this class section.</p>
            </div>
          ) : (
            // Group students by gender and sort by last name
            (() => {
              // Sort students by last name first
              const sortedStudents = [...students].sort((a, b) => 
                a.last_name.localeCompare(b.last_name)
              );
              
              // Group by gender
              const groupedStudents = sortedStudents.reduce((acc, student) => {
                if (!acc[student.gender]) {
                  acc[student.gender] = [];
                }
                acc[student.gender].push(student);
                return acc;
              }, {} as Record<string, typeof students>);
              
              // Define gender order for display
              const genderOrder: ('male' | 'female' | 'other')[] = ['male', 'female', 'other'];
              
              return genderOrder.map((gender) => {
                const studentsInGroup = groupedStudents[gender] || [];
                if (studentsInGroup.length === 0) return null;
                
                return (
                  <div key={gender} className="border-b border-gray-200 last:border-b-0">
                    {/* Gender Group Header */}
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <div className="flex items-center space-x-2">
                        {gender === 'male' && <UserIcon className="w-4 h-4 text-blue-600" />}
                        {gender === 'female' && <UsersIcon className="w-4 h-4 text-pink-600" />}
                        {gender === 'other' && <UserGroupIcon className="w-4 h-4 text-gray-600" />}
                        <h5 className="text-sm font-medium text-gray-900 capitalize">
                          {gender} Students ({studentsInGroup.length})
                        </h5>
                      </div>
                    </div>
                    
                    {/* Students in this gender group */}
                    <div className="divide-y divide-gray-100">
                      {studentsInGroup.map((student) => (
                        <StudentGradesByQuarter
                          key={student.id}
                          student={student}
                          subjectId={subjectId}
                          runningGrades={gradesByStudent[student.id] || []}
                          academicYear="2025-2026"
                          selectedQuarter={selectedQuarter}
                        />
                      ))}
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>
      </div>
    </div>
  );
}; 