import React from 'react';
import StudentRankingTab from './StudentRankingTab';
import type { Student } from '../../../types';

interface ClassSectionRankingTabProps {
  students: (Student & { assignmentId: string })[];
  classSectionTitle: string;
  sectionId: string;
  quarter: number;
}

const ClassSectionRankingTab: React.FC<ClassSectionRankingTabProps> = ({ students, classSectionTitle, sectionId, quarter }) => {
  return (
    <StudentRankingTab
      students={students}
      classSectionTitle={classSectionTitle}
      sectionId={sectionId}
      quarter={quarter}
    />
  );
};

export default ClassSectionRankingTab; 