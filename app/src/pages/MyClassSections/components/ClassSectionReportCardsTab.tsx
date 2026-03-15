import React, { useMemo, useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Search, Bug, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/button';
import { ConfirmationModal } from '../../../components/ConfirmationModal';
import { studentRunningGradeService } from '../../../services/studentRunningGradeService';
import type { StudentRunningGrade } from '../../../services/studentRunningGradeService';
import type { Student, Subject } from '../../../types';

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(value), delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [value, delay]);
  return debounced;
}

// ─── Debug Grades Modal ───────────────────────────────────────────────────────

interface DebugGradesModalProps {
  isOpen: boolean;
  studentId: string;
  studentName: string;
  subjects: Subject[];
  academicYear: string;
  onClose: () => void;
}

const QUARTER_FILTERS = [
  { value: 'all', label: 'All' },
  { value: '1',   label: 'Q1' },
  { value: '2',   label: 'Q2' },
  { value: '3',   label: 'Q3' },
  { value: '4',   label: 'Q4' },
] as const;

type QuarterFilter = typeof QUARTER_FILTERS[number]['value'];

function DebugGradesModal({ isOpen, studentId, studentName, subjects, academicYear, onClose }: DebugGradesModalProps) {
  const queryClient = useQueryClient();
  const [quarterFilter, setQuarterFilter] = useState<QuarterFilter>('all');
  const [subjectSearch, setSubjectSearch] = useState('');
  const debouncedSearch = useDebounce(subjectSearch, 300);
  const [gradeToDelete, setGradeToDelete] = useState<{ id: string; label: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcResult, setRecalcResult] = useState<'success' | 'error' | null>(null);

  // Reset filters whenever the modal opens for a different student
  useEffect(() => {
    if (isOpen) {
      setQuarterFilter('all');
      setSubjectSearch('');
    }
  }, [isOpen, studentId]);

  const { data: gradesData, isLoading, refetch } = useQuery({
    queryKey: ['debug-student-grades', studentId],
    queryFn: () => studentRunningGradeService.list({ student_id: studentId }),
    enabled: isOpen && !!studentId,
    staleTime: 0,
  });

  const allGrades: StudentRunningGrade[] = gradesData?.data || [];

  const getSubjectTitle = (subjectId: string) => {
    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject) return subjectId;
    return subject.variant ? `${subject.title} – ${subject.variant}` : subject.title;
  };

  const grades = useMemo(() => {
    let filtered = allGrades;
    if (quarterFilter !== 'all') {
      filtered = filtered.filter((g) => String(g.quarter) === quarterFilter);
    }
    if (debouncedSearch.trim()) {
      const needle = debouncedSearch.trim().toLowerCase();
      filtered = filtered.filter((g) =>
        getSubjectTitle(g.subject_id).toLowerCase().includes(needle)
      );
    }
    return filtered;
  }, [allGrades, quarterFilter, debouncedSearch]);

  const handleDelete = async () => {
    if (!gradeToDelete) return;
    setDeleteLoading(true);
    try {
      await studentRunningGradeService.delete(gradeToDelete.id);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['student-running-grades', { student_id: studentId }] });
      setGradeToDelete(null);
    } catch {
      // silently swallow; a toast system could surface this
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleRecalculate = async () => {
    if (!academicYear) return;
    setRecalcLoading(true);
    setRecalcResult(null);
    try {
      // Run all 4 quarters in parallel
      await Promise.all(
        (['1', '2', '3', '4'] as const).map((q) =>
          studentRunningGradeService.recalculateParentGrades(studentId, q, academicYear)
        )
      );
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['student-running-grades', { student_id: studentId }] });
      setRecalcResult('success');
    } catch {
      setRecalcResult('error');
    } finally {
      setRecalcLoading(false);
      setTimeout(() => setRecalcResult(null), 4000);
    }
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={onClose}
          />

          {/* Panel */}
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto w-full max-w-4xl bg-white rounded-xl shadow-2xl flex flex-col"
              style={{ maxHeight: 'calc(100vh - 2rem)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-orange-50">
                    <Bug className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 leading-tight">Debug Grades</h3>
                    <p className="text-sm text-gray-500 leading-tight mt-0.5">{studentName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Recalculate parent grades button */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRecalculate}
                      disabled={recalcLoading || !academicYear}
                      title="Re-run ParentSubjectGradeService for all 4 quarters. Fixes decimal/stale parent grades."
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        recalcResult === 'success'
                          ? 'bg-green-50 border-green-300 text-green-700'
                          : recalcResult === 'error'
                          ? 'bg-red-50 border-red-300 text-red-700'
                          : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                      }`}
                    >
                      {recalcLoading ? (
                        <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                      {recalcResult === 'success'
                        ? 'Recalculated!'
                        : recalcResult === 'error'
                        ? 'Failed'
                        : recalcLoading
                        ? 'Recalculating…'
                        : 'Recalculate Parent Grades'}
                    </button>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors rounded-md p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Filter bar — search + quarter pills */}
              <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
                {/* Subject search */}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={subjectSearch}
                    onChange={(e) => setSubjectSearch(e.target.value)}
                    placeholder="Search subject…"
                    className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 placeholder-gray-400"
                  />
                  {subjectSearch && (
                    <button
                      onClick={() => setSubjectSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Divider */}
                <div className="h-5 w-px bg-gray-200 shrink-0" />

                {/* Quarter pills */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-gray-400 mr-0.5">Quarter:</span>
                  {QUARTER_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setQuarterFilter(f.value)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        quarterFilter === f.value
                          ? 'bg-orange-500 text-white shadow-sm'
                          : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-600'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable table body */}
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                    Loading grades…
                  </div>
                ) : grades.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                    {allGrades.length === 0
                      ? 'No grade records found for this student.'
                      : 'No records match the current filters.'}
                  </div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quarter</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" title="Raw stored grade (before encoding)">grade</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" title="Encoded/transmitted grade stored in DB">final_grade</th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <span title="Math.round(final_grade ?? grade) — what the Report Card displays">
                            Displayed ↗
                          </span>
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acad. Year</th>
                        <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {grades.map((grade) => {
                        const rawValue = grade.final_grade != null ? grade.final_grade : grade.grade;
                        const displayed = rawValue != null && !Number.isNaN(Number(rawValue))
                          ? Math.round(Number(rawValue))
                          : null;
                        const hasMismatch = grade.grade != null
                          && grade.final_grade != null
                          && Number(grade.grade) !== Number(grade.final_grade);
                        return (
                          <tr key={grade.id} className="hover:bg-orange-50/40 transition-colors">
                            <td className="px-5 py-3 font-mono text-xs text-gray-400" title={grade.id}>
                              {grade.id ? grade.id.slice(0, 8) + '…' : '—'}
                            </td>
                            <td className="px-5 py-3 text-gray-900 max-w-[220px] truncate" title={getSubjectTitle(grade.subject_id)}>
                              {getSubjectTitle(grade.subject_id)}
                            </td>
                            <td className="px-5 py-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                                Q{grade.quarter}
                              </span>
                            </td>
                            <td className={`px-5 py-3 font-mono text-xs ${hasMismatch ? 'text-amber-600' : 'text-gray-500'}`}>
                              {grade.grade != null ? grade.grade : '—'}
                            </td>
                            <td className={`px-5 py-3 font-mono text-xs ${hasMismatch ? 'text-amber-600' : 'text-gray-500'}`}>
                              {grade.final_grade != null ? grade.final_grade : '—'}
                            </td>
                            <td className="px-5 py-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-green-50 text-green-700">
                                {displayed ?? '—'}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-gray-500 text-xs">{grade.academic_year ?? '—'}</td>
                            <td className="px-5 py-3 text-right">
                              <button
                                onClick={() =>
                                  setGradeToDelete({
                                    id: grade.id!,
                                    label: `Q${grade.quarter} grade for "${getSubjectTitle(grade.subject_id)}" (displayed: ${displayed ?? '—'})`,
                                  })
                                }
                                className="text-red-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                                title="Delete this grade record"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl shrink-0">
                <span className="text-xs text-gray-400">
                  Showing {grades.length} of {allGrades.length} record{allGrades.length !== 1 ? 's' : ''}
                </span>
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
              </div>
            </motion.div>
          </div>

          {/* Delete confirmation — also portaled so it sits above the debug modal */}
          <ConfirmationModal
            isOpen={!!gradeToDelete}
            onClose={() => !deleteLoading && setGradeToDelete(null)}
            onConfirm={handleDelete}
            title="Delete Grade Record"
            message={`Are you sure you want to delete this grade record?\n\n${gradeToDelete?.label ?? ''}\n\nThis action cannot be undone.`}
            confirmText="Delete"
            variant="danger"
            loading={deleteLoading}
          />
        </>
      )}
    </AnimatePresence>
  );

  return ReactDOM.createPortal(modalContent, document.body);
}

// ─── Main Tab Component ───────────────────────────────────────────────────────

interface ClassSectionReportCardsTabProps {
  filteredStudents: (Student & { assignmentId: string })[];
  getFullName: (student: any) => string;
  studentSearchTerm: string;
  setStudentSearchTerm: (term: string) => void;
  handleViewTempReportCard: (studentId: string) => void;
  handleViewReportCard: (studentId: string) => void;
  isImpersonating?: boolean;
  subjects?: Subject[];
  academicYear?: string;
}

const ClassSectionReportCardsTab: React.FC<ClassSectionReportCardsTabProps> = ({
  filteredStudents,
  getFullName,
  studentSearchTerm,
  setStudentSearchTerm,
  handleViewTempReportCard,
  handleViewReportCard,
  isImpersonating = false,
  subjects = [],
  academicYear = '',
}) => {
  const [debugStudent, setDebugStudent] = useState<{ id: string; name: string } | null>(null);
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
                      {isImpersonating && (
                        <Button
                          onClick={() => setDebugStudent({ id: student.id, name: getFullName(student) })}
                          variant="outline"
                          size="sm"
                          className="text-orange-600 border-orange-300 hover:bg-orange-50"
                        >
                          <Bug className="w-3.5 h-3.5 mr-1" />
                          Debug Grades
                        </Button>
                      )}
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

      {/* Debug Grades Modal — only mounted when impersonating */}
      {isImpersonating && (
        <DebugGradesModal
          isOpen={!!debugStudent}
          studentId={debugStudent?.id ?? ''}
          studentName={debugStudent?.name ?? ''}
          subjects={subjects}
          academicYear={academicYear}
          onClose={() => setDebugStudent(null)}
        />
      )}
    </div>
  );
};

export default ClassSectionReportCardsTab; 