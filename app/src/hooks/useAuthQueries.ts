import { useMutation, useQuery } from '@tanstack/react-query';
import { authService } from '../services/authService';
import type { LoginRequest } from '../../../shared/src/types/auth';

export const useLogin = () => {
  return useMutation({
    mutationFn: (credentials: LoginRequest) => authService.login(credentials),
  });
};

export const useLogout = () => {
  return useMutation({
    mutationFn: () => authService.logout(),
  });
};

export const useProfile = () => {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => authService.getProfile(),
    enabled: !!localStorage.getItem('auth_token'),
  });
}; 