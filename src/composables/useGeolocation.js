import { ref, onUnmounted } from 'vue'

/**
 * useGeolocation — Vue composable for GPS location tracking
 * Uses navigator.geolocation watchPosition for live updates.
 */
export function useGeolocation(options = {}) {
  const coords = ref(null) // { latitude, longitude, accuracy, heading, speed }
  const error = ref(null)
  const isTracking = ref(false)
  const permissionState = ref('prompt') // 'granted' | 'denied' | 'prompt'

  let watchId = null

  const defaultOptions = {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 15000,
    ...options,
  }

  // Check permission state
  async function checkPermission() {
    try {
      if (navigator.permissions) {
        const result = await navigator.permissions.query({ name: 'geolocation' })
        permissionState.value = result.state
        result.addEventListener('change', () => {
          permissionState.value = result.state
        })
      }
    } catch {
      // Permissions API not supported — assume prompt
      permissionState.value = 'prompt'
    }
  }

  function startTracking() {
    if (!navigator.geolocation) {
      error.value = { code: 0, message: 'Geolocation not supported by this browser.' }
      return
    }

    if (watchId !== null) return // Already tracking

    isTracking.value = true
    error.value = null

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        coords.value = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp,
        }
        error.value = null
        permissionState.value = 'granted'
      },
      (err) => {
        error.value = { code: err.code, message: err.message }
        if (err.code === 1) permissionState.value = 'denied'
      },
      defaultOptions,
    )
  }

  function stopTracking() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    isTracking.value = false
  }

  // Get a single position (one-shot)
  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'))
        return
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const c = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          }
          coords.value = c
          permissionState.value = 'granted'
          resolve(c)
        },
        (err) => {
          error.value = { code: err.code, message: err.message }
          if (err.code === 1) permissionState.value = 'denied'
          reject(err)
        },
        defaultOptions,
      )
    })
  }

  onUnmounted(() => {
    stopTracking()
  })

  checkPermission()

  return {
    coords,
    error,
    isTracking,
    permissionState,
    startTracking,
    stopTracking,
    getCurrentPosition,
  }
}
