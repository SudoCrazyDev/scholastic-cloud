import { ValidationError } from '../types/common';
export interface ValidationRule {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    email?: boolean;
    custom?: (value: any) => boolean | string;
}
export interface ValidationSchema {
    [key: string]: ValidationRule;
}
export declare const validateField: (value: any, fieldName: string, rules: ValidationRule) => ValidationError | null;
export declare const validateForm: (data: Record<string, any>, schema: ValidationSchema) => ValidationError[];
export declare const isValidEmail: (email: string) => boolean;
export declare const isValidPassword: (password: string) => boolean;
