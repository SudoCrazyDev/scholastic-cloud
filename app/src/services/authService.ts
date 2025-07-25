import { api } from '../lib/api';
import type { LoginRequest, LoginResponse } from '../../../shared/src/types/auth';

export const authService = {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      const response = await api.post('/login', credentials);
      // Handle both wrapped and unwrapped response formats
      const responseData = response.data?.data || response.data;
      
      if (!responseData || !responseData.token) {
        throw new Error('Invalid response structure from server');
      }
      
      return responseData;
    } catch (error: any) {
      console.error('AuthService: Login error:', error);
      console.error('AuthService: Error response:', error.response);
      console.error('AuthService: Error message:', error.message);
      throw error;
    }
  },

  async logout(): Promise<void> {
    await api.post('/logout');
  },

  async getProfile(): Promise<any> {
    const response = await api.get('/profile');
    return response.data.data;
  },
}; 