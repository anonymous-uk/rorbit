import React from 'react'
import ReactDOM from 'react-dom/client'
import ROrbit from './ROrbit.jsx'

// Register service worker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ROrbit />
  </React.StrictMode>
)
