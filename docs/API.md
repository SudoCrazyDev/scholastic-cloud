# ScholasticCloud API Documentation

## Overview

The ScholasticCloud API is built with AdonisJS 6.x and provides RESTful endpoints for the frontend application.

## Base URL

- Development: `http://localhost:3333`
- Production: `https://api.scholasticcloud.com`

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### Authentication

#### POST /auth/login
Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "1",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "user"
    },
    "token": "jwt-token-here",
    "refreshToken": "refresh-token-here"
  }
}
```

#### POST /auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "password": "password123",
  "confirmPassword": "password123"
}
```

#### POST /auth/logout
Logout and invalidate the current token.

#### POST /auth/refresh
Refresh the access token using a refresh token.

### Users

#### GET /users/profile
Get the current user's profile.

#### PUT /users/profile
Update the current user's profile.

#### GET /users
Get a list of users (admin only).

#### POST /users
Create a new user (admin only).

#### DELETE /users/:id
Delete a user (admin only).

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `422` - Validation Error
- `500` - Internal Server Error

## Rate Limiting

The API implements rate limiting to prevent abuse:
- 100 requests per minute for authenticated users
- 20 requests per minute for unauthenticated users

## CORS

CORS is configured to allow requests from the frontend application:
- Allowed Origin: `http://localhost:5173` (development)
- Allowed Methods: GET, POST, PUT, DELETE, PATCH
- Allowed Headers: Content-Type, Authorization 