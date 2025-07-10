export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  token_expiry: string;
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