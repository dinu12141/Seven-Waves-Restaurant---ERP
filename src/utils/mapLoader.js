/**
 * Singleton Google Maps loader.
 * Loads the API once with places + geometry libraries.
 * Re-used by DeliveryMapPage and GoogleMapTracker.
 */
let _promise = null

export function loadGoogleMaps(apiKey) {
  // Already loaded with places
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google.maps)
  }

  // Script already in DOM — wait for it
  if (_promise) return _promise

  _promise = new Promise((resolve, reject) => {
    // If Maps is partially loaded (no places), just wait-poll
    if (window.google?.maps) {
      const poll = () => {
        if (window.google?.maps?.places) return resolve(window.google.maps)
        setTimeout(poll, 100)
      }
      return poll()
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`
    script.async = true
    script.defer = true
    script.onload = () => resolve(window.google.maps)
    script.onerror = () => {
      _promise = null
      reject(new Error('Google Maps failed to load'))
    }
    document.head.appendChild(script)
  })

  return _promise
}
