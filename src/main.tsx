import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './themes/ThemeProvider.tsx'
import { isNativeAndroid } from './platform/nativeRuntime.ts'
import { IndexedDbDataRepository } from './data/local/IndexedDbDataRepository.ts'
import { migrateLegacyEvents } from './data/migrations/unifyTrackables.ts'

async function start(): Promise<void> {
  await migrateLegacyEvents(new IndexedDbDataRepository())
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </ThemeProvider>
  </StrictMode>,
  )
}

void start().catch((error: unknown) => {
  const root = document.getElementById('root')
  if (root) root.textContent = error instanceof Error ? `Trace could not safely upgrade your local data: ${error.message}` : 'Trace could not safely upgrade your local data.'
})

if (import.meta.env.PROD && !isNativeAndroid() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href)
  })
}
