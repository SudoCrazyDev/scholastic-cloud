"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORAGE_KEYS = exports.SUCCESS_MESSAGES = exports.ERROR_MESSAGES = exports.EMAIL_MAX_LENGTH = exports.NAME_MAX_LENGTH = exports.PASSWORD_MAX_LENGTH = exports.PASSWORD_MIN_LENGTH = exports.REFRESH_TOKEN_EXPIRY = exports.TOKEN_EXPIRY = exports.ALLOWED_FILE_TYPES = exports.MAX_FILE_SIZE = exports.MAX_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = exports.API_TIMEOUT = exports.API_BASE_URL = exports.APP_VERSION = exports.APP_NAME = void 0;
// Application constants
exports.APP_NAME = 'ScholasticCloud';
exports.APP_VERSION = '1.0.0';
// API constants
exports.API_BASE_URL = 'http://localhost:3333';
exports.API_TIMEOUT = 10000; // 10 seconds
// Pagination constants
exports.DEFAULT_PAGE_SIZE = 10;
exports.MAX_PAGE_SIZE = 100;
// File upload constants
exports.MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
exports.ALLOWED_FILE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'text/plain',
];
// Authentication constants
exports.TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
exports.REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
// Validation constants
exports.PASSWORD_MIN_LENGTH = 8;
exports.PASSWORD_MAX_LENGTH = 128;
exports.NAME_MAX_LENGTH = 50;
exports.EMAIL_MAX_LENGTH = 255;
// Error messages
exports.ERROR_MESSAGES = {
    REQUIRED_FIELD: 'This field is required',
    INVALID_EMAIL: 'Please enter a valid email address',
    INVALID_PASSWORD: 'Password must be at least 8 characters with uppercase, lowercase, and number',
    PASSWORDS_DONT_MATCH: 'Passwords do not match',
    FILE_TOO_LARGE: 'File size must be less than 10MB',
    INVALID_FILE_TYPE: 'File type not allowed',
    NETWORK_ERROR: 'Network error. Please try again.',
    UNAUTHORIZED: 'You are not authorized to perform this action',
    NOT_FOUND: 'Resource not found',
    SERVER_ERROR: 'Internal server error. Please try again later.',
};
// Success messages
exports.SUCCESS_MESSAGES = {
    LOGIN_SUCCESS: 'Login successful',
    REGISTER_SUCCESS: 'Registration successful',
    LOGOUT_SUCCESS: 'Logout successful',
    PROFILE_UPDATED: 'Profile updated successfully',
    PASSWORD_CHANGED: 'Password changed successfully',
    FILE_UPLOADED: 'File uploaded successfully',
};
// Local storage keys
exports.STORAGE_KEYS = {
    AUTH_TOKEN: 'auth_token',
    REFRESH_TOKEN: 'refresh_token',
    USER_DATA: 'user_data',
    THEME: 'theme',
    LANGUAGE: 'language',
};
