import { api } from '../lib/api';

export interface User {
  id: string;
  firstName: string;
  middleName?: string;
  lastName?: string;
  extName?: string;
  gender?: string;
  birthdate?: string;
  email: string;
  emailVerifiedAt?: string;
  token?: string;
  tokenExpiry?: string;
  isNew: boolean;
  roleId?: number;
  roleTitle?: string;
  roleSlug?: string;
  role?: {
    slug: string;
    title: string;
  }
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  token_expiry: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  session?: {
    id: string;
    userId: string;
    token: string;
    expiresAt: string;
    createdAt: string;
  };
  error?: string;
}

class AuthService {
  private currentUser: User | null = null;

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
  }

  async logout(): Promise<void> {
    try {
      await api.post('/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.currentUser = null;
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('token_expiry');
    }
  }

  async getProfile(): Promise<any> {
    try {
      const response = await api.get('/profile');
      return response.data.data;
    } catch (error) {
      console.error('Get profile error:', error);
      throw error;
    }
  }

  async validateSession(): Promise<AuthResponse> {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        return { success: false, error: 'No token found' };
      }

      const userData = await this.getProfile();
      this.currentUser = userData;
      
      return {
        success: true,
        user: userData,
        session: {
          id: 'session-id',
          userId: userData.id,
          token: token,
          expiresAt: localStorage.getItem('token_expiry') || '',
          createdAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Session validation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session validation failed'
      };
    }
  }

  getCurrentUser(): User | null {
    if (!this.currentUser) {
      const userStr = localStorage.getItem('auth_user');
      if (userStr) {
        try {
          this.currentUser = JSON.parse(userStr);
        } catch (error) {
          console.error('Error parsing stored user:', error);
        }
      }
    }
    return this.currentUser;
  }

  isAuthenticated(): boolean {
    const token = localStorage.getItem('auth_token');
    return token !== null;
  }

  hasRole(roleSlug: string): boolean {
    const user = this.getCurrentUser();
    return user?.role?.slug === roleSlug;
  }

  isSubjectTeacher(): boolean {
    return this.hasRole('subject-teacher');
  }

  // Initialize auth state from localStorage
  async initialize(): Promise<AuthResponse> {
    const token = localStorage.getItem('auth_token');
    if (token) {
      return await this.validateSession();
    }
    return { success: false, error: 'No stored session' };
  }
}

export const authService = new AuthService(); 