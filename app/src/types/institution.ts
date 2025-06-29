// Placeholder type for Institution
// Replace with actual type from shared/src/types once available

export interface Institution {
  id: string;
  name: string;
  location?: string;
  type?: string; // e.g., University, College, Vocational School
  // Add other relevant fields here
  createdAt?: string; // ISO Date string
  updatedAt?: string; // ISO Date string
}

export interface InstitutionCreatePayload {
  name: string;
  location?: string;
  type?: string;
}

export interface InstitutionUpdatePayload {
  name?: string;
  location?: string;
  type?: string;
}
