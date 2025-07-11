# ScholasticCloud Project Structure

## Overview

This is a monorepo containing a full-stack SaaS application with shared types and utilities. The project is organized to maximize code reuse and maintainability.

## Directory Structure

```
ScholasticCloud/
├── README.md                    # Project overview and setup instructions
├── PROJECT_STRUCTURE.md         # This file - detailed structure documentation
├── docs/                        # Documentation
│   ├── API.md                   # API documentation
│   └── FRONTEND.md              # Frontend documentation
├── scripts/                     # Build and setup scripts
│   ├── setup.sh                 # Unix/Linux setup script
│   └── setup.ps1                # Windows PowerShell setup script
├── shared/                      # Shared types and utilities
│   ├── package.json             # Shared package configuration
│   ├── tsconfig.json            # TypeScript configuration
│   └── src/                     # Source code
│       ├── index.ts             # Main export file
│       ├── types/               # TypeScript type definitions
│       │   ├── user.ts          # User-related types
│       │   ├── auth.ts          # Authentication types
│       │   ├── common.ts        # Common interfaces
│       │   └── api.ts           # API-specific types
│       └── utils/               # Utility functions
│           ├── validation.ts    # Validation utilities
│           └── constants.ts     # Application constants
├── api/                         # AdonisJS API server
│   ├── package.json             # API dependencies
│   ├── tsconfig.json            # TypeScript configuration
│   ├── env.example              # Environment variables template
│   └── [AdonisJS structure]     # Will be generated by AdonisJS
└── app/                         # React frontend application
    ├── package.json             # Frontend dependencies
    ├── tsconfig.json            # TypeScript configuration
    ├── tsconfig.node.json       # Node.js TypeScript config
    ├── vite.config.ts           # Vite configuration
    ├── tailwind.config.js       # TailwindCSS configuration
    ├── postcss.config.js        # PostCSS configuration
    ├── index.html               # HTML entry point
    └── src/                     # React source code
        ├── main.tsx             # Application entry point
        ├── App.tsx              # Main App component
        ├── index.css            # Global styles
        ├── components/          # Reusable components
        │   ├── Layout.tsx       # Main layout wrapper
        │   ├── Navbar.tsx       # Navigation bar
        │   ├── Sidebar.tsx      # Sidebar navigation
        │   └── LoadingSpinner.tsx
        └── pages/               # Page components
            ├── Home.tsx         # Landing page
            ├── Login.tsx        # Login page
            ├── Register.tsx     # Registration page
            ├── Dashboard.tsx    # User dashboard
            └── Profile.tsx      # User profile
```

## Key Design Decisions

### 1. Monorepo Structure

**Benefits:**
- Shared types between frontend and backend
- Single repository for easier version control
- Consistent development environment
- Simplified deployment pipeline

### 2. Shared Package

**Purpose:**
- Centralized type definitions
- Common validation utilities
- Shared constants and configurations
- Reusable business logic

**Structure:**
- `types/` - TypeScript interfaces and types
- `utils/` - Utility functions and constants
- Built as a separate package for reusability

### 3. API Structure (AdonisJS)

**Features:**
- RESTful API with JWT authentication
- PostgreSQL database with Lucid ORM
- Input validation and sanitization
- Rate limiting and CORS configuration
- File upload handling
- Email functionality

**Planned Structure:**
```
api/
├── app/
│   ├── Controllers/             # API controllers
│   ├── Models/                  # Database models
│   ├── Middleware/              # Custom middleware
│   ├── Validators/              # Input validation
│   └── Services/                # Business logic
├── database/
│   ├── migrations/              # Database migrations
│   └── seeders/                 # Database seeders
├── config/                      # Configuration files
└── routes/                      # API routes
```

### 4. Frontend Structure (React + Vite)

**Features:**
- Modern React with TypeScript
- Vite for fast development and building
- TanStack Query for server state management
- React Router for client-side routing
- TailwindCSS for styling
- Formik for form management

**Planned Structure:**
```
app/src/
├── components/                  # Reusable UI components
├── pages/                      # Page components
├── hooks/                      # Custom React hooks
├── services/                   # API service functions
├── utils/                      # Utility functions
├── types/                      # TypeScript type definitions
├── context/                    # React context providers
└── styles/                     # Global styles
```

## Development Workflow

### 1. Initial Setup

1. Clone the repository
2. Run the setup script:
   ```bash
   # Unix/Linux/macOS
   chmod +x scripts/setup.sh
   ./scripts/setup.sh
   
   # Windows
   .\scripts\setup.ps1
   ```

### 2. Development

1. **Start the API server:**
   ```bash
   cd api
   npm run dev
   ```

2. **Start the frontend server:**
   ```bash
   cd app
   npm run dev
   ```

3. **Build shared package (if needed):**
   ```bash
   cd shared
   npm run build
   ```

### 3. Type Sharing

The shared package is linked to both API and APP using file dependencies:

```json
{
  "dependencies": {
    "@scholasticcloud/shared": "file:../shared"
  }
}
```

This allows both applications to import shared types:

```typescript
// In API or APP
import { User, LoginRequest, ApiResponse } from '@scholasticcloud/shared'
```

## Deployment Strategy

### 1. Development
- API: `http://localhost:3333`
- APP: `http://localhost:5173`

### 2. Production
- API: Deploy to cloud platform (Heroku, AWS, etc.)
- APP: Deploy to static hosting (Vercel, Netlify, etc.)
- Database: Managed PostgreSQL service

### 3. Environment Variables

**API (.env):**
```env
NODE_ENV=production
PORT=3333
DB_CONNECTION=pg
PG_HOST=your-db-host
PG_USER=your-db-user
PG_PASSWORD=your-db-password
PG_DB_NAME=scholasticcloud
JWT_SECRET=your-jwt-secret
```

**APP (.env):**
```env
VITE_API_BASE_URL=https://api.scholasticcloud.com
VITE_APP_NAME=ScholasticCloud
```

## Best Practices

### 1. Type Safety
- Use TypeScript throughout the project
- Share types between frontend and backend
- Validate API responses with shared types

### 2. Code Organization
- Keep components small and focused
- Use consistent naming conventions
- Separate concerns (UI, business logic, data)

### 3. Error Handling
- Implement proper error boundaries in React
- Use consistent error response format in API
- Log errors appropriately

### 4. Security
- Validate all inputs
- Implement proper authentication
- Use HTTPS in production
- Sanitize user data

### 5. Performance
- Lazy load components and routes
- Optimize bundle size
- Use proper caching strategies
- Implement pagination for large datasets

## Future Enhancements

1. **Testing**
   - Unit tests for shared utilities
   - Integration tests for API endpoints
   - Component tests for React components

2. **CI/CD**
   - Automated testing pipeline
   - Automated deployment
   - Code quality checks

3. **Monitoring**
   - Error tracking (Sentry)
   - Performance monitoring
   - User analytics

4. **Features**
   - Real-time notifications
   - File upload functionality
   - Advanced search and filtering
   - Export functionality 