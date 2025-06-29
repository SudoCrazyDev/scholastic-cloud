import { AxiosError } from 'axios';

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

export class ErrorHandler {
  static handle(error: unknown): ApiError {
    if (error instanceof AxiosError) {
      return this.handleAxiosError(error);
    }
    
    if (error instanceof Error) {
      return {
        message: error.message,
      };
    }
    
    return {
      message: 'An unexpected error occurred',
    };
  }

  private static handleAxiosError(error: AxiosError): ApiError {
    const status = error.response?.status;
    const data = error.response?.data as any;

    switch (status) {
      case 400:
        return {
          message: data?.message || 'Invalid request data',
          status,
          code: 'BAD_REQUEST',
        };
      
      case 401:
        return {
          message: 'Invalid email or password',
          status,
          code: 'UNAUTHORIZED',
        };
      
      case 403:
        return {
          message: 'Access denied',
          status,
          code: 'FORBIDDEN',
        };
      
      case 404:
        return {
          message: 'Resource not found',
          status,
          code: 'NOT_FOUND',
        };
      
      case 422:
        return {
          message: data?.message || 'Validation failed',
          status,
          code: 'VALIDATION_ERROR',
        };
      
      case 500:
        return {
          message: 'Internal server error',
          status,
          code: 'INTERNAL_ERROR',
        };
      
      default:
        return {
          message: error.message || 'Network error',
          status,
          code: 'NETWORK_ERROR',
        };
    }
  }

  static getValidationErrors(error: AxiosError): Record<string, string> {
    const data = error.response?.data as any;
    
    if (data?.errors && typeof data.errors === 'object') {
      const validationErrors: Record<string, string> = {};
      
      Object.keys(data.errors).forEach((field) => {
        const fieldErrors = data.errors[field];
        if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
          validationErrors[field] = fieldErrors[0];
        }
      });
      
      return validationErrors;
    }
    
    return {};
  }
} 