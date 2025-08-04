import React, { useState } from 'react';
import { useRoleAccess } from '../../hooks/useRoleAccess';
import { useClassSections } from '../../hooks/useClassSections';
import { ConsolidatedGradesHeader, ConsolidatedGradesGrid } from './components';
import { Navigate } from 'react-router-dom';

export default function ConsolidatedGrades() {
  const { hasAccess } = useRoleAccess(['principal', 'curriculum-head', 'assistant-principal']);
  const [selectedQuarter, setSelectedQuarter] = useState('1');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('2025-2026');


  // Fetch class sections
  const { classSections, loading: sectionsLoading } = useClassSections();

  // Get unique academic years from the data
  const availableAcademicYears = [...new Set(classSections.map(section => section.academic_year).filter((year): year is string => Boolean(year)))].sort().reverse();

  // Filter sections by academic year on the client side
  const filteredSections = classSections.filter(section => 
    section.academic_year === selectedAcademicYear
  );

  if (!hasAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  const quarters = [
    { value: '1', label: 'First Quarter' },
    { value: '2', label: 'Second Quarter' },
    { value: '3', label: 'Third Quarter' },
    { value: '4', label: 'Fourth Quarter' },
  ];

  // Use available academic years from data, with fallback to default years
  const academicYears = availableAcademicYears.length > 0 ? availableAcademicYears : [
    '2025-2026',
    '2024-2025',
    '2023-2024',
    '2022-2023',
  ];

  // Auto-select first available academic year if current selection doesn't exist
  React.useEffect(() => {
    if (availableAcademicYears.length > 0 && !availableAcademicYears.includes(selectedAcademicYear)) {
      setSelectedAcademicYear(availableAcademicYears[0]);
    }
  }, [availableAcademicYears, selectedAcademicYear]);

  const handleQuarterChange = (quarter: string) => {
    setSelectedQuarter(quarter);
  };

  const handleAcademicYearChange = (year: string) => {
    setSelectedAcademicYear(year);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Consolidated Grades</h1>
          <p className="mt-2 text-gray-600">
            View and manage consolidated grades for all sections by quarter and academic year.
          </p>
        </div>

        {/* Header with filters */}
        <ConsolidatedGradesHeader
          selectedQuarter={selectedQuarter}
          selectedAcademicYear={selectedAcademicYear}
          quarters={quarters}
          academicYears={academicYears}
          onQuarterChange={handleQuarterChange}
          onAcademicYearChange={handleAcademicYearChange}
        />

        {/* Sections Grid */}
        {sectionsLoading ? (
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-600">Loading sections...</p>
          </div>
        ) : (
          <ConsolidatedGradesGrid
            sections={filteredSections}
            selectedQuarter={selectedQuarter}
            selectedAcademicYear={selectedAcademicYear}
          />
        )}


      </div>
    </div>
  );
} 