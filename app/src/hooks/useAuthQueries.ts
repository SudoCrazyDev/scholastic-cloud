import { useMutation, useQuery } from '@tanstack/react-query';
import { authService } from '../services/authService';
import type { LoginRequest } from '../../../shared/src/types/auth';
import { queryClient } from '../providers/QueryProvider';

export const useLogin = () => {
  return useMutation({
    mutationFn: (credentials: LoginRequest) => authService.login(credentials),
  });
};

export const useLogout = () => {
  return useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      // Clear all cached queries on successful logout
      queryClient.clear();
    },
  });
};

export const useProfile = () => {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => authService.getProfile(),
    enabled: !!localStorage.getItem('auth_token'),
  });
}; 