/* global clients */
// Seven Waves Waiter App — Service Worker
// Handles Web Push Notifications for the Waiter PWA

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Seven Waves', body: event.data.text() }
  }

  const title = payload.title || '🔔 Seven Waves'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/favicon-128x128.png',
    badge: '/icons/favicon-128x128.png',
    vibrate: [200, 100, 200, 100, 200],
    data: payload.data || {},
    tag: payload.data?.order_id || 'waiter-notif',
    renotify: true,
    requireInteraction: payload.data?.new_status === 'pending_waiter' || payload.data?.new_status === 'ready',
    actions: [
      { action: 'view', title: 'View', icon: '/icons/favicon-128x128.png' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  const data = event.notification.data || {}
  let targetUrl = '/waiter-app'

  if (data.new_status === 'pending_waiter') {
    targetUrl = '/waiter-app/inbox'
  } else if (data.new_status === 'ready') {
    targetUrl = '/waiter-app/alerts'
  } else if (data.order_id) {
    targetUrl = '/waiter-app/orders'
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes('/waiter-app') && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    }),
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  // Re-subscribe when subscription expires
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true })
      .then((subscription) => {
        // Post message to the app to re-register
        return clients.matchAll({ type: 'window' }).then((clientList) => {
          clientList.forEach((client) => {
            client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: subscription.toJSON() })
          })
        })
      }),
  )
})
