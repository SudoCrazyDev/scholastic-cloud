export interface InstitutionSubscription {
  id: string;
  institution_id: string;
  subscription_id: string;
  expiration_date: Date;
  discount: number;
  created_at: Date;
  updated_at: Date;
}

export interface InstitutionSubscriptionResponse {
  id: string;
  institution_id: string;
  subscription_id: string;
  expiration_date: Date;
  discount: number;
  created_at: Date;
  updated_at: Date;
}

export interface InstitutionSubscriptionListResponse {
  data: InstitutionSubscriptionResponse[];
  meta: {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
  };
}

// API Service Types
export interface AssignSubscriptionData {
  institution_id: string;
  subscription_id: string;
  expiration_date: any; // DateTime type
  discount?: number;
}

export interface UpdateInstitutionSubscriptionData {
  subscription_id?: string;
  expiration_date?: any; // DateTime type
  discount?: number;
} 