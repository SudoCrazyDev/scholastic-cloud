import { useState, useEffect, createContext, useContext } from 'react';
import type { LoginResponse } from '../../../shared/src/types/auth';
import { authService } from '../services/authService';
import { queryClient } from '../providers/QueryProvider';

interface AuthContextType {
  user: any | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (loginData: LoginResponse) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useAuthState = () => {
  const [user, setUser] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    
    setIsLoading(false);
  }, []);

  const login = async (loginData: LoginResponse) => {
    console.log('useAuthState: Login loginData:', loginData);
    
    // Store token first
    setToken(loginData.token);
    localStorage.setItem('auth_token', loginData.token);
    localStorage.setItem('token_expiry', loginData.token_expiry);
    
    try {
      // Fetch user data separately
      const userData = await authService.getProfile();
      setUser(userData);
      localStorage.setItem('auth_user', JSON.stringify(userData));
    } catch (error) {
      console.error('Failed to fetch user profile after login:', error);
      // Create a fallback user object with basic info
      const fallbackUser = {
        id: 'unknown',
        first_name: 'User',
        last_name: '',
        email: 'user@example.com',
        role: { title: 'User', slug: 'user' }
      };
      setUser(fallbackUser);
      localStorage.setItem('auth_user', JSON.stringify(fallbackUser));
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('token_expiry');
    
    // Clear all cached queries
    queryClient.clear();
  };

  const refreshProfile = async () => {
    try {
      const userData = await authService.getProfile();
      setUser(userData);
      localStorage.setItem('auth_user', JSON.stringify(userData));
    } catch (error) {
      console.error('Failed to refresh user profile:', error);
      throw error;
    }
  };

  return {
    user,
    token,
    isAuthenticated: !!token,
    isLoading,
    login,
    logout,
    refreshProfile,
  };
};

export { AuthContext }; 