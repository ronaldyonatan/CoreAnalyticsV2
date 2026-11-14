import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import MarketingEntry from './marketing/MarketingEntry.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MarketingEntry />
  </StrictMode>,
)
