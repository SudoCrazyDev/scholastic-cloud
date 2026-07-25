import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { applyTheme } from '../theme/palette';
import { resolveUserTheme } from '../theme/institutionTheme';

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Applies the active institution's color theme to the document root whenever the
 * authenticated user changes (login, impersonation, profile refresh after a theme
 * save). Clears back to app defaults on logout. Must live inside AuthProvider.
 *
 * An initial synchronous apply happens in main.tsx (from localStorage) to avoid a
 * flash on reload; this keeps it in sync for the rest of the session.
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { user } = useAuth();

  useEffect(() => {
    applyTheme(resolveUserTheme(user));
  }, [user]);

  return <>{children}</>;
};
