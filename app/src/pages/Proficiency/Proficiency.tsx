import { useState, useEffect } from 'react';
import { useRoleAccess } from '../../hooks/useRoleAccess';
import { useClassSections } from '../../hooks/useClassSections';
import { useQuery } from '@tanstack/react-query';
import {
  proficiencyService,
  type ProficiencyRow,
  type ProficiencyBySectionRow,
} from '../../services/proficiencyService';
import { Select } from '../../components/select';
import { Navigate } from 'react-router-dom';
import { TrendingUp, LayoutGrid, Layers } from 'lucide-react';

type ViewMode = 'by-grade' | 'by-section';

export default function Proficiency() {
  const { hasAccess } = useRoleAccess(['principal', 'curriculum-head', 'assistant-principal']);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('2025-2026');
  const [selectedGradeLevel, setSelectedGradeLevel] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('by-grade');
  const [selectedSectionId, setSelectedSectionId] = useState('');

  const { classSections } = useClassSections();

  const availableAcademicYears = [
    ...new Set(
      classSections
        .map((s) => s.academic_year)
        .filter((year): year is string => Boolean(year))
    ),
  ].sort().reverse();

  const availableGradeLevels = [
    ...new Set(
      classSections
        .map((s) => s.grade_level)
        .filter((gl): gl is string => Boolean(gl))
    ),
  ].sort((a, b) => String(a).localeCompare(String(b)));

  const sectionsForYear = classSections.filter(
    (s) => s.academic_year === selectedAcademicYear
  );
  const availableSections = selectedGradeLevel
    ? sectionsForYear.filter((s) => s.grade_level === selectedGradeLevel)
    : sectionsForYear;

  useEffect(() => {
    if (availableAcademicYears.length > 0 && !availableAcademicYears.includes(selectedAcademicYear)) {
      setSelectedAcademicYear(availableAcademicYears[0]);
    }
  }, [availableAcademicYears, selectedAcademicYear]);

  useEffect(() => {
    if (viewMode === 'by-section' && availableSections.length > 0) {
      const hasSelected = availableSections.some((s) => s.id === selectedSectionId);
      if (!selectedSectionId || !hasSelected) {
        setSelectedSectionId('');
      }
    }
  }, [viewMode, selectedSectionId, availableSections]);

  const {
    data: proficiencyResponse,
    isLoading: proficiencyLoading,
    error: proficiencyError,
  } = useQuery({
    queryKey: ['proficiency', selectedAcademicYear, selectedGradeLevel || null],
    queryFn: () =>
      proficiencyService.getProficiency({
        academic_year: selectedAcademicYear,
        grade_level: selectedGradeLevel || undefined,
      }),
    enabled: !!selectedAcademicYear && viewMode === 'by-grade',
    staleTime: 2 * 60 * 1000,
  });

  const {
    data: bySectionResponse,
    isLoading: bySectionLoading,
    error: bySectionError,
  } = useQuery({
    queryKey: [
      'proficiency-by-section',
      selectedAcademicYear,
      selectedGradeLevel || null,
      selectedSectionId || null,
    ],
    queryFn: () =>
      proficiencyService.getProficiencyBySection({
        academic_year: selectedAcademicYear,
        grade_level: selectedGradeLevel || undefined,
        section_id: selectedSectionId || undefined,
      }),
    enabled: !!selectedAcademicYear && viewMode === 'by-section',
    staleTime: 2 * 60 * 1000,
  });

  const rows: ProficiencyRow[] = proficiencyResponse?.data ?? [];
  const sectionRows: ProficiencyBySectionRow[] = bySectionResponse?.data ?? [];

  const isLoading = viewMode === 'by-grade' ? proficiencyLoading : bySectionLoading;
  const error = viewMode === 'by-grade' ? proficiencyError : bySectionError;
  const hasRows = viewMode === 'by-grade' ? rows.length > 0 : sectionRows.length > 0;

  const pctClass = (pct: number) =>
    pct >= 75 ? 'text-green-600 font-medium' : pct >= 50 ? 'text-amber-600' : 'text-red-600 font-medium';
  const PctCell = ({ pct }: { pct: number }) => (
    <span className={pctClass(pct)}>{pct}%</span>
  );

  if (!hasAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  const academicYears = availableAcademicYears.length > 0
    ? availableAcademicYears
    : ['2025-2026', '2024-2025', '2023-2024'];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-8 h-8 text-indigo-600" />
            Proficiency
          </h1>
          <p className="mt-2 text-gray-600">
            Average passing percentage per subject per grade level. Passing grade: 75. View by grade or per section with gender breakdown of those who passed.
          </p>
        </div>

        <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('by-grade')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'by-grade'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                By grade level
              </button>
              <button
                type="button"
                onClick={() => setViewMode('by-section')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'by-section'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Layers className="w-4 h-4" />
                Per section
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="academic-year-select" className="text-sm font-medium text-gray-700">
                Academic Year
              </label>
              <Select
                id="academic-year-select"
                value={selectedAcademicYear}
                onChange={(e) => setSelectedAcademicYear(e.target.value)}
                className="w-48"
                options={academicYears.map((year) => ({ value: year, label: year }))}
                placeholder="Select academic year"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="grade-level-select" className="text-sm font-medium text-gray-700">
                Grade Level (optional)
              </label>
              <Select
                id="grade-level-select"
                value={selectedGradeLevel}
                onChange={(e) => {
                  setSelectedGradeLevel(e.target.value);
                  setSelectedSectionId('');
                }}
                className="w-48"
                options={[
                  { value: '', label: 'All' },
                  ...availableGradeLevels.map((gl) => ({ value: gl, label: String(gl) })),
                ]}
                placeholder="All grade levels"
              />
            </div>
            {viewMode === 'by-section' && (
              <div className="flex flex-col gap-2">
                <label htmlFor="section-select" className="text-sm font-medium text-gray-700">
                  Section (optional)
                </label>
                <Select
                  id="section-select"
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                  className="w-56"
                  options={[
                    { value: '', label: 'All sections' },
                    ...availableSections.map((s) => ({
                      value: s.id,
                      label: `${s.grade_level} - ${s.title}`,
                    })),
                  ]}
                  placeholder="All sections"
                />
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-600 ml-2">
              <span className="font-medium">Showing:</span>
              <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded-md">
                {selectedAcademicYear}
                {selectedGradeLevel ? ` • Grade ${selectedGradeLevel}` : ''}
                {viewMode === 'by-section' && selectedSectionId
                  ? ` • ${availableSections.find((s) => s.id === selectedSectionId)?.title ?? 'Section'}`
                  : ''}
              </span>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto" />
            <p className="mt-2 text-sm text-gray-600">Loading proficiency data...</p>
          </div>
        ) : error ? (
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-red-600">
              Failed to load proficiency data. Please try again.
            </p>
          </div>
        ) : !hasRows ? (
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-12 text-center">
            <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No data</h3>
            <p className="mt-1 text-sm text-gray-500">
              {viewMode === 'by-grade'
                ? 'No proficiency data for the selected academic year and grade level.'
                : 'No proficiency data for the selected section(s).'}
            </p>
          </div>
        ) : viewMode === 'by-section' ? (
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Section
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Grade
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Subject
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Passed
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Final %
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Avg Grade
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Q1 %
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Q2 %
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Q3 %
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Q4 %
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Of passed: Girl %
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Boy %
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Other %
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sectionRows.map((row, index) => {
                    const passedTotal = row.passed_count;
                    const girlPct =
                      passedTotal > 0
                        ? Math.round((row.passed_female / passedTotal) * 100)
                        : 0;
                    const boyPct =
                      passedTotal > 0
                        ? Math.round((row.passed_male / passedTotal) * 100)
                        : 0;
                    const otherPct =
                      passedTotal > 0
                        ? Math.round((row.passed_other / passedTotal) * 100)
                        : 0;
                    return (
                      <tr
                        key={`${row.section_id}-${row.subject_title}-${index}`}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {row.section_title}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {row.grade_level}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {row.subject_title}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                          {row.total_students}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                          {row.passed_count}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                          <PctCell pct={row.passing_percentage} />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                          {row.average_grade != null ? row.average_grade.toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                          <PctCell pct={row.q1_passing_percentage ?? 0} />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                          <PctCell pct={row.q2_passing_percentage ?? 0} />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                          <PctCell pct={row.q3_passing_percentage ?? 0} />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                          <PctCell pct={row.q4_passing_percentage ?? 0} />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                          {girlPct}%
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                          {boyPct}%
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                          {otherPct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Grade Level
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Subject
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Passed
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Final %
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Avg Grade
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Q1 %
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Q2 %
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Q3 %
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Q4 %
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rows.map((row, index) => (
                    <tr
                      key={`${row.grade_level}-${row.subject_title}-${index}`}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {row.grade_level}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {row.subject_title}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                        {row.total_students}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                        {row.passed_count}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                        <PctCell pct={row.passing_percentage} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                        {row.average_grade != null ? row.average_grade.toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                        <PctCell pct={row.q1_passing_percentage ?? 0} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                        <PctCell pct={row.q2_passing_percentage ?? 0} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                        <PctCell pct={row.q3_passing_percentage ?? 0} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                        <PctCell pct={row.q4_passing_percentage ?? 0} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
