import type { ReactNode } from 'react';
import { useAuthState, AuthContext } from '../hooks/useAuth';
import type { LoginResponse } from '../../../shared/src/types/auth';

interface AuthContextType {
  user: LoginResponse['user'] | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (userData: LoginResponse) => void;
  logout: () => void;
}

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const authState = useAuthState();

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
}; 