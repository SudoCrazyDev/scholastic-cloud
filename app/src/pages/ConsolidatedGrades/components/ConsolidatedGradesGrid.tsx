import { Button } from '../../../components/button';
import { Badge } from '../../../components/badge';
import { GraduationCap, Users, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ClassSection } from '../../../types';

interface ConsolidatedGradesGridProps {
  sections: ClassSection[];
  selectedQuarter: string;
  selectedAcademicYear: string;
}

export function ConsolidatedGradesGrid({
  sections,
  selectedQuarter,
  selectedAcademicYear,
}: ConsolidatedGradesGridProps) {
  const navigate = useNavigate();
  if (sections.length === 0) {
    return (
      <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-12 text-center">
        <GraduationCap className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No sections found</h3>
        <p className="mt-1 text-sm text-gray-500">
          No sections are available for the selected quarter and academic year.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {sections.map((section) => (
        <div
          key={section.id}
          className="bg-white shadow-sm border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow duration-200"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {section.title}
              </h3>
              <p className="text-sm text-gray-600">{section.grade_level}</p>
            </div>
            <Badge color="blue" className="ml-2">
              {section.academic_year}
            </Badge>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center text-sm text-gray-600">
              <User className="w-4 h-4 mr-2 text-gray-400" />
              <span className="font-medium">Adviser:</span>
              <span className="ml-1">
                {section.adviser ? 
                  `${section.adviser.first_name} ${section.adviser.last_name}` : 
                  'Not assigned'
                }
              </span>
            </div>
            
            <div className="flex items-center text-sm text-gray-600">
              <Users className="w-4 h-4 mr-2 text-gray-400" />
              <span className="font-medium">Grade Level:</span>
              <span className="ml-1">{section.grade_level}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              Quarter {selectedQuarter} • {selectedAcademicYear}
            </div>
            <Button
              onClick={() => navigate(`/consolidated-grades/${section.id}/${selectedQuarter}`)}
              variant="solid"
              color="primary"
              size="sm"
            >
              View Grades
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
} 