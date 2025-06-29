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

export const validateField = (
  value: any,
  fieldName: string,
  rules: ValidationRule
): ValidationError | null => {
  // Required validation
  if (rules.required && (!value || value.toString().trim() === '')) {
    return {
      field: fieldName,
      message: `${fieldName} is required`,
      rule: 'required',
    };
  }

  if (!value) return null;

  // Length validation
  if (rules.minLength && value.toString().length < rules.minLength) {
    return {
      field: fieldName,
      message: `${fieldName} must be at least ${rules.minLength} characters`,
      rule: 'minLength',
    };
  }

  if (rules.maxLength && value.toString().length > rules.maxLength) {
    return {
      field: fieldName,
      message: `${fieldName} must be at most ${rules.maxLength} characters`,
      rule: 'maxLength',
    };
  }

  // Email validation
  if (rules.email && !isValidEmail(value)) {
    return {
      field: fieldName,
      message: `${fieldName} must be a valid email address`,
      rule: 'email',
    };
  }

  // Pattern validation
  if (rules.pattern && !rules.pattern.test(value)) {
    return {
      field: fieldName,
      message: `${fieldName} format is invalid`,
      rule: 'pattern',
    };
  }

  // Custom validation
  if (rules.custom) {
    const result = rules.custom(value);
    if (result !== true) {
      return {
        field: fieldName,
        message: typeof result === 'string' ? result : `${fieldName} is invalid`,
        rule: 'custom',
      };
    }
  }

  return null;
};

export const validateForm = (
  data: Record<string, any>,
  schema: ValidationSchema
): ValidationError[] => {
  const errors: ValidationError[] = [];

  for (const [fieldName, rules] of Object.entries(schema)) {
    const error = validateField(data[fieldName], fieldName, rules);
    if (error) {
      errors.push(error);
    }
  }

  return errors;
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPassword = (password: string): boolean => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
}; 