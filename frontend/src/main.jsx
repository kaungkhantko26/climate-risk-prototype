import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}notification-sw.js?v=20260321`, {
      scope: import.meta.env.BASE_URL,
    }).catch(() => null)
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
