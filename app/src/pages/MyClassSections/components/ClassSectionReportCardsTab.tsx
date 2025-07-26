import React from 'react';
import { Search, Eye, Download } from 'lucide-react';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import type { Student } from '../../../types';

interface ClassSectionReportCardsTabProps {
  filteredStudents: (Student & { assignmentId: string })[];
  classSectionData: any;
  getFullName: (student: any) => string;
  studentSearchTerm: string;
  setStudentSearchTerm: (term: string) => void;
  handleViewReportCard: (studentId: string) => void;
  handleDownloadReportCard: (studentId: string) => void;
}

const ClassSectionReportCardsTab: React.FC<ClassSectionReportCardsTabProps> = ({
  filteredStudents,
  classSectionData,
  getFullName,
  studentSearchTerm,
  setStudentSearchTerm,
  handleViewReportCard,
  handleDownloadReportCard,
}) => {
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
          <p className="text-sm text-gray-600 mt-1">View and download individual student report cards</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Student Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Grade Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Section
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{getFullName(student)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{classSectionData.grade_level}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{classSectionData.title}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge color="green" className="text-xs">
                      Active
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <Button
                        onClick={() => handleViewReportCard(student.id)}
                        variant="outline"
                        size="sm"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                      <Button
                        onClick={() => handleDownloadReportCard(student.id)}
                        variant="solid"
                        color="primary"
                        size="sm"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ClassSectionReportCardsTab; 