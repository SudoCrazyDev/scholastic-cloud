import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import type { StudentScore } from '../../../services/studentScoreService';
import { studentScoreService } from '../../../services/studentScoreService';
import { toast } from 'react-hot-toast';
import { ErrorHandler } from '../../../utils/errorHandler';
import { Input } from '../../../components/input';

interface StudentScoreInputProps {
  studentId: string;
  itemId: string;
  maxScore: number;
  initialScore?: number;
  scoreId?: string;
  onSuccess?: (score: StudentScore) => void;
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
  disabled,
}) => {
  const queryClient = useQueryClient();
  const [currentScoreId, setCurrentScoreId] = useState<string | undefined>(scoreId);
  const [hasExistingScore, setHasExistingScore] = useState<boolean>(!!scoreId);

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
    },
    onError: (error) => {
      const err = ErrorHandler.handle(error);
      toast.error(err.message);
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
    },
    onError: (error) => {
      const err = ErrorHandler.handle(error);
      toast.error(err.message);
      // If update fails because score doesn't exist, try creating instead
      if (err.message.includes('not found') || err.message.includes('404')) {
        setCurrentScoreId(undefined);
        setHasExistingScore(false);
      }
    },
  });

  const handleScoreChange = async (score: number) => {
    // Additional validation to prevent unnecessary API calls
    if (score === initialScore) {
      return; // No change, don't make API call
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
      {({ errors, touched, isSubmitting, handleBlur, values }) => (
        <Form>
          <div className="relative">
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