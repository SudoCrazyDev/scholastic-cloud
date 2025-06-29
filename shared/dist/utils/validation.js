"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidPassword = exports.isValidEmail = exports.validateForm = exports.validateField = void 0;
const validateField = (value, fieldName, rules) => {
    // Required validation
    if (rules.required && (!value || value.toString().trim() === '')) {
        return {
            field: fieldName,
            message: `${fieldName} is required`,
            rule: 'required',
        };
    }
    if (!value)
        return null;
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
    if (rules.email && !(0, exports.isValidEmail)(value)) {
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
exports.validateField = validateField;
const validateForm = (data, schema) => {
    const errors = [];
    for (const [fieldName, rules] of Object.entries(schema)) {
        const error = (0, exports.validateField)(data[fieldName], fieldName, rules);
        if (error) {
            errors.push(error);
        }
    }
    return errors;
};
exports.validateForm = validateForm;
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
exports.isValidEmail = isValidEmail;
const isValidPassword = (password) => {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
};
exports.isValidPassword = isValidPassword;
