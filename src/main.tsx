import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './themes/ThemeProvider.tsx'
import { isNativeAndroid } from './platform/nativeRuntime.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </ThemeProvider>
  </StrictMode>,
)

if (import.meta.env.PROD && !isNativeAndroid() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href)
  })
}
