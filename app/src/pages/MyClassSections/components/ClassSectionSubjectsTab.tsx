import React from 'react';
import { SubjectList } from './SubjectList';
import type { Subject } from '../../../types';

interface ClassSectionSubjectsTabProps {
  subjects: Subject[];
  loading: boolean;
  error: any;
  onCreateSubject: () => void;
  onEditSubject: (subject: Subject) => void;
  onDeleteSubject: (subject: Subject) => void;
  onReorderSubjects: (subjectOrders: Array<{ id: string; order: number }>) => void;
  reordering: boolean;
  onRefetch: () => void;
}

const ClassSectionSubjectsTab: React.FC<ClassSectionSubjectsTabProps> = ({
  subjects,
  loading,
  error,
  onCreateSubject,
  onEditSubject,
  onDeleteSubject,
  onReorderSubjects,
  reordering,
  onRefetch,
}) => {
  return (
    <SubjectList
      subjects={subjects}
      loading={loading}
      error={error}
      onCreateSubject={onCreateSubject}
      onEditSubject={onEditSubject}
      onDeleteSubject={onDeleteSubject}
      onReorderSubjects={onReorderSubjects}
      reordering={reordering}
      onRefetch={onRefetch}
    />
  );
};

export default ClassSectionSubjectsTab; 