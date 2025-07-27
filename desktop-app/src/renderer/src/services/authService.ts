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
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
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
  private sessionId: string | null = null;

  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      // Initialize database if needed
      await window.api.database.initialize();
      
      // Use the desktop app's database API
      const response = await window.api.database.authenticate(email, password);
      
      if (response.success && response.user && response.session) {
        this.currentUser = response.user;
        this.sessionId = response.session.id;
        
        // Store session in localStorage for persistence
        localStorage.setItem('sessionId', response.session.id);
        localStorage.setItem('user', JSON.stringify(response.user));
      }
      
      return response;
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed'
      };
    }
  }

  async validateSession(): Promise<AuthResponse> {
    try {
      const sessionId = localStorage.getItem('sessionId');
      if (!sessionId) {
        return { success: false, error: 'No session found' };
      }

      // Initialize database if needed
      await window.api.database.initialize();

      const response = await window.api.database.validateSession(sessionId);
      
      if (response.success && response.user && response.session) {
        this.currentUser = response.user;
        this.sessionId = response.session.id;
      }
      
      return response;
    } catch (error) {
      console.error('Session validation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session validation failed'
      };
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.sessionId) {
        await window.api.database.logout(this.sessionId);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.currentUser = null;
      this.sessionId = null;
      localStorage.removeItem('sessionId');
      localStorage.removeItem('user');
    }
  }

  getCurrentUser(): User | null {
    if (!this.currentUser) {
      const userStr = localStorage.getItem('user');
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
    return this.getCurrentUser() !== null;
  }

  hasRole(roleSlug: string): boolean {
    const user = this.getCurrentUser();
    return user?.roleSlug === roleSlug;
  }

  isSubjectTeacher(): boolean {
    return this.hasRole('teacher');
  }

  // Initialize auth state from localStorage
  async initialize(): Promise<AuthResponse> {
    const user = this.getCurrentUser();
    if (user) {
      this.currentUser = user;
      return await this.validateSession();
    }
    return { success: false, error: 'No stored session' };
  }
}

export const authService = new AuthService(); 