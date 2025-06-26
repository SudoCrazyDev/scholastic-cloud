# ScholasticCloud Frontend Documentation

## Overview

The ScholasticCloud frontend is built with React 18.x, TypeScript, and Vite. It uses modern React patterns including hooks, context, and functional components.

## Tech Stack

- **React 18.x** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **TanStack Query** - Server state management
- **Axios** - HTTP client
- **Formik** - Form management
- **TailwindCSS** - Styling
- **React Hot Toast** - Notifications

## Project Structure

```
app/src/
├── components/          # Reusable UI components
│   ├── Layout.tsx      # Main layout wrapper
│   ├── Navbar.tsx      # Navigation bar
│   ├── Sidebar.tsx     # Sidebar navigation
│   └── LoadingSpinner.tsx
├── pages/              # Page components
│   ├── Home.tsx        # Landing page
│   ├── Login.tsx       # Login page
│   ├── Register.tsx    # Registration page
│   ├── Dashboard.tsx   # User dashboard
│   └── Profile.tsx     # User profile
├── hooks/              # Custom React hooks
├── services/           # API service functions
├── utils/              # Utility functions
├── types/              # TypeScript type definitions
├── styles/             # Global styles
├── App.tsx             # Main app component
└── main.tsx            # Entry point
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Navigate to the app directory:
   ```bash
   cd app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5173`.

## Key Features

### Authentication

The app uses JWT tokens for authentication. Tokens are stored in localStorage and automatically included in API requests.

### State Management

- **TanStack Query**: Manages server state (API data)
- **React Context**: Manages global app state (auth, theme, etc.)
- **Local State**: Component-specific state with useState

### Routing

React Router is used for client-side routing with the following routes:
- `/` - Home page
- `/login` - Login page
- `/register` - Registration page
- `/dashboard` - User dashboard (protected)
- `/profile` - User profile (protected)

### Styling

TailwindCSS is used for styling with custom components defined in `src/index.css`. The design system includes:
- Color palette (primary, secondary)
- Typography (Inter font)
- Component classes (btn, card, input)

### Forms

Formik is used for form management with Yup for validation. Forms include:
- Login form
- Registration form
- Profile update form

## Development

### Code Style

- Use TypeScript for all components
- Follow React best practices
- Use functional components with hooks
- Implement proper error handling
- Add loading states for better UX

### Testing

Run tests with:
```bash
npm test
```

### Building for Production

Build the application:
```bash
npm run build
```

The built files will be in the `dist` directory.

## Environment Variables

Create a `.env` file in the app directory:

```env
VITE_API_BASE_URL=http://localhost:3333
VITE_APP_NAME=ScholasticCloud
```

## Deployment

The application can be deployed to any static hosting service:
- Vercel
- Netlify
- AWS S3
- GitHub Pages

Make sure to set the correct environment variables for production. 