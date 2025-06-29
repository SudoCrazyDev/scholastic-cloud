import React from 'react'; // Added React import
import { createRoot } from 'react-dom/client';
import AppRoutes from './routes';
import './index.css';
import { AuthProvider } from './contexts/AuthContext'; // Import AuthProvider
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; // Import QueryClient and Provider

const queryClient = new QueryClient(); // Create a client

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}> { /* Wrap with QueryClientProvider */ }
      <AuthProvider> { /* Wrap with AuthProvider */ }
        <AppRoutes />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
