import React, { useState, useEffect } from 'react'
import { 
  UserIcon,
  UsersIcon,
  UserGroupIcon,
  AcademicCapIcon,
  CalculatorIcon,
  ChartBarIcon,
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { Select } from '../../../components/select'
import { Button } from '../../../components/button'
import { useStudents } from '../../../hooks/useStudents'
import { useStudentRunningGrades } from '../../../hooks/useStudentRunningGrades'
import { useUpdateFinalGrade, useUpsertFinalGrade, useBulkUpsertFinalGrades } from '../../../hooks/useStudentRunningGrades'
import { StudentGradesByQuarter } from './StudentGradesByQuarter'
import { Alert } from '../../../components/alert'
import { ErrorHandler } from '../../../utils/errorHandler'
import { toast } from 'react-hot-toast'

interface ClassRecordTabProps {
  subjectId: string
  classSectionId?: string
  isLimited?: boolean
  assignedStudentIds?: string[]
}

// Type for batch grade changes
interface BatchGradeChange {
  studentId: string;
  subjectId: string;
  quarter: '1' | '2' | '3' | '4';
  finalGrade: number;
  gradeId?: string;
  academicYear: string;
  hasChanged: boolean;
}

// Type for submission strategy
type SubmissionStrategy = 'bulk' | 'individual' | 'hybrid';

export const ClassRecordTab: React.FC<ClassRecordTabProps> = ({ subjectId, classSectionId, isLimited = false, assignedStudentIds = [] }) => {
  // Fetch students
  const { students, loading: studentsLoading, error: studentsError } = useStudents({ class_section_id: classSectionId });

  const filteredStudents = isLimited && assignedStudentIds.length > 0
    ? students.filter(s => assignedStudentIds.includes(s.id))
    : (isLimited ? [] : students)
  
  // Fetch running grades for all students
  const { data: runningGradesData, isLoading: gradesLoading, error: gradesError } = useStudentRunningGrades({
    subjectId,
    classSectionId,
  });
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  console.log("RUNNING GRADES DATA: ", runningGradesData);
  // Quarter filter state for mobile/tablet
  const [selectedQuarter, setSelectedQuarter] = useState<string>('1');
  
  // Batch submission state
  const [isBatchMode, setIsBatchMode] = useState(true); // Default to batch mode
  const [batchChanges, setBatchChanges] = useState<BatchGradeChange[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStrategy, setSubmissionStrategy] = useState<SubmissionStrategy>('hybrid');
  const [submissionProgress, setSubmissionProgress] = useState<{
    total: number;
    completed: number;
    failed: number;
    current: number;
  }>({ total: 0, completed: 0, failed: 0, current: 0 });
  
  // Mutations for different submission strategies
  const updateFinalGradeMutation = useUpdateFinalGrade();
  const upsertFinalGradeMutation = useUpsertFinalGrade();
  const bulkUpsertFinalGradesMutation = useBulkUpsertFinalGrades();
  
  // Quarter options for the filter
  const quarterOptions = [
    { value: '1', label: 'Quarter 1' },
    { value: '2', label: 'Quarter 2' },
    { value: '3', label: 'Quarter 3' },
    { value: '4', label: 'Quarter 4' },
  ];

  // Handle errors
  useEffect(() => {
    if (studentsError) {
      setAlert({ type: 'error', message: ErrorHandler.handle(studentsError).message });
    } else if (gradesError) {
      setAlert({ type: 'error', message: ErrorHandler.handle(gradesError).message });
    } else {
      setAlert(null);
    }
  }, [studentsError, gradesError]);

  // Group running grades by student
  const gradesByStudent = runningGradesData?.data?.reduce((acc: any, grade: any) => {
    if (!acc[grade.student_id]) {
      acc[grade.student_id] = [];
    }
    acc[grade.student_id].push(grade);
    return acc;
  }, {}) || {};

  // Calculate statistics
  const totalStudents = filteredStudents.length;
  const totalGrades = runningGradesData?.data?.length || 0;
  const gradesWithFinalGrade = runningGradesData?.data?.filter((grade: any) => grade.final_grade !== null).length || 0;
  const completionRate = totalGrades > 0 ? Math.round((gradesWithFinalGrade / totalGrades) * 100) : 0;

  // Gender distribution
  const genderDistribution = filteredStudents.reduce((acc: any, student: any) => {
    const gender = student.gender || 'other';
    acc[gender] = (acc[gender] || 0) + 1;
    return acc;
  }, {});

  // Handle grade changes in batch mode
  const handleGradeChange = (change: BatchGradeChange) => {
    setBatchChanges(prev => {
      // Remove existing change for this student/quarter combination
      const filtered = prev.filter(c => 
        !(c.studentId === change.studentId && c.quarter === change.quarter)
      );
      
      // Add new change if it has actually changed
      if (change.hasChanged) {
        return [...filtered, change];
      }
      
      return filtered;
    });
  };

  // Smart submission strategy selection
  const selectSubmissionStrategy = (changes: BatchGradeChange[]): SubmissionStrategy => {
    if (changes.length === 0) return 'hybrid';
    
    // Always prefer bulk for batch mode - it's more efficient for slow connections
    if (changes.length >= 1) return 'bulk';
    
    return 'hybrid';
  };

  // Individual submission with retry logic (only used as fallback)
  const submitIndividualWithRetry = async (changes: BatchGradeChange[], maxRetries = 2) => {
    const results = { success: 0, failed: 0, errors: [] as any[] };
    
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      setSubmissionProgress(prev => ({ ...prev, current: i + 1 }));
      
      let retries = 0;
      let success = false;
      
      while (retries <= maxRetries && !success) {
        try {
          if (change.gradeId) {
            // Update existing grade
            await updateFinalGradeMutation.mutateAsync({
              id: change.gradeId,
              finalGrade: change.finalGrade,
            });
          } else {
            // Create new grade
            await upsertFinalGradeMutation.mutateAsync({
              studentId: change.studentId,
              subjectId: change.subjectId,
              quarter: change.quarter,
              finalGrade: change.finalGrade,
              academicYear: change.academicYear,
            });
          }
          
          results.success++;
          success = true;
          
        } catch (error) {
          retries++;
          if (retries > maxRetries) {
            results.failed++;
            results.errors.push({
              change,
              error: error,
              retries
            });
          } else {
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          }
        }
      }
      
      // Small delay between requests to avoid overwhelming the server
      if (i < changes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  };

  // Hybrid submission - try bulk first, fallback to individual only if bulk completely fails
  const submitHybrid = async (changes: BatchGradeChange[]) => {
    try {
      // Always try bulk first - it's the most efficient for batch mode
      setSubmissionStrategy('bulk');
      await bulkUpsertFinalGradesMutation.mutateAsync(changes);
      return { success: changes.length, failed: 0, errors: [] };
    } catch (error) {
      // Only fallback to individual if bulk completely fails
      console.warn('Bulk operation failed, falling back to individual updates:', error);
      
      setSubmissionStrategy('individual');
      toast.success('Bulk operation failed, falling back to individual updates...', {
        duration: 3000,
        icon: '🔄',
        style: {
          background: '#f59e0b',
          color: 'white',
          fontWeight: '600',
        },
      });
      
      return await submitIndividualWithRetry(changes);
    }
  };

  // Submit all batch changes using smart strategy
  const handleBatchSubmit = async () => {
    if (batchChanges.length === 0) {
      toast.success('No changes to submit', {
        duration: 2000,
        icon: 'ℹ️',
        style: {
          background: '#6b7280',
          color: 'white',
          fontWeight: '600',
        },
      });
      return;
    }

    setIsSubmitting(true);
    setSubmissionProgress({
      total: batchChanges.length,
      completed: 0,
      failed: 0,
      current: 0
    });
    
    // Show loading toast
    const loadingToast = toast.loading(`Preparing to submit ${batchChanges.length} grade changes...`, {
      icon: '⏳',
      style: {
        background: '#3b82f6',
        color: 'white',
        fontWeight: '600',
      },
    });

    try {
      let results;
      const strategy = selectSubmissionStrategy(batchChanges);
      
      switch (strategy) {
        case 'bulk':
          setSubmissionStrategy('bulk');
          // Always use bulk for batch mode - it's more efficient
          results = await bulkUpsertFinalGradesMutation.mutateAsync(batchChanges);
          results = { success: batchChanges.length, failed: 0, errors: [] };
          break;
          
        case 'individual':
          // This should rarely happen in batch mode, but handle it gracefully
          setSubmissionStrategy('individual');
          results = await submitIndividualWithRetry(batchChanges);
          break;
          
        case 'hybrid':
        default:
          // Hybrid always tries bulk first
          results = await submitHybrid(batchChanges);
          break;
      }
      
      // Clear batch changes
      setBatchChanges([]);
      
      // Dismiss loading toast
      toast.dismiss(loadingToast);
      
      // Show success/partial success message
      if (results.failed === 0) {
        toast.success(`✅ Successfully submitted all ${results.success} grade changes!`, {
          duration: 4000,
          icon: '✅',
          style: {
            background: '#10b981',
            color: 'white',
            fontWeight: '600',
          },
        });
      } else {
        toast.success(`⚠️ Partially successful: ${results.success} succeeded, ${results.failed} failed`, {
          duration: 5000,
          icon: '⚠️',
          style: {
            background: '#f59e0b',
            color: 'white',
            fontWeight: '600',
          },
        });
        
        // Log errors for debugging
        console.error('Failed grade submissions:', results.errors);
      }
      
    } catch (error) {
      // Dismiss loading toast
      toast.dismiss(loadingToast);
      
      // Show error toast
      toast.error('Failed to submit grade changes. Please try again.', {
        duration: 5000,
        icon: '❌',
        style: {
          background: '#ef4444',
          color: 'white',
          fontWeight: '600',
        },
      });
      
      console.error('Batch submission error:', error);
    } finally {
      setIsSubmitting(false);
      setSubmissionProgress({ total: 0, completed: 0, failed: 0, current: 0 });
    }
  };

  // Clear all batch changes
  const handleClearChanges = () => {
    setBatchChanges([]);
    toast.success('All pending changes cleared', {
      duration: 2000,
      icon: '🗑️',
      style: {
        background: '#6b7280',
        color: 'white',
        fontWeight: '600',
      },
    });
  };

  // Toggle between batch and immediate mode
  const toggleBatchMode = () => {
    if (isBatchMode && batchChanges.length > 0) {
      // Warn user about unsaved changes
      if (window.confirm('You have unsaved changes. Are you sure you want to switch to immediate mode? All pending changes will be lost.')) {
        setBatchChanges([]);
        setIsBatchMode(false);
      }
    } else {
      setIsBatchMode(!isBatchMode);
    }
  };

  if (studentsLoading || gradesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {alert && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
          show={true}
        />
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Class Records</h3>
          <p className="text-sm text-gray-500">Manage final grades for {students.length} students</p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <CalculatorIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Click calculator icon to use calculated grade</span>
          <span className="sm:hidden">Use calculator for auto-grade</span>
        </div>
      </div>

      {/* Batch Mode Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="batchMode"
                checked={isBatchMode}
                onChange={toggleBatchMode}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              />
              <label htmlFor="batchMode" className="text-sm font-medium text-gray-900">
                Batch Submission Mode
              </label>
            </div>
            <span className="text-xs text-gray-500">
              {isBatchMode ? 'Make multiple changes and submit all at once' : 'Save changes immediately'}
            </span>
          </div>
          
          {isBatchMode && (
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>Pending changes:</span>
                <span className="font-semibold text-blue-600">{batchChanges.length}</span>
              </div>
              
              {batchChanges.length > 0 && (
                <>
                  <Button
                    onClick={handleClearChanges}
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    <XMarkIcon className="w-4 h-4 mr-1" />
                    Clear All
                  </Button>
                  
                  <Button
                    onClick={handleBatchSubmit}
                    disabled={isSubmitting}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        {submissionStrategy === 'bulk' ? 'Submitting Bulk...' : 
                         submissionStrategy === 'individual' ? 'Submitting Individual...' : 
                         'Submitting...'}
                      </>
                    ) : (
                      <>
                        <CheckIcon className="w-4 h-4 mr-1" />
                        Submit All Changes ({batchChanges.length})
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        
        {isBatchMode && (
          <div className="mt-3 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              💡 <strong>Smart Batch Mode:</strong> The system always uses bulk operations for maximum efficiency with slow internet connections. 
              All your grade changes are sent in a single request, with automatic fallback to individual updates only if the bulk operation fails.
            </p>
          </div>
        )}

        {/* Submission Progress */}
        {isSubmitting && submissionProgress.total > 0 && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-yellow-800">
                {submissionStrategy === 'bulk' ? 'Bulk Processing...' : 
                 submissionStrategy === 'individual' ? 'Individual Processing...' : 
                 'Processing...'}
              </span>
              <span className="text-xs text-yellow-600">
                {submissionProgress.current}/{submissionProgress.total}
              </span>
            </div>
            
            <div className="w-full bg-yellow-200 rounded-full h-2">
              <div 
                className="bg-yellow-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(submissionProgress.current / submissionProgress.total) * 100}%` }}
              />
            </div>
            
            <div className="flex items-center space-x-4 mt-2 text-xs text-yellow-700">
              <span>Strategy: {submissionStrategy}</span>
              {submissionStrategy === 'individual' && (
                <span>Progress: {submissionProgress.current}/{submissionProgress.total}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Summary - Only visible on mobile and tablet */}
      <div className="lg:hidden bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <UserGroupIcon className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-900">{totalStudents} Students</span>
            </div>
            <div className="flex items-center space-x-2">
              <AcademicCapIcon className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-900">{totalGrades} Grades</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <CalculatorIcon className="w-5 h-5 text-yellow-600" />
            <span className="text-sm font-medium text-gray-900">{completionRate}% Complete</span>
          </div>
        </div>
      </div>

      {/* Quarter Filter - Only visible on mobile and tablet */}
      <div className="lg:hidden bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-900">Filter by Quarter</h4>
          <span className="text-xs text-gray-500">Select to focus on specific quarter</span>
        </div>
        <Select
          value={selectedQuarter}
          onChange={(e) => setSelectedQuarter(e.target.value)}
          options={quarterOptions}
          placeholder="Select quarter"
          className="w-full"
        />
        <div className="mt-3 p-2 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-700">
            Showing Quarter {selectedQuarter} grades for {totalStudents} students
          </p>
        </div>
      </div>

      {/* Statistics - Hidden on mobile and tablet */}
      <div className="hidden lg:grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <UserGroupIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Students</p>
              <p className="text-lg font-semibold text-gray-900">{totalStudents}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <AcademicCapIcon className="w-4 h-4 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Grades</p>
              <p className="text-lg font-semibold text-gray-900">{totalGrades}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
              <CalculatorIcon className="w-4 h-4 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Final Grades Set</p>
              <p className="text-lg font-semibold text-gray-900">{gradesWithFinalGrade}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
              <ChartBarIcon className="w-4 h-4 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Completion</p>
              <p className="text-lg font-semibold text-gray-900">{completionRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gender Distribution - Hidden on mobile and tablet */}
      <div className="hidden lg:block bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Student Distribution</h4>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
            <UserIcon className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-900">Male Students</p>
              <p className="text-lg font-semibold text-blue-700">{genderDistribution.male || 0}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-pink-50 rounded-lg">
            <UsersIcon className="w-5 h-5 text-pink-600" />
            <div>
              <p className="text-sm font-medium text-pink-900">Female Students</p>
              <p className="text-lg font-semibold text-pink-700">{genderDistribution.female || 0}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <UserGroupIcon className="w-5 h-5 text-gray-600" />
            <div>
              <p className="text-sm font-medium text-gray-900">Other Students</p>
              <p className="text-lg font-semibold text-gray-700">{genderDistribution.other || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">How to Use Final Grades</h4>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm text-blue-800">
          <div>
            <span className="font-medium">Manual Input:</span> Type the final grade directly in the input field
          </div>
          <div>
            <span className="font-medium">Calculated Grade:</span> Click the calculator icon to use the system-calculated grade
          </div>
        </div>
        {isBatchMode && (
          <div className="mt-3 p-2 bg-blue-100 rounded border border-blue-300">
            <p className="text-xs text-blue-800">
              <strong>Batch Mode:</strong> Make all your changes first, then click "Submit All Changes" to save everything at once. 
              Changed grades will show a blue indicator.
            </p>
          </div>
        )}
      </div>

      {/* Student Grades List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h4 className="text-sm font-medium text-gray-900">Student Final Grades by Quarter</h4>
        </div>
        
        <div className="divide-y divide-gray-200">
          {totalStudents === 0 ? (
            <div className="text-center py-12">
              <UserGroupIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Students Found</h3>
              <p className="text-gray-500">{isLimited ? 'No students are assigned to this subject.' : 'No students are assigned to this class section.'}</p>
            </div>
          ) : (
            // Group students by gender and sort by last name
            (() => {
              // Sort students by last name first
              const sortedStudents = [...filteredStudents].sort((a, b) => 
                a.last_name.localeCompare(b.last_name)
              );
              
              // Group by gender
              const groupedStudents = sortedStudents.reduce((acc, student) => {
                const gender = student.gender || 'other';
                if (!acc[gender]) {
                  acc[gender] = [];
                }
                acc[gender].push(student);
                return acc;
              }, {} as Record<string, typeof filteredStudents>);
              
              // Define gender order for display
              const genderOrder: ('male' | 'female' | 'other')[] = ['male', 'female', 'other'];
              
              return genderOrder.map((gender) => {
                const studentsInGroup = groupedStudents[gender] || [];
                if (studentsInGroup.length === 0) return null;
                
                return (
                  <div key={gender} className="border-b border-gray-200 last:border-b-0">
                    {/* Gender Group Header */}
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <div className="flex items-center space-x-2">
                        {gender === 'male' && <UserIcon className="w-4 h-4 text-blue-600" />}
                        {gender === 'female' && <UsersIcon className="w-4 h-4 text-pink-600" />}
                        {gender === 'other' && <UserGroupIcon className="w-4 h-4 text-gray-600" />}
                        <h5 className="text-sm font-medium text-gray-900 capitalize">
                          {gender} Students ({studentsInGroup.length})
                        </h5>
                      </div>
                    </div>
                    
                    {/* Students in this gender group */}
                    <div className="divide-y divide-gray-100">
                      {studentsInGroup.map((student) => (
                        <StudentGradesByQuarter
                          key={student.id}
                          student={student}
                          subjectId={subjectId}
                          runningGrades={gradesByStudent[student.id] || []}
                          academicYear="2025-2026"
                          selectedQuarter={selectedQuarter}
                          isBatchMode={isBatchMode}
                          onGradeChange={handleGradeChange}
                          isDisabled={isSubmitting}
                        />
                      ))}
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>
      </div>
    </div>
  );
}; 