import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

const BUILD_ID = __APP_BUILD_ID__
const AUTO_UPDATE_EVENT = 'climate-monitor:auto-update'
const AUTO_UPDATE_CHECK_MS = 60 * 1000

const emitAutoUpdateState = (detail) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AUTO_UPDATE_EVENT, { detail }))
}

const createReloadUrl = (nextBuildId) => {
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set('app-build', nextBuildId)
  return nextUrl.toString()
}

const triggerAppReload = (nextBuildId, reason = 'version') => {
  if (typeof window === 'undefined') return
  if (window.__CLIMATE_MONITOR_RELOADING__) return

  window.__CLIMATE_MONITOR_RELOADING__ = true
  emitAutoUpdateState({ updating: true, buildId: nextBuildId, reason })

  window.setTimeout(() => {
    window.location.replace(createReloadUrl(nextBuildId))
  }, 520)
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const serviceWorkerUrl = `${import.meta.env.BASE_URL}notification-sw.js?v=${encodeURIComponent(BUILD_ID)}`

    const applyWaitingWorker = (registration) => {
      if (!registration?.waiting) return false

      emitAutoUpdateState({ updating: true, buildId: BUILD_ID, reason: 'worker' })
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      return true
    }

    const attachRegistrationListeners = (registration) => {
      if (!registration) return

      if (applyWaitingWorker(registration)) {
        return
      }

      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing
        if (!installingWorker) return

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            applyWaitingWorker(registration)
          }
        })
      })
    }

    let didHandleControllerChange = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (didHandleControllerChange) return
      didHandleControllerChange = true
      triggerAppReload(BUILD_ID, 'controller')
    })

    navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: import.meta.env.BASE_URL,
    }).then((registration) => {
      attachRegistrationListeners(registration)

      const checkForAppUpdate = async () => {
        try {
          await registration.update()

          const response = await fetch(`${import.meta.env.BASE_URL}version.json?ts=${Date.now()}`, {
            cache: 'no-store',
          })
          if (!response.ok) return

          const data = await response.json()
          if (data?.build_id && data.build_id !== BUILD_ID) {
            triggerAppReload(data.build_id, 'version')
          }
        } catch {
          return
        }
      }

      void checkForAppUpdate()

      const handleFocus = () => {
        void checkForAppUpdate()
      }

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          void checkForAppUpdate()
        }
      }

      window.addEventListener('focus', handleFocus)
      document.addEventListener('visibilitychange', handleVisibilityChange)

      window.setInterval(() => {
        void checkForAppUpdate()
      }, AUTO_UPDATE_CHECK_MS)
    }).catch(() => null)
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
