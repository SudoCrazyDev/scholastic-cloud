export interface ApiConfig {
    baseURL: string;
    timeout: number;
    headers?: Record<string, string>;
}
export interface ApiRequestConfig {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    url: string;
    data?: any;
    params?: Record<string, any>;
    headers?: Record<string, string>;
}
export interface ApiEndpoint {
    path: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    description: string;
    requiresAuth: boolean;
    roles?: string[];
}
export interface ApiRoutes {
    auth: {
        login: string;
        register: string;
        logout: string;
        refresh: string;
        forgotPassword: string;
        resetPassword: string;
    };
    users: {
        profile: string;
        update: string;
        list: string;
        create: string;
        delete: string;
    };
}
export declare const API_ROUTES: ApiRoutes;
