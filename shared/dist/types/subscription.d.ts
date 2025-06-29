export interface Subscription {
    id: string;
    title: string;
    description?: string;
    price: number;
    created_at: Date;
    updated_at: Date;
}
export interface SubscriptionResponse {
    id: string;
    title: string;
    description?: string;
    price: number;
    created_at: Date;
    updated_at: Date;
}
export interface SubscriptionListResponse {
    data: SubscriptionResponse[];
    meta: {
        total: number;
        per_page: number;
        current_page: number;
        last_page: number;
    };
}
export interface CreateSubscriptionData {
    title: string;
    description?: string;
    price: number;
}
export interface UpdateSubscriptionData {
    title?: string;
    description?: string;
    price?: number;
}
export interface SubscriptionListFilters {
    page?: number;
    limit?: number;
    search?: string;
    min_price?: number;
    max_price?: number;
}
