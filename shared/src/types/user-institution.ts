export interface UserInstitution {
  id: string;
  user_id: string;
  institution_id: string;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserInstitutionResponse {
  id: string;
  user_id: string;
  institution_id: string;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserInstitutionListResponse {
  data: UserInstitutionResponse[];
  meta: {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
  };
}

// API Service Types
export interface AssignUserToInstitutionData {
  user_id: string;
  institution_id: string;
  is_default?: boolean;
}

export interface UpdateUserInstitutionData {
  is_default?: boolean;
} 