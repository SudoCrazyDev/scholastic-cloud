import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

document.title = import.meta.env.VITE_APP_TITLE ?? 'Scholastic Cloud'

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
