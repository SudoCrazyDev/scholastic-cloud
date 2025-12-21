import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import type { StudentScore } from '../../../services/studentScoreService';
import { studentScoreService } from '../../../services/studentScoreService';
import { toast } from 'react-hot-toast';
import { ErrorHandler } from '../../../utils/errorHandler';
import { Input } from '../../../components/input';
import { TrashIcon } from '@heroicons/react/24/outline';

interface StudentScoreInputProps {
  studentId: string;
  itemId: string;
  maxScore: number;
  initialScore?: number;
  scoreId?: string;
  onSuccess?: (score: StudentScore) => void;
  onEnterPress?: () => void;
  inputId?: string;
  disabled?: boolean;
}

const ScoreSchema = (maxScore: number) =>
  Yup.object().shape({
    score: Yup.number()
      .min(0, 'Score cannot be negative')
      .max(maxScore, `Score cannot exceed ${maxScore}`)
      .required('Score is required'),
  });

export const StudentScoreInput: React.FC<StudentScoreInputProps> = ({
  studentId,
  itemId,
  maxScore,
  initialScore = 0,
  scoreId,
  onSuccess,
  onEnterPress,
  inputId,
  disabled,
}) => {
  const queryClient = useQueryClient();
  const [currentScoreId, setCurrentScoreId] = useState<string | undefined>(scoreId);
  const [hasExistingScore, setHasExistingScore] = useState<boolean>(!!scoreId);
  const [pendingMoveToNext, setPendingMoveToNext] = useState(false);

  // Update state when props change
  useEffect(() => {
    setCurrentScoreId(scoreId);
    setHasExistingScore(!!scoreId);
  }, [scoreId]);

  const createMutation = useMutation({
    mutationFn: (score: number) =>
      studentScoreService.create({
        academic_year: "2025-2026",
        student_id: studentId,
        subject_ecr_item_id: itemId,
        score,
      }),
    onSuccess: (data) => {
      const newScore = data.data ?? data;
      setCurrentScoreId(newScore.id);
      setHasExistingScore(true);
      toast.success('Score added!');
      queryClient.invalidateQueries({ queryKey: ['student-scores'] });
      onSuccess?.(newScore);
      // Move to next input if Enter was pressed
      if (pendingMoveToNext) {
        setPendingMoveToNext(false);
        setTimeout(() => onEnterPress?.(), 50);
      }
    },
    onError: (error) => {
      const err = ErrorHandler.handle(error);
      toast.error(err.message);
      setPendingMoveToNext(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (score: number) => {
      if (!currentScoreId) {
        throw new Error('No score ID available for update');
      }
      return studentScoreService.update(currentScoreId, { score });
    },
    onSuccess: (data) => {
      toast.success('Score updated!');
      queryClient.invalidateQueries({ queryKey: ['student-scores'] });
      onSuccess?.(data.data ?? data);
      // Move to next input if Enter was pressed
      if (pendingMoveToNext) {
        setPendingMoveToNext(false);
        setTimeout(() => onEnterPress?.(), 50);
      }
    },
    onError: (error) => {
      const err = ErrorHandler.handle(error);
      toast.error(err.message);
      setPendingMoveToNext(false);
      // If update fails because score doesn't exist, try creating instead
      if (err.message.includes('not found') || err.message.includes('404')) {
        setCurrentScoreId(undefined);
        setHasExistingScore(false);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!currentScoreId) throw new Error('No score ID to delete');
      return await studentScoreService.delete(currentScoreId);
    },
    onSuccess: () => {
      setCurrentScoreId(undefined);
      setHasExistingScore(false);
      toast.success('Score deleted!');
      queryClient.invalidateQueries({ queryKey: ['student-scores'] });
      onSuccess?.({} as StudentScore);
    },
    onError: (error) => {
      const err = ErrorHandler.handle(error);
      toast.error(err.message);
    },
  });

  const handleScoreChange = async (score: number, moveToNext?: boolean) => {
    // Additional validation to prevent unnecessary API calls
    if (score === initialScore && !moveToNext) {
      return; // No change, don't make API call
    }

    // If Enter was pressed but no change, still move to next
    if (score === initialScore && moveToNext) {
      onEnterPress?.();
      return;
    }

    // Set flag to move to next after save
    if (moveToNext) {
      setPendingMoveToNext(true);
    }

    if (hasExistingScore && currentScoreId) {
      updateMutation.mutate(score);
    } else {
      createMutation.mutate(score);
    }
  };


  const isLoading = createMutation.status === 'pending' || updateMutation.status === 'pending';
  
  return (
    <Formik
      initialValues={{ score: initialScore }}
      validationSchema={ScoreSchema(maxScore)}
      enableReinitialize
      onSubmit={(values, { setSubmitting }) => {
        handleScoreChange(values.score);
        setSubmitting(false);
      }}
    >
      {({ errors, touched, isSubmitting, handleBlur, values, submitForm }) => (
        <Form>
          <div className="relative flex items-center space-x-1">
            <Field name="score">
              {({ field }: any) => (
                <Input
                  {...field}
                  type="number"
                  min={0}
                  max={maxScore}
                  step={1}
                  disabled={disabled || isSubmitting || isLoading}
                  className={`text-center ${hasExistingScore ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                  placeholder={hasExistingScore ? 'Enter score' : 'Enter score'}
                  data-input-id={inputId}
                  onKeyDown={async (e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      // Validate and save
                      if (values.score >= 0 && values.score <= maxScore) {
                        await handleScoreChange(values.score, true);
                      } else {
                        // Even if invalid, move to next if Enter is pressed
                        onEnterPress?.();
                      }
                    }
                  }}
                  onBlur={async (e: React.FocusEvent<HTMLInputElement>) => {
                    handleBlur(e);
                    // Only submit if value changed and is valid
                    if (values.score !== initialScore && values.score >= 0 && values.score <= maxScore) {
                      handleScoreChange(values.score);
                    } else if (values.score === initialScore) {
                      // Show feedback when no change
                      toast.success('No changes to save', {
                        duration: 2000,
                        icon: 'ℹ️',
                        style: {
                          background: '#6b7280',
                          color: 'white',
                          fontWeight: '600',
                        },
                      });
                    }
                  }}
                />
              )}
            </Field>
            {/* Delete button for existing score */}
            {hasExistingScore && (
              <button
                type="button"
                className="ml-1 p-1 rounded hover:bg-red-100"
                title="Delete score"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.status === 'pending' || disabled}
              >
                <TrashIcon className="w-4 h-4 text-red-500" />
              </button>
            )}
            {/* Visual indicator for existing score */}
            {hasExistingScore && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full"></div>
            )}
          </div>
          {errors.score && touched.score && (
            <div className="text-xs text-red-500 mt-1">{errors.score}</div>
          )}
          {/* Status indicator */}
          {isLoading && (
            <div className="text-xs text-blue-500 mt-1">{hasExistingScore ? 'Updating...' : 'Saving...'}</div>
          )}
        </Form>
      )}
    </Formik>
  );
}; 