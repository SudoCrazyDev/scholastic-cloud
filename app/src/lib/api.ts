import axios from 'axios';
import { queryClient } from '../providers/QueryProvider';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token and handle FormData
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // If the data is FormData, remove Content-Type header to let axios set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Unattended kiosk pages. Nothing on these may navigate to the login screen:
 * they run on a wall-mounted terminal with no keyboard and nobody watching, and
 * `kiosk.sh` respawning Chromium would not recover it — the browser is alive,
 * it is just showing a login form where a gate used to be.
 *
 * It happens without this guard: `useAuthState` refreshes the profile on every
 * page, kiosk pages included, so one stale `auth_token` left in the device's
 * Chromium profile (a technician who signed in once) turns the gate into a
 * login screen at the next boot. The kiosk's own device-token calls do not go
 * through this client at all — see `pages/Gate/offline/client.ts`.
 */
const KIOSK_PATHS = ['/gate-enter', '/gate-exit'];

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect if we're not already on the login page
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && !KIOSK_PATHS.includes(currentPath)) {
        // Clear auth data and redirect to login
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        
        // Clear all cached queries
        queryClient.clear();
        
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
); 