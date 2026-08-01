import { register } from 'register-service-worker'

// The ready(), registered(), cached(), updatefound() and updated()
// events passes a ServiceWorkerRegistration instance in their arguments.
// ServiceWorkerRegistration: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration

register(process.env.SERVICE_WORKER_FILE, {
  // The registrationOptions object will be passed as the second argument
  // to ServiceWorkerContainer.register()
  // https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register#Parameter

  // registrationOptions: { scope: './' },

  ready(/* registration */) {
    // console.log('Service worker is active.')
  },

  registered(/* registration */) {
    // console.log('Service worker has been registered.')
  },

  cached(/* registration */) {
    // console.log('Content has been cached for offline use.')
  },

  updatefound(/* registration */) {
    // console.log('New content is downloading.')
  },

  updated(registration) {
    // A new version has been deployed and its service worker has already
    // activated in the background (skipWaiting/clientsClaim are enabled in
    // quasar.config.js). Previously this force-reloaded immediately with no
    // warning — jarring mid-order on POS/waiter/kitchen screens. Instead,
    // surface a dismissible "Update available" prompt and let the user pick
    // when to reload. App.vue listens for this event and shows the UI.
    console.log('[PWA] New content is available.')
    window.dispatchEvent(
      new CustomEvent('sw-update-available', { detail: { registration } }),
    )
  },

  offline() {
    // console.log('No internet connection found. App is running in offline mode.')
  },

  error(/* err */) {
    // console.error('Error during service worker registration:', err)
  },
})
