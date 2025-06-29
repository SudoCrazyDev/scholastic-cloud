export interface Institution {
    id: string;
    title: string;
    abbr: string;
    address?: string;
    division?: string;
    region?: string;
    gov_id?: string;
    logo?: string;
    created_at: Date;
    updated_at: Date;
}
export interface InstitutionResponse {
    id: string;
    title: string;
    abbr: string;
    address?: string;
    division?: string;
    region?: string;
    gov_id?: string;
    logo?: string;
    created_at: Date;
    updated_at: Date;
}
export interface InstitutionListResponse {
    data: InstitutionResponse[];
    meta: {
        total: number;
        per_page: number;
        current_page: number;
        last_page: number;
    };
}
export interface CreateInstitutionData {
    title: string;
    abbr: string;
    address?: string;
    division?: string;
    region?: string;
    gov_id?: string;
    logo?: string;
}
export interface UpdateInstitutionData {
    title?: string;
    abbr?: string;
    address?: string;
    division?: string;
    region?: string;
    gov_id?: string;
    logo?: string;
}
export interface InstitutionListFilters {
    page?: number;
    limit?: number;
    search?: string;
    region?: string;
    division?: string;
}
