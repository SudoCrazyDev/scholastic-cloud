import React from 'react';
import PrintReportCard from './studentReportCard';

interface StudentReportCardExampleProps {
  studentId: string;
  classSectionId: string;
  institutionId: string;
  academicYear?: string;
}

export default function StudentReportCardExample({
  studentId,
  classSectionId,
  institutionId,
  academicYear = '2024-2025'
}: StudentReportCardExampleProps) {
  return (
    <div className="w-full h-screen">
      <PrintReportCard
        studentId={studentId}
        classSectionId={classSectionId}
        institutionId={institutionId}
        academicYear={academicYear}
      />
    </div>
  );
} 