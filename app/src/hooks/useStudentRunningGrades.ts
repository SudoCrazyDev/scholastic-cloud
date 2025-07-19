import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentRunningGradeService } from '../services/studentRunningGradeService';
import type { StudentRunningGrade, StudentRunningGradeUpdateData } from '../services/studentRunningGradeService';
import { toast } from 'react-hot-toast';

interface UseStudentRunningGradesParams {
  subjectId?: string;
  classSectionId?: string;
  enabled?: boolean;
}

interface UseStudentRunningGradesByStudentParams {
  studentId?: string;
  subjectId?: string;
  enabled?: boolean;
}

export const useStudentRunningGrades = ({ subjectId, classSectionId, enabled = true }: UseStudentRunningGradesParams) => {
  return useQuery({
    queryKey: ['student-running-grades', subjectId, classSectionId],
    queryFn: async () => {
      if (!subjectId || !classSectionId) {
        throw new Error('Subject ID and Class Section ID are required');
      }
      const result = await studentRunningGradeService.getBySubjectAndClassSection(subjectId, classSectionId);
      return result;
    },
    enabled: enabled && !!subjectId && !!classSectionId,
    retry: 1,
    retryDelay: 1000,
    staleTime: 0,
  });
};

export const useStudentRunningGradesByStudent = ({ studentId, subjectId, enabled = true }: UseStudentRunningGradesByStudentParams) => {
  return useQuery({
    queryKey: ['student-running-grades-by-student', studentId, subjectId],
    queryFn: async () => {
      if (!studentId || !subjectId) {
        throw new Error('Student ID and Subject ID are required');
      }
      const result = await studentRunningGradeService.getByStudentAndSubject(studentId, subjectId);
      return result;
    },
    enabled: enabled && !!studentId && !!subjectId,
    retry: 1,
    retryDelay: 1000,
    staleTime: 0,
  });
};

export const useUpdateStudentRunningGrade = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: StudentRunningGradeUpdateData }) => {
      const result = await studentRunningGradeService.update(id, data);
      return result;
    },
    onSuccess: (data, variables) => {
      // Enhanced success message with grade details
      const studentName = data?.student?.first_name 
        ? `${data.student.first_name} ${data.student.last_name}`
        : 'Student';
      
      toast.success(
        `✅ Grade updated for ${studentName}`,
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
      queryClient.invalidateQueries({ queryKey: ['student-running-grades'] });
      queryClient.invalidateQueries({ queryKey: ['student-running-grades-by-student'] });
      queryClient.invalidateQueries({ queryKey: ['student-scores'] });
    },
    onError: (error: any) => {
      toast.error(
        `❌ Failed to update grade: ${error?.response?.data?.message || 'Unknown error'}`,
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

export const useUpdateFinalGrade = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, finalGrade }: { id: string; finalGrade: number }) => {
      const result = await studentRunningGradeService.updateFinalGrade(id, finalGrade);
      return result;
    },
    onSuccess: (data, variables) => {
      // Enhanced success message with grade details
      const grade = data?.grade || variables.finalGrade;
      const quarter = data?.quarter || 'Unknown';
      const studentName = data?.student?.first_name 
        ? `${data.student.first_name} ${data.student.last_name}`
        : 'Student';
      
      toast.success(
        `✅ Grade updated for ${studentName} - Q${quarter}: ${grade.toFixed(2)}`,
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
      queryClient.invalidateQueries({ queryKey: ['student-running-grades'] });
      queryClient.invalidateQueries({ queryKey: ['student-running-grades-by-student'] });
    },
    onError: (error: any) => {
      toast.error(
        `❌ Failed to update grade: ${error?.response?.data?.message || 'Unknown error'}`,
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

export const useUpsertFinalGrade = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      studentId, 
      subjectId, 
      quarter, 
      finalGrade, 
      academicYear 
    }: { 
      studentId: string; 
      subjectId: string; 
      quarter: '1' | '2' | '3' | '4'; 
      finalGrade: number; 
      academicYear: string; 
    }) => {
      const result = await studentRunningGradeService.upsertFinalGrade(
        studentId, 
        subjectId, 
        quarter, 
        finalGrade, 
        academicYear
      );
      return result;
    },
    onSuccess: (data, variables) => {
      // Enhanced success message with grade details
      const grade = data?.final_grade || variables.finalGrade;
      const quarter = data?.quarter || variables.quarter;
      const studentName = data?.student?.first_name 
        ? `${data.student.first_name} ${data.student.last_name}`
        : 'Student';
      
      const action = data?.id ? 'updated' : 'created';
      
      toast.success(
        `✅ Grade ${action} for ${studentName} - Q${quarter}: ${grade.toFixed(2)}`,
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
      queryClient.invalidateQueries({ queryKey: ['student-running-grades'] });
      queryClient.invalidateQueries({ queryKey: ['student-running-grades-by-student'] });
    },
    onError: (error: any) => {
      toast.error(
        `❌ Failed to save grade: ${error?.response?.data?.message || 'Unknown error'}`,
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