import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startPointerTracking } from './lib/pointer'
import { ThemeProvider } from './theme/ThemeProvider'
import './index.css'

startPointerTracking()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
