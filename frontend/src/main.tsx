import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { App } from '@/App'
import './index.css'

// Thème sombre selon le réglage du système.
const sombre = window.matchMedia('(prefers-color-scheme: dark)')
const appliquerTheme = () => document.documentElement.classList.toggle('dark', sombre.matches)
appliquerTheme()
sombre.addEventListener('change', appliquerTheme)

const requetes = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={requetes}>
      <TooltipProvider>
        <App />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
)
