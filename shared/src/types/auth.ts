export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  token_expiry: string;
  /** Set when logging in as a student; allows frontend to set role to student immediately */
  user?: {
    id: string;
    first_name: string;
    middle_name?: string;
    last_name: string;
    ext_name?: string;
    email: string;
    role: { title: string; slug: string };
    student_id: string;
    is_new?: boolean;
    [key: string]: unknown;
  };
}

export interface RegisterRequest {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface AuthState {
  user: any | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// API Service Types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResult {
  user: any; // User model type
  token: string;
  token_type: string;
  expires_in: string;
}

export interface TokenPayload {
  user_id: string;
  email: string;
  role_id?: string;
  iat?: number;
  exp?: number;
} 