import React, { useState } from 'react';
import { Input } from '../../../components/input';
import { CalculatorIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useUpdateFinalGrade, useUpsertFinalGrade, useDeleteStudentRunningGrade } from '../../../hooks/useStudentRunningGrades';
import { toast } from 'react-hot-toast';
import { formatGrade, getGradeColor, getGradeBackground, toNumber } from '../../../utils/gradeUtils';

interface FinalGradeInputProps {
  studentId: string;
  subjectId: string;
  quarter: '1' | '2' | '3' | '4';
  currentFinalGrade?: number;
  calculatedGrade?: number;
  gradeId?: string;
  academicYear?: string;
}

export const FinalGradeInput: React.FC<FinalGradeInputProps> = ({
  studentId,
  subjectId,
  quarter,
  currentFinalGrade = 0,
  calculatedGrade,
  gradeId,
  academicYear = '2025-2026',
}) => {
  const [finalGrade, setFinalGrade] = useState(toNumber(currentFinalGrade));
  const [isEditing, setIsEditing] = useState(false);
  const updateFinalGradeMutation = useUpdateFinalGrade();
  const upsertFinalGradeMutation = useUpsertFinalGrade();
  const deleteStudentRunningGradeMutation = useDeleteStudentRunningGrade();

  const handleFinalGradeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      setFinalGrade(value);
    }
  };

  const handleSave = async () => {
    // Check if the value has actually changed
    const originalGrade = toNumber(currentFinalGrade);
    if (finalGrade === originalGrade) {
      // No change, don't make API call
      setIsEditing(false);
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
        // Update existing grade
        await updateFinalGradeMutation.mutateAsync({
          id: gradeId,
          finalGrade: finalGrade,
        });
      } else {
        // Create new grade if it doesn't exist
        await upsertFinalGradeMutation.mutateAsync({
          studentId,
          subjectId,
          quarter,
          finalGrade,
          academicYear,
        });
      }
      setIsEditing(false);
      // Dismiss loading toast (success toast will show from mutation)
      toast.dismiss(loadingToast);
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

    // Check if the calculated grade is different from current final grade
    const currentFinalGradeNum = toNumber(currentFinalGrade);
    if (numCalculatedGrade === currentFinalGradeNum) {
      // No change, just update the local state and don't make API call
      setFinalGrade(numCalculatedGrade);
      setIsEditing(false);
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
      setIsEditing(false);
      // Dismiss loading toast (success toast will show from mutation)
      toast.dismiss(loadingToast);
    } catch (error) {
      // Dismiss loading toast (error toast will show from mutation)
      toast.dismiss(loadingToast);
    }
  };

  return (
    <div className="flex flex-col items-center space-y-2">
      {/* Calculated Grade Display with Calculator Button */}
      <div className="flex items-center space-x-1">
        <span className={`text-sm font-semibold px-2 py-1 rounded-md ${getGradeBackground(calculatedGrade)} ${getGradeColor(calculatedGrade)}`}>
          {formatGrade(calculatedGrade)}
        </span>
        
        {/* Use Calculated Grade Button */}
        {calculatedGrade !== undefined && calculatedGrade !== null && !isNaN(calculatedGrade) && (
          <button
            onClick={handleUseCalculatedGrade}
            disabled={updateFinalGradeMutation.isPending || upsertFinalGradeMutation.isPending}
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
          onChange={handleFinalGradeChange}
          onBlur={handleSave}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSave();
            }
          }}
          size="sm"
          className="text-center w-16 h-10 text-sm font-medium"
          variant="outlined"
          disabled={updateFinalGradeMutation.isPending || upsertFinalGradeMutation.isPending || deleteStudentRunningGradeMutation.status === 'pending'}
        />
        {/* Delete button for existing running grade */}
        {gradeId && (
          <button
            type="button"
            className="ml-1 p-1 rounded hover:bg-red-100"
            title="Delete running grade"
            onClick={() => deleteStudentRunningGradeMutation.mutate(gradeId)}
            disabled={deleteStudentRunningGradeMutation.status === 'pending'}
          >
            <TrashIcon className="w-4 h-4 text-red-500" />
          </button>
        )}
      </div>
    </div>
  );
}; 