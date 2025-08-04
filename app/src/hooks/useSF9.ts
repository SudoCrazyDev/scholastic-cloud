import { useQuery, useMutation } from '@tanstack/react-query';
import { sf9Service, type GenerateSF9Request } from '../services/sf9Service';
import { toast } from 'react-hot-toast';

export const useSF9 = () => {

  /**
   * Generate SF9 data for a student
   */
  const generateSF9Mutation = useMutation({
    mutationFn: (data: GenerateSF9Request) => sf9Service.generate(data),
    onSuccess: (response) => {
      if (response.success) {
        toast.success('SF9 data generated successfully');
      } else {
        toast.error(response.message || 'Failed to generate SF9 data');
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to generate SF9 data');
    },
  });

  /**
   * Get available academic years for a student
   */
  const useAcademicYears = (studentId: string) => {
    return useQuery({
      queryKey: ['sf9', 'academic-years', studentId],
      queryFn: () => sf9Service.getAcademicYears(studentId),
      enabled: !!studentId,
    });
  };

  return {
    generateSF9: generateSF9Mutation.mutateAsync,
    generateSF9Loading: generateSF9Mutation.isPending,
    generateSF9Error: generateSF9Mutation.error,
    useAcademicYears,
  };
}; 