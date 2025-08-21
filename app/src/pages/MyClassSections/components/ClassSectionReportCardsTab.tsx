import React, { useMemo } from 'react';
import { Search } from 'lucide-react';
import { Button } from '../../../components/button';
import type { Student } from '../../../types';

interface ClassSectionReportCardsTabProps {
  filteredStudents: (Student & { assignmentId: string })[];
  getFullName: (student: any) => string;
  studentSearchTerm: string;
  setStudentSearchTerm: (term: string) => void;
  handleViewTempReportCard: (studentId: string) => void;
  handleViewReportCard: (studentId: string) => void;
}

const ClassSectionReportCardsTab: React.FC<ClassSectionReportCardsTabProps> = ({
  filteredStudents,
  getFullName,
  studentSearchTerm,
  setStudentSearchTerm,
  handleViewTempReportCard,
  handleViewReportCard,
}) => {
  // Group students by gender and sort alphabetically by last name
  const groupedStudents = useMemo(() => {
    const groups = {
      male: [] as (Student & { assignmentId: string })[],
      female: [] as (Student & { assignmentId: string })[],
      other: [] as (Student & { assignmentId: string })[]
    };
    
    filteredStudents.forEach(student => {
      const gender = student.gender as keyof typeof groups;
      if (gender && groups[gender]) {
        groups[gender].push(student);
      }
    });
    
    // Sort each group alphabetically by last name, then first name
    Object.keys(groups).forEach(gender => {
      groups[gender as keyof typeof groups].sort((a, b) => {
        const lastNameA = a.last_name.toLowerCase();
        const lastNameB = b.last_name.toLowerCase();
        const firstNameA = a.first_name.toLowerCase();
        const firstNameB = b.first_name.toLowerCase();
        
        // First compare by last name
        const lastNameComparison = lastNameA.localeCompare(lastNameB);
        if (lastNameComparison !== 0) {
          return lastNameComparison;
        }
        
        // If last names are the same, compare by first name
        return firstNameA.localeCompare(firstNameB);
      });
    });
    
    return groups;
  }, [filteredStudents]);

  const renderStudentGroup = (gender: 'male' | 'female' | 'other', students: (Student & { assignmentId: string })[]) => {
    if (students.length === 0) return null;
    
    const genderLabels = {
      male: 'Male Students',
      female: 'Female Students',
      other: 'Other Students'
    };

    return (
      <div key={gender} className="mb-8">
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <h4 className="text-md font-medium text-gray-700">{genderLabels[gender]} ({students.length})</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Student Name
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 uppercase">{getFullName(student)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <Button
                        onClick={() => handleViewTempReportCard(student.id)}
                        variant="outline"
                        size="sm"
                      >
                        Temp Report Card
                      </Button>
                      <Button
                        onClick={() => handleViewReportCard(student.id)}
                        variant="outline"
                        size="sm"
                      >
                        Report Card
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Search students..."
          value={studentSearchTerm}
          onChange={(e) => setStudentSearchTerm(e.target.value)}
          className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm w-full"
        />
      </div>
      {/* Students List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Student Report Cards</h3>
          <p className="text-sm text-gray-600 mt-1">View individual student report cards</p>
        </div>
        <div>
          {renderStudentGroup('male', groupedStudents.male)}
          {renderStudentGroup('female', groupedStudents.female)}
          {renderStudentGroup('other', groupedStudents.other)}
        </div>
      </div>
    </div>
  );
};

export default ClassSectionReportCardsTab; 