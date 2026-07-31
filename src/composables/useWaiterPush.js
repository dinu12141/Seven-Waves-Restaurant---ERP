/**
 * useWaiterPush.js
 * Manages Web Push Notification registration for the Waiter PWA.
 * Uses the waiter-push-notify Supabase Edge Function for VAPID key fetching
 * and subscription storage.
 */
import { ref } from 'vue'

const EDGE_FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/waiter-push-notify`

/** Reactive permission state */
const pushPermission = ref(
  typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
)
const pushSubscribed = ref(false)
const pushLoading = ref(false)
const pushError = ref(null)

/**
 * Fetch the VAPID public key from the edge function.
 */
async function fetchVapidKey() {
  const res = await fetch(`${EDGE_FN_BASE}/vapid-key`)
  if (!res.ok) throw new Error('Could not fetch VAPID key')
  const { vapid_public_key } = await res.json()
  return vapid_public_key
}

/**
 * Convert base64url to Uint8Array (required for PushManager.subscribe)
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i)
  }
  return output
}

/**
 * Register the waiter service worker.
 *
 * IMPORTANT: scoped to /waiter-app/ (not '/'), because Quasar's PWA build
 * (quasar.config.js, workboxMode: 'GenerateSW') auto-registers its own
 * Workbox-generated service worker at the root scope with skipWaiting +
 * clientsClaim. Two service workers cannot both control the same scope —
 * registering this one at '/' would have it fight the Workbox SW for control,
 * silently breaking push delivery after the Workbox SW reclaims the page on
 * its next activation. A narrower scope lets both coexist: Workbox still
 * handles precaching/offline for the whole app, and this SW exclusively
 * handles push/notificationclick for waiter-app routes.
 */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('Service Worker not supported')
  const reg = await navigator.serviceWorker.register('/waiter-sw.js', { scope: '/waiter-app/' })
  await navigator.serviceWorker.ready
  return reg
}

/**
 * Main function: request permission, register SW, subscribe to Web Push,
 * then save the subscription to Supabase via Edge Function.
 */
async function subscribePush(userId) {
  pushLoading.value = true
  pushError.value = null

  try {
    // 1. Check browser support
    if (!('Notification' in window) || !('PushManager' in window)) {
      throw new Error('Push notifications not supported in this browser')
    }

    // 2. Request permission
    if (Notification.permission === 'denied') {
      throw new Error('Push notifications are blocked. Enable them in browser settings.')
    }

    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission()
      pushPermission.value = permission
      if (permission !== 'granted') {
        throw new Error('Push notification permission denied')
      }
    }

    // 3. Register service worker
    const swReg = await registerServiceWorker()

    // 4. Fetch VAPID public key
    const vapidPublicKey = await fetchVapidKey()
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)

    // 5. Subscribe to push
    let subscription = await swReg.pushManager.getSubscription()
    if (!subscription) {
      subscription = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })
    }

    // 6. Save subscription to Supabase via Edge Function
    const deviceName = `${navigator.platform || 'Browser'} — ${new Date().toLocaleDateString()}`
    const res = await fetch(`${EDGE_FN_BASE}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        subscription: subscription.toJSON(),
        device_name: deviceName,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to save push subscription')
    }

    pushSubscribed.value = true
    lastSubscribedUserId = userId
    return { success: true }
  } catch (err) {
    pushError.value = err.message
    console.warn('[WaiterPush] subscribePush error:', err.message)
    return { success: false, error: err.message }
  } finally {
    pushLoading.value = false
  }
}

/**
 * Persist a subscription object (already created by the service worker,
 * e.g. from a pushsubscriptionchange event) to the backend directly, without
 * re-requesting permission or re-registering the SW.
 */
async function saveSubscription(userId, subscription) {
  if (!userId || !subscription) return
  try {
    const deviceName = `${navigator.platform || 'Browser'} — ${new Date().toLocaleDateString()}`
    await fetch(`${EDGE_FN_BASE}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, subscription, device_name: deviceName }),
    })
  } catch (err) {
    console.warn('[WaiterPush] saveSubscription error:', err.message)
  }
}

// Remember which user we last subscribed as, so an automatic
// pushsubscriptionchange re-subscribe (fired by the service worker when the
// browser rotates/expires the push endpoint) can be persisted without the
// waiter having to manually re-enable notifications.
let lastSubscribedUserId = null

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED' && lastSubscribedUserId) {
      saveSubscription(lastSubscribedUserId, event.data.subscription)
    }
  })
}

/**
 * Unsubscribe from Web Push and remove from DB.
 */
async function unsubscribePush() {
  try {
    if (!('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.ready
    const subscription = await reg.pushManager.getSubscription()
    if (subscription) {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      // Mark subscription as inactive via the edge function (service-role write —
      // push_subscriptions has no client-side DELETE/UPDATE-by-endpoint policy
      // since RLS scopes rows by user_id, and the endpoint is what we know here).
      await fetch(`${EDGE_FN_BASE}/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {})
    }
    pushSubscribed.value = false
  } catch (err) {
    console.warn('[WaiterPush] unsubscribePush error:', err.message)
  }
}

/**
 * Check if we already have an active subscription.
 */
async function checkExistingSubscription(userId = null) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const reg = await navigator.serviceWorker.ready
    const subscription = await reg.pushManager.getSubscription()
    pushSubscribed.value = !!subscription
    pushPermission.value = Notification.permission
    if (subscription && userId) lastSubscribedUserId = userId
  } catch {
    /* ignore */
  }
}

export function useWaiterPush() {
  return {
    pushPermission,
    pushSubscribed,
    pushLoading,
    pushError,
    subscribePush,
    unsubscribePush,
    checkExistingSubscription,
  }
}
