import { useState, useEffect, createContext, useContext } from 'react';
import type { LoginResponse } from '../../../shared/src/types/auth';
import { authService } from '../services/authService';
import { queryClient } from '../providers/QueryProvider';

interface AuthContextType {
  user: any | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isImpersonating: boolean;
  login: (loginData: LoginResponse) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  assumeUser: (userId: string) => Promise<void>;
  stopImpersonating: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const IMPERSONATION_ORIGINAL_TOKEN = 'impersonation_original_token';
const IMPERSONATION_ORIGINAL_USER = 'impersonation_original_user';
const IMPERSONATION_ORIGINAL_EXPIRY = 'impersonation_original_expiry';

export const useAuthState = () => {
  const [user, setUser] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');
    const hasOriginal = !!localStorage.getItem(IMPERSONATION_ORIGINAL_TOKEN);

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      setIsImpersonating(hasOriginal);
    }

    setIsLoading(false);
  }, []);

  const login = async (loginData: LoginResponse) => {
    console.log('useAuthState: Login loginData:', loginData);

    // Clear any previous impersonation when logging in fresh
    localStorage.removeItem(IMPERSONATION_ORIGINAL_TOKEN);
    localStorage.removeItem(IMPERSONATION_ORIGINAL_USER);
    localStorage.removeItem(IMPERSONATION_ORIGINAL_EXPIRY);
    setIsImpersonating(false);

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
    setIsImpersonating(false);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('token_expiry');
    localStorage.removeItem(IMPERSONATION_ORIGINAL_TOKEN);
    localStorage.removeItem(IMPERSONATION_ORIGINAL_USER);
    localStorage.removeItem(IMPERSONATION_ORIGINAL_EXPIRY);

    // Clear all cached queries
    queryClient.clear();
  };

  const assumeUser = async (userId: string) => {
    const currentToken = localStorage.getItem('auth_token');
    const currentUser = localStorage.getItem('auth_user');
    const currentExpiry = localStorage.getItem('token_expiry');
    if (!currentToken || !currentUser) return;

    const data = await authService.assumeUser(userId);
    localStorage.setItem(IMPERSONATION_ORIGINAL_TOKEN, currentToken);
    localStorage.setItem(IMPERSONATION_ORIGINAL_USER, currentUser);
    if (currentExpiry) localStorage.setItem(IMPERSONATION_ORIGINAL_EXPIRY, currentExpiry);

    setToken(data.token);
    setUser(data.user);
    setIsImpersonating(true);
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('auth_user', JSON.stringify(data.user));
    localStorage.setItem('token_expiry', data.token_expiry);
    queryClient.clear();
  };

  const stopImpersonating = () => {
    const originalToken = localStorage.getItem(IMPERSONATION_ORIGINAL_TOKEN);
    const originalUser = localStorage.getItem(IMPERSONATION_ORIGINAL_USER);
    const originalExpiry = localStorage.getItem(IMPERSONATION_ORIGINAL_EXPIRY);
    if (!originalToken || !originalUser) return;

    setToken(originalToken);
    setUser(JSON.parse(originalUser));
    setIsImpersonating(false);
    localStorage.setItem('auth_token', originalToken);
    localStorage.setItem('auth_user', originalUser);
    if (originalExpiry) localStorage.setItem('token_expiry', originalExpiry);
    localStorage.removeItem(IMPERSONATION_ORIGINAL_TOKEN);
    localStorage.removeItem(IMPERSONATION_ORIGINAL_USER);
    localStorage.removeItem(IMPERSONATION_ORIGINAL_EXPIRY);
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
    isImpersonating,
    login,
    logout,
    refreshProfile,
    assumeUser,
    stopImpersonating,
  };
};

export { AuthContext }; 