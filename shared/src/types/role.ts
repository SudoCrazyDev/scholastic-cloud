export interface Role {
  id: string;
  title: string;
  slug: string;
  description?: string;
  permissions?: string[];
  created_at: Date;
  updated_at: Date;
}

export interface RoleResponse {
  id: string;
  title: string;
  slug: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

export interface RoleListResponse {
  data: RoleResponse[];
  meta: {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
  };
}

// API Service Types
export interface CreateRoleData {
  title: string;
  slug: string;
}

export interface UpdateRoleData {
  title?: string;
  slug?: string;
}

export interface RoleListFilters {
  page?: number;
  limit?: number;
  search?: string;
} 