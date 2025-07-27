import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Trophy, 
  Medal, 
  Award, 
  GraduationCap, 
  Eye,
  Filter
} from 'lucide-react';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import type { Student } from '../../../types';
import { useConsolidatedGrades } from '../../../hooks/useConsolidatedGrades';
import { calculateFinalGrade } from '../../../utils/gradeUtils';

interface StudentRankingTabProps {
  students: (Student & { assignmentId: string })[];
  classSectionTitle: string;
  sectionId: string;
  quarter: number;
}

interface StudentWithRanking extends Student {
  assignmentId: string;
  gpa: number;
  rank: number;
  remarks: string;
}

// Remarks logic from Consolidated Grades
const getRemarks = (finalGrade: number | null) => {
  if (finalGrade === null) return 'N/A';
  if (finalGrade >= 98) return 'With Highest Honors';
  if (finalGrade >= 95) return 'With High Honor';
  if (finalGrade >= 90) return 'With Honors';
  return '';
};

const StudentRankingTab: React.FC<StudentRankingTabProps> = ({ students, classSectionTitle, sectionId, quarter }) => {
  const [selectedQuarter, setSelectedQuarter] = useState(quarter);
  const { data, isLoading, error } = useConsolidatedGrades(sectionId, selectedQuarter);

  const getFullName = (student: Student) => {
    const parts = [student.first_name, student.middle_name, student.last_name, student.ext_name];
    return parts.filter(Boolean).join(' ');
  };

  // Quarter options
  const quarterOptions = [
    { value: '1', label: '1st Quarter' },
    { value: '2', label: '2nd Quarter' },
    { value: '3', label: '3rd Quarter' },
    { value: '4', label: '4th Quarter' },
  ];

  // Map consolidated grades to student rankings
  let studentsWithRanking: StudentWithRanking[] = [];
  if (data && data.students) {
    studentsWithRanking = data.students
      .map((student) => {
        const gpa = calculateFinalGrade(student.subjects);
        return {
          ...students.find(s => s.id === student.student_id)!,
          assignmentId: students.find(s => s.id === student.student_id)?.assignmentId || '',
          gpa: gpa ?? 0,
          rank: 0, // will be set after sorting
          remarks: getRemarks(gpa)
        };
      })
      // Only include students with a valid GPA and a non-blank, non-'N/A' remark
      .filter((s) => typeof s.gpa === 'number' && !isNaN(s.gpa) && s.gpa !== null && s.remarks && s.remarks !== '' && s.remarks !== 'N/A')
      .sort((a, b) => b.gpa - a.gpa);
    // Update ranks after sorting
    studentsWithRanking.forEach((student, index) => {
      student.rank = index + 1;
    });
  }

  const totalStudents = studentsWithRanking.length;

  const StudentCard: React.FC<{ student: StudentWithRanking }> = ({ student }) => {
    // Choose icon and color based on remarks
    let icon = <GraduationCap className="w-6 h-6 text-gray-400" />;
    let color = 'bg-gray-100';
    let textColor = 'text-gray-900';
    if (student.remarks === 'With Highest Honors') {
      icon = <Trophy className="w-6 h-6 text-yellow-500" />;
      color = 'bg-yellow-50';
      textColor = 'text-yellow-800';
    } else if (student.remarks === 'With High Honor') {
      icon = <Medal className="w-6 h-6 text-blue-500" />;
      color = 'bg-blue-50';
      textColor = 'text-blue-800';
    } else if (student.remarks === 'With Honors') {
      icon = <Award className="w-6 h-6 text-green-500" />;
      color = 'bg-green-50';
      textColor = 'text-green-800';
    }
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`p-4 rounded-lg border ${color} hover:shadow-md transition-all duration-200`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-full ${color} text-white`}>{icon}</div>
            <div>
              <h3 className="font-semibold text-gray-900">{getFullName(student)}</h3>
              <p className="text-sm text-gray-600">LRN: {student.lrn}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">{student.gpa}</div>
            <div className="text-sm text-gray-600">GPA</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">Rank: <span className="font-semibold">{student.rank}</span></span>
            <span className="text-gray-600">of <span className="font-semibold">{totalStudents}</span></span>
            <span className={`capitalize ${textColor}`}>{student.remarks}</span>
          </div>
        </div>
      </motion.div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <GraduationCap className="w-16 h-16 text-gray-400 mx-auto mb-4 animate-spin" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Loading student rankings...</h3>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <GraduationCap className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load rankings</h3>
        <p className="text-gray-600">Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-100 rounded-lg">
            <Trophy className="w-8 h-8 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Student Ranking</h2>
            <p className="text-gray-600">Academic excellence recognition for {classSectionTitle}</p>
          </div>
        </div>
        
        {/* Quarter Filter */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Quarter:</span>
          </div>
          <Select
            value={selectedQuarter.toString()}
            onChange={(e) => setSelectedQuarter(parseInt(e.target.value))}
            options={quarterOptions}
            className="w-40"
          />
        </div>
      </div>

      {/* Ranked Students List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {studentsWithRanking.map((student) => (
          <StudentCard key={student.id} student={student} />
        ))}
      </div>

      {/* Empty State */}
      {studentsWithRanking.length === 0 && (
        <div className="text-center py-12">
          <GraduationCap className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No students found</h3>
          <p className="text-gray-600">No students to display for {quarterOptions.find(q => q.value === selectedQuarter.toString())?.label}.</p>
        </div>
      )}
    </div>
  );
};

export default StudentRankingTab; 