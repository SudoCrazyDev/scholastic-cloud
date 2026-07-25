import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme } from './theme/palette'
import { resolveUserTheme } from './theme/institutionTheme'

document.title = import.meta.env.VITE_APP_TITLE ?? 'Scholastic Cloud'

// Apply the stored institution theme before first paint to avoid a color flash
// on reload. ThemeProvider keeps it in sync for the rest of the session.
try {
  const storedUser = localStorage.getItem('auth_user')
  if (storedUser) applyTheme(resolveUserTheme(JSON.parse(storedUser)))
} catch {
  // Malformed stored user — fall back to default theme.
}

if (import.meta.env.VITE_ADS === 'true') {
  const adsScript = document.createElement('script')
  adsScript.async = true
  adsScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1770945751834620'
  adsScript.crossOrigin = 'anonymous'
  document.head.appendChild(adsScript)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
