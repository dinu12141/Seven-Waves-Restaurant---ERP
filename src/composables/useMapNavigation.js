/**
 * useMapNavigation — Helpers for map routing, turn-by-turn directions, and external navigation
 */

/**
 * Open Google Maps navigation from current location to destination.
 */
export function openGoogleMapsNavigation(destLat, destLng) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`
  window.open(url, '_blank')
}

/**
 * Open Apple Maps navigation (iOS fallback).
 */
export function openAppleMapsNavigation(destLat, destLng) {
  const url = `https://maps.apple.com/?daddr=${destLat},${destLng}&dirflg=d`
  window.open(url, '_blank')
}

/**
 * Open the best available navigation app.
 */
export function openNavigation(destLat, destLng) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (isIOS) {
    openAppleMapsNavigation(destLat, destLng)
  } else {
    openGoogleMapsNavigation(destLat, destLng)
  }
}

/**
 * Fetch route from OSRM (free open-source routing).
 * Returns polyline coordinates and route summary.
 *
 * @param {[number, number]} start - [lng, lat] of origin
 * @param {[number, number]} end - [lng, lat] of destination
 * @returns {Promise<{ coordinates: [number, number][], distance: number, duration: number } | null>}
 */
export async function fetchOSRMRoute(start, end) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`
    const response = await fetch(url)
    const data = await response.json()

    if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
      console.warn('[MapNav] OSRM returned no routes:', data)
      return null
    }

    const route = data.routes[0]
    return {
      coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distance: route.distance,
      duration: route.duration,
    }
  } catch (err) {
    console.error('[MapNav] OSRM fetch error:', err)
    return null
  }
}

/**
 * Fetch route WITH turn-by-turn steps from OSRM.
 * steps=true tells OSRM to return maneuver instructions.
 *
 * @param {[number, number]} start - [lng, lat]
 * @param {[number, number]} end   - [lng, lat]
 * @returns {Promise<{ coordinates, distance, duration, steps: NavStep[] } | null>}
 */
export async function fetchOSRMRouteWithSteps(start, end) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson&steps=true`
    const response = await fetch(url)
    const data = await response.json()

    if (data.code !== 'Ok' || !data.routes?.length) return null

    const route = data.routes[0]
    const rawSteps = route.legs[0]?.steps || []

    const steps = rawSteps
      .filter((s) => s.maneuver && s.distance > 0)
      .map((s) => ({
        instruction: buildInstruction(s),
        distance: s.distance,
        duration: s.duration,
        name: s.name || '',
        maneuverType: s.maneuver.type,
        maneuverModifier: s.maneuver.modifier || '',
        location: s.maneuver.location, // [lng, lat]
      }))

    return {
      coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distance: route.distance,
      duration: route.duration,
      steps,
    }
  } catch (err) {
    console.error('[MapNav] OSRM steps fetch error:', err)
    return null
  }
}

/**
 * Build human-readable instruction from an OSRM step.
 */
function buildInstruction(step) {
  const type = step.maneuver.type
  const modifier = step.maneuver.modifier || ''
  const name = step.name || ''
  const ref = step.ref || ''
  const roadPart = name || ref || 'the road'

  const modifierMap = {
    left: 'Turn left',
    right: 'Turn right',
    'sharp left': 'Sharp left',
    'sharp right': 'Sharp right',
    'slight left': 'Bear left',
    'slight right': 'Bear right',
    straight: 'Continue straight',
    uturn: 'Make a U-turn',
  }

  if (type === 'depart') return `Head ${modifier || 'forward'} on ${roadPart}`
  if (type === 'arrive') return `Arrive at destination`
  if (type === 'turn') return `${modifierMap[modifier] || 'Turn'} onto ${roadPart}`
  if (type === 'new name') return `Continue onto ${roadPart}`
  if (type === 'merge') return `Merge onto ${roadPart}`
  if (type === 'fork') return `Take the ${modifier || ''} fork onto ${roadPart}`
  if (type === 'roundabout') return `Enter roundabout, exit onto ${roadPart}`
  if (type === 'rotary') return `Enter rotary, exit onto ${roadPart}`
  if (type === 'end of road') return `${modifierMap[modifier] || 'Turn'} onto ${roadPart}`
  if (type === 'continue') return `Continue ${modifier || ''} on ${roadPart}`

  return `${modifierMap[modifier] || 'Continue'} on ${roadPart}`
}

/**
 * Get a maneuver icon name based on the OSRM maneuver type/modifier.
 */
export function getManeuverIcon(type, modifier) {
  if (type === 'arrive') return 'flag'
  if (type === 'depart') return 'navigation'
  if (type === 'roundabout' || type === 'rotary') return 'sync'
  if (modifier === 'left' || modifier === 'sharp left') return 'turn_left'
  if (modifier === 'right' || modifier === 'sharp right') return 'turn_right'
  if (modifier === 'slight left') return 'turn_slight_left'
  if (modifier === 'slight right') return 'turn_slight_right'
  if (modifier === 'uturn') return 'u_turn_left'
  if (modifier === 'straight') return 'straight'
  return 'arrow_upward'
}

/**
 * Find the current step index based on rider location.
 * Returns the index of the step the rider is closest to.
 */
export function findCurrentStep(steps, riderLat, riderLng) {
  if (!steps.length) return 0
  let minDist = Infinity
  let minIdx = 0
  steps.forEach((step, i) => {
    if (!step.location) return
    const [lng, lat] = step.location
    const d = haversineDistance(riderLat, riderLng, lat, lng)
    if (d < minDist) {
      minDist = d
      minIdx = i
    }
  })
  return minIdx
}

/**
 * Calculate haversine distance in meters between two points.
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Format distance in meters to a human-readable string.
 */
export function formatDistance(meters) {
  if (!meters && meters !== 0) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

/**
 * Format duration in seconds to a human-readable string.
 */
export function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return `${hrs}h ${rem}m`
}
