# Routing and Authentication System

This document describes the routing and authentication system implemented in the ScholasticCloud frontend application.

## Overview

The application uses React Router DOM for routing and TanStack Query for API state management. The authentication system is built with a context-based approach that persists user data in localStorage.

## Architecture

### Providers

1. **QueryProvider**: Wraps the app with TanStack Query for API state management
2. **AuthProvider**: Manages authentication state and provides auth context

### Layouts

1. **PublicLayout**: Used for unauthenticated routes (login, register)
2. **PrivateLayout**: Used for authenticated routes with automatic redirect to login
3. **DashboardLayout**: Simple layout for authenticated pages with header and logout

### Routes

- `/` - Redirects to `/login`
- `/login` - Login page (public)
- `/dashboard` - Dashboard page (private)
- `/*` - Catch-all route, redirects to `/login`

## Authentication Flow

1. User visits `/login`
2. User submits credentials
3. API call is made using TanStack Query mutation
4. On success, user data is stored in localStorage and auth context
5. User is redirected to `/dashboard`
6. Private routes check authentication status and redirect if not authenticated

## API Integration

### Auth Service

The `authService` handles all authentication-related API calls:

- `login(credentials)` - Authenticates user
- `logout()` - Logs out user
- `getProfile()` - Gets user profile

### TanStack Query Hooks

- `useLogin()` - Login mutation
- `useLogout()` - Logout mutation
- `useProfile()` - Profile query

## Environment Configuration

Set the following environment variable:

```env
VITE_API_URL=http://localhost:3333
```

## Usage

### Using Authentication in Components

```tsx
import { useAuth } from '../hooks/useAuth';

const MyComponent = () => {
  const { user, isAuthenticated, login, logout } = useAuth();
  
  // Access user data
  console.log(user?.first_name, user?.last_name);
  
  // Check authentication status
  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }
};
```

### Using API Mutations

```tsx
import { useLogin } from '../hooks/useAuthQueries';

const LoginComponent = () => {
  const loginMutation = useLogin();
  
  const handleLogin = async (credentials) => {
    try {
      const result = await loginMutation.mutateAsync(credentials);
      // Handle success
    } catch (error) {
      // Handle error
    }
  };
};
```

## File Structure

```
src/
├── components/
│   └── layouts/
│       ├── PublicLayout.tsx
│       ├── PrivateLayout.tsx
│       └── DashboardLayout.tsx
├── hooks/
│   ├── useAuth.ts
│   └── useAuthQueries.ts
├── providers/
│   ├── AuthProvider.tsx
│   └── QueryProvider.tsx
├── services/
│   └── authService.ts
├── lib/
│   └── api.ts
└── pages/
    ├── Login.tsx
    └── Dashboard.tsx
```

## Security Features

- Automatic token injection in API requests
- Automatic redirect on 401 responses
- Protected routes with authentication checks
- Secure token storage in localStorage
- Automatic cleanup on logout 