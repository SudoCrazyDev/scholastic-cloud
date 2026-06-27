import React, { useState, useEffect } from 'react';
import { Input } from '../../../components/input';
import { CalculatorIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useUpdateFinalGrade, useUpsertFinalGrade, useDeleteStudentRunningGrade } from '../../../hooks/useStudentRunningGrades';
import { toast } from 'react-hot-toast';
import { formatGrade, getGradeColor, getGradeBackground, toNumber } from '../../../utils/gradeUtils';
import { mapScoreToLabel, type GradeBandLike } from '../../../utils/gradeScale';

interface FinalGradeInputProps {
  studentId: string;
  subjectId: string;
  quarter: '1' | '2' | '3' | '4';
  currentFinalGrade?: number;
  calculatedGrade?: number;
  gradeId?: string;
  academicYear?: string;
  // Batch submission props
  isBatchMode?: boolean;
  onGradeChange?: (data: {
    studentId: string;
    subjectId: string;
    quarter: '1' | '2' | '3' | '4';
    finalGrade: number;
    gradeId?: string;
    academicYear: string;
    hasChanged: boolean;
  }) => void;
  isDisabled?: boolean;
  /** Non-numerical grading bands; when present the calculated grade also shows its letter. */
  gradingBands?: GradeBandLike[] | null;
}

export const FinalGradeInput: React.FC<FinalGradeInputProps> = ({
  studentId,
  subjectId,
  quarter,
  currentFinalGrade,
  calculatedGrade,
  gradeId,
  academicYear = '2025-2026',
  isBatchMode = false,
  onGradeChange,
  isDisabled = false,
  gradingBands = null,
}) => {
  const [finalGrade, setFinalGrade] = useState<number | ''>(
    currentFinalGrade != null ? currentFinalGrade : ''
  );
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const updateFinalGradeMutation = useUpdateFinalGrade();
  const upsertFinalGradeMutation = useUpsertFinalGrade();
  const deleteStudentRunningGradeMutation = useDeleteStudentRunningGrade();

  // Update local state when currentFinalGrade prop changes
  useEffect(() => {
    setFinalGrade(currentFinalGrade != null ? currentFinalGrade : '');
    setHasLocalChanges(false);
  }, [currentFinalGrade]);

  const handleFinalGradeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;

    if (rawValue === '') {
      setFinalGrade('');
      setHasLocalChanges(true);
      if (isBatchMode && onGradeChange) {
        onGradeChange({
          studentId,
          subjectId,
          quarter,
          finalGrade: 0,
          gradeId,
          academicYear,
          hasChanged: (currentFinalGrade ?? 0) !== 0,
        });
      }
      return;
    }

    const value = Number(rawValue);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      setFinalGrade(value);
      setHasLocalChanges(true);
      
      if (isBatchMode && onGradeChange) {
        const originalGrade = currentFinalGrade ?? 0;
        onGradeChange({
          studentId,
          subjectId,
          quarter,
          finalGrade: value,
          gradeId,
          academicYear,
          hasChanged: value !== originalGrade,
        });
      }
    }
  };

  const handleSave = async () => {
    // In batch mode, don't save immediately
    if (isBatchMode) {
      return;
    }

    const numericGrade = finalGrade === '' ? 0 : finalGrade;
    const originalGrade = currentFinalGrade ?? 0;
    if (numericGrade === originalGrade) {
      toast.success('No changes to save', {
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

    // Show loading toast
    const loadingToast = toast.loading('Saving grade...', {
      icon: '⏳',
      style: {
        background: '#3b82f6',
        color: 'white',
        fontWeight: '600',
      },
    });

    try {
      if (gradeId) {
        await updateFinalGradeMutation.mutateAsync({
          id: gradeId,
          finalGrade: numericGrade,
        });
      } else {
        await upsertFinalGradeMutation.mutateAsync({
          studentId,
          subjectId,
          quarter,
          finalGrade: numericGrade,
          academicYear,
        });
      }
      toast.dismiss(loadingToast);
      setHasLocalChanges(false);
    } catch (error) {
      // Dismiss loading toast (error toast will show from mutation)
      toast.dismiss(loadingToast);
    }
  };

  const handleUseCalculatedGrade = async () => {
    const numCalculatedGrade = toNumber(calculatedGrade);
    if (!calculatedGrade || numCalculatedGrade === 0) {
      toast.error('No calculated grade available');
      return;
    }

    const currentFinalGradeNum = currentFinalGrade ?? 0;
    if (numCalculatedGrade === currentFinalGradeNum) {
      // No change, just update the local state and don't make API call
      setFinalGrade(numCalculatedGrade);
      setHasLocalChanges(false);
      toast.success('Calculated grade is already applied', {
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

    // In batch mode, just update local state
    if (isBatchMode) {
      setFinalGrade(numCalculatedGrade);
      setHasLocalChanges(true);
      
      if (onGradeChange) {
        onGradeChange({
          studentId,
          subjectId,
          quarter,
          finalGrade: numCalculatedGrade,
          gradeId,
          academicYear,
          hasChanged: true,
        });
      }
      return;
    }

    // Show loading toast
    const loadingToast = toast.loading('Applying calculated grade...', {
      icon: '⏳',
      style: {
        background: '#3b82f6',
        color: 'white',
        fontWeight: '600',
      },
    });

    try {
      if (gradeId) {
        // Update existing grade
        await updateFinalGradeMutation.mutateAsync({
          id: gradeId,
          finalGrade: numCalculatedGrade,
        });
      } else {
        // Create new grade if it doesn't exist
        await upsertFinalGradeMutation.mutateAsync({
          studentId,
          subjectId,
          quarter,
          finalGrade: numCalculatedGrade,
          academicYear,
        });
      }
      setFinalGrade(numCalculatedGrade);
      setHasLocalChanges(false);
      // Dismiss loading toast (success toast will show from mutation)
      toast.dismiss(loadingToast);
    } catch (error) {
      // Dismiss loading toast (error toast will show from mutation)
      toast.dismiss(loadingToast);
    }
  };

  // Visual indicator for changes in batch mode
  const hasChanges = isBatchMode ? hasLocalChanges : false;

  // For non-numerical subjects, map the calculated grade to its letter ("show both").
  const calculatedLetter =
    gradingBands && gradingBands.length > 0 ? mapScoreToLabel(toNumber(calculatedGrade), gradingBands) : null;

  return (
    <div className="flex flex-col items-center space-y-2">
      {/* Calculated Grade Display with Calculator Button */}
      <div className="flex items-center space-x-1">
        <span className={`text-sm font-semibold px-2 py-1 rounded-md ${getGradeBackground(calculatedGrade)} ${getGradeColor(calculatedGrade)}`}>
          {calculatedLetter ? `${calculatedLetter} (${formatGrade(calculatedGrade)})` : formatGrade(calculatedGrade)}
        </span>
        
        {/* Use Calculated Grade Button */}
        {calculatedGrade !== undefined && calculatedGrade !== null && !isNaN(calculatedGrade) && (
          <button
            onClick={handleUseCalculatedGrade}
            disabled={isDisabled || updateFinalGradeMutation.isPending || upsertFinalGradeMutation.isPending}
            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all duration-200 group relative"
            title={`Use calculated grade: ${formatGrade(calculatedGrade)}`}
          >
            <CalculatorIcon className="w-3 h-3" />
            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
              Use calculated grade: {formatGrade(calculatedGrade)}
            </span>
          </button>
        )}
      </div>

      {/* Final Grade Input */}
      <div className="relative flex items-center space-x-1">
        <Input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={finalGrade}
          placeholder=""
          onChange={handleFinalGradeChange}
          onBlur={isBatchMode ? undefined : handleSave}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !isBatchMode) {
              handleSave();
            }
          }}
          size="sm"
          className={`text-center w-16 h-10 text-sm font-medium ${
            hasChanges ? 'ring-2 ring-blue-500 ring-opacity-50 bg-blue-50' : ''
          }`}
          variant="outlined"
          disabled={isDisabled || updateFinalGradeMutation.isPending || upsertFinalGradeMutation.isPending || deleteStudentRunningGradeMutation.status === 'pending'}
        />
        
        {/* Change indicator for batch mode */}
        {hasChanges && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
        )}
        
        {/* Delete button for existing running grade */}
        {gradeId && (
          <button
            type="button"
            className="ml-1 p-1 rounded hover:bg-red-100"
            title="Delete running grade"
            onClick={() => deleteStudentRunningGradeMutation.mutate(gradeId)}
            disabled={isDisabled || deleteStudentRunningGradeMutation.status === 'pending'}
          >
            <TrashIcon className="w-4 h-4 text-red-500" />
          </button>
        )}
      </div>
    </div>
  );
}; 