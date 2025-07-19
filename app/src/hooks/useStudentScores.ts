import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentScoreService } from '../services/studentScoreService';
import { toast } from 'react-hot-toast';

interface UseStudentScoresParams {
  subjectId: string;
  classSectionId: string;
  enabled?: boolean;
}

export const useStudentScores = ({ subjectId, classSectionId, enabled = true }: UseStudentScoresParams) => {
  return useQuery({
    queryKey: ['student-scores', subjectId, classSectionId],
    queryFn: async () => {
      const result = await studentScoreService.getBySubjectAndSection(subjectId, classSectionId);
      return result;
    },
    enabled: enabled && !!subjectId && !!classSectionId,
    retry: 1,
    retryDelay: 1000,
    staleTime: 0, // Always consider data stale to ensure fresh data on subject change
  });
};

export const useUpsertStudentScore = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      studentId, 
      subjectEcrItemId, 
      score, 
      academicYear 
    }: { 
      studentId: string; 
      subjectEcrItemId: string; 
      score: number; 
      academicYear?: string; 
    }) => {
      const result = await studentScoreService.upsertScore({
        student_id: studentId,
        subject_ecr_item_id: subjectEcrItemId,
        score,
        academic_year: academicYear,
      });
      return result;
    },
    onSuccess: (data, variables) => {
      // Enhanced success message with score details
      const score = data?.score || variables.score;
      const studentName = data?.student?.first_name 
        ? `${data.student.first_name} ${data.student.last_name}`
        : 'Student';
      
      const action = data?.id ? 'updated' : 'created';
      
      toast.success(
        `✅ Score ${action} for ${studentName}: ${score.toFixed(2)}`,
        {
          duration: 4000,
          icon: '📊',
          style: {
            background: '#10b981',
            color: 'white',
            fontWeight: '600',
          },
        }
      );
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['student-scores'] });
    },
    onError: (error: any) => {
      toast.error(
        `❌ Failed to save score: ${error?.response?.data?.message || 'Unknown error'}`,
        {
          duration: 5000,
          icon: '⚠️',
          style: {
            background: '#ef4444',
            color: 'white',
            fontWeight: '600',
          },
        }
      );
    },
  });
}; 