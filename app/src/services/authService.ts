import { api } from '../lib/api';
import type { LoginRequest, LoginResponse } from '../../../shared/src/types/auth';

export const authService = {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      const response = await api.post('/login', credentials);
      // Check if the response has the expected structure
      if (!response.data || !response.data.data) {
        throw new Error('Invalid response structure from server');
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('AuthService: Login error:', error);
      console.error('AuthService: Error response:', error.response);
      console.error('AuthService: Error message:', error.message);
      throw error;
    }
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },

  async getProfile(): Promise<any> {
    const response = await api.get('/auth/profile');
    return response.data.data;
  },
}; 