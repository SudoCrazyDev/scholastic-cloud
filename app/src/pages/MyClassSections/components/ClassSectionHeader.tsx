import React from 'react';
import { Badge } from '../../../components/badge';
import { Building2, UserCheck, Calendar } from 'lucide-react';

interface ClassSectionHeaderProps {
  classSectionData: any;
  getFullName: (user: any) => string;
  user: any;
}

const ClassSectionHeader: React.FC<ClassSectionHeaderProps> = ({ classSectionData, getFullName, user }) => {
  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="bg-gradient-to-br from-indigo-100 via-white to-purple-100 rounded-2xl shadow-xl border border-gray-200 p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 transition-all duration-300">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2 tracking-tight">
            {classSectionData.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 mb-2">
            <span className="inline-flex items-center text-sm text-gray-700 font-medium">
              <Calendar className="w-4 h-4 mr-1 text-indigo-500" />
              SY {classSectionData.academic_year}
            </span>
            <span className="inline-flex items-center text-sm text-gray-700 font-medium">
              <UserCheck className="w-4 h-4 mr-1 text-green-500" />
              Adviser: {getFullName(classSectionData.adviser) || 'N/A'}
            </span>
            <span className="inline-flex items-center text-sm text-gray-700 font-medium">
              <Building2 className="w-4 h-4 mr-1 text-blue-500" />
              {classSectionData.institution?.name || 'Institution'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge color="indigo" className="text-xs font-semibold px-3 py-1 rounded-full">
              Grade {classSectionData.grade_level}
            </Badge>
            <Badge color="purple" className="text-xs font-semibold px-3 py-1 rounded-full">
              {classSectionData.section_type || 'Section'}
            </Badge>
            {classSectionData.is_active && (
              <Badge color="green" className="text-xs font-semibold px-3 py-1 rounded-full">
                Active
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 min-w-[120px]">
          <span className="text-xs text-gray-500">Class Section ID</span>
          <span className="font-mono text-sm text-gray-700 bg-gray-100 rounded px-2 py-1 select-all">
            {classSectionData.id}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ClassSectionHeader; 