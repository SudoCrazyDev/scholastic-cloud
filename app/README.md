# ScholasticCloud Frontend

A modern React application built with TypeScript, Vite, and Tailwind CSS.

## Features

- **Login Page**: Complete authentication flow with Formik and Yup validation
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **Animations**: Smooth animations using Framer Motion
- **API Integration**: Axios-based API client with interceptors
- **TypeScript**: Full type safety throughout the application
- **Responsive Design**: Mobile-first responsive design with Tailwind CSS

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Configure environment variables:
```env
VITE_API_URL=http://localhost:3333
```

4. Start development server:
```bash
npm run dev
```

## Project Structure

```
src/
├── api/                 # API services and configuration
│   ├── index.ts        # Axios configuration and interceptors
│   └── auth.ts         # Authentication API endpoints
├── components/         # Reusable UI components
│   └── Alert.tsx       # Enhanced alert component with animations
├── pages/             # Page components
│   └── Login.tsx      # Login page with form validation
├── types/             # TypeScript type definitions
│   └── index.ts       # Common types
├── utils/             # Utility functions
│   └── errorHandler.ts # Error handling utilities
└── App.tsx            # Main application component
```

## Path Aliases

The project uses path aliases for cleaner imports:

- `@/` - Points to `src/`
- `@components/` - Points to `src/components/`
- `@api/` - Points to `src/api/`
- `@utils/` - Points to `src/utils/`
- `@types/` - Points to `src/types/`

## Technologies Used

- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Formik** - Form management
- **Yup** - Form validation
- **Axios** - HTTP client
- **Framer Motion** - Animation library
- **React Hot Toast** - Toast notifications

## API Integration

The application includes a complete API integration setup:

- **Base Configuration**: Axios instance with base URL and timeouts
- **Request Interceptors**: Automatic token injection
- **Response Interceptors**: Error handling and token refresh
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **Type Safety**: Full TypeScript support for API responses

## Login Flow

The login page includes:

- **Form Validation**: Real-time validation with Yup schemas
- **Error Handling**: Display of API errors and validation errors
- **Loading States**: Loading indicators during API calls
- **Success Feedback**: Success messages and automatic redirects
- **Animations**: Smooth animations for better UX
- **Responsive Design**: Works on all device sizes

## Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linting
npm run lint
```
