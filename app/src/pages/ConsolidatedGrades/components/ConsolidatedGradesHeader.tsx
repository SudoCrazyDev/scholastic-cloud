import { Select } from '../../../components/select';

interface Quarter {
  value: string;
  label: string;
}

interface ConsolidatedGradesHeaderProps {
  selectedQuarter: string;
  selectedAcademicYear: string;
  quarters: Quarter[];
  academicYears: string[];
  onQuarterChange: (quarter: string) => void;
  onAcademicYearChange: (year: string) => void;
}

export function ConsolidatedGradesHeader({
  selectedQuarter,
  selectedAcademicYear,
  quarters,
  academicYears,
  onQuarterChange,
  onAcademicYearChange,
}: ConsolidatedGradesHeaderProps) {
  return (
    <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-6 mb-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex flex-col gap-2">
            <label htmlFor="quarter-select" className="text-sm font-medium text-gray-700">
              Quarter
            </label>
            <Select
              id="quarter-select"
              value={selectedQuarter}
              onChange={(e) => onQuarterChange(e.target.value)}
              className="w-48"
            >
              {quarters.map((quarter) => (
                <option key={quarter.value} value={quarter.value}>
                  {quarter.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="academic-year-select" className="text-sm font-medium text-gray-700">
              Academic Year
            </label>
            <Select
              id="academic-year-select"
              value={selectedAcademicYear}
              onChange={(e) => onAcademicYearChange(e.target.value)}
              className="w-48"
            >
              {academicYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="font-medium">Showing:</span>
          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md">
            {quarters.find(q => q.value === selectedQuarter)?.label} - {selectedAcademicYear}
          </span>
        </div>
      </div>
    </div>
  );
} 