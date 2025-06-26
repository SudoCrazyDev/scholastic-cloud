export interface User {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  gender: 'male' | 'female' | 'other';
  birthdate: Date;
  email: string;
  email_verified_at?: Date;
  password: string;
  token?: string;
  is_new: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator'
}

export interface CreateUserRequest {
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  gender: 'male' | 'female' | 'other';
  birthdate: string; // ISO date string
  email: string;
  password: string;
}

export interface UpdateUserRequest {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  ext_name?: string;
  gender?: 'male' | 'female' | 'other';
  birthdate?: string; // ISO date string
  email?: string;
  is_new?: boolean;
  is_active?: boolean;
  password?: string;
}

export interface UserResponse {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  gender: 'male' | 'female' | 'other';
  birthdate: Date;
  email: string;
  email_verified_at?: Date;
  is_new: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserListResponse {
  data: UserResponse[];
  meta: {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
  };
}

export interface ValidationError {
  field: string;
  message: string;
  rule: string;
}

export interface ApiError {
  message: string;
  errors?: ValidationError[];
  status: number;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatar?: string;
  bio?: string;
} 