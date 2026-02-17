import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useNotificationStore = defineStore('notifications', () => {
  const notifications = ref([])
  const toasts = ref([])

  const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length)

  function addNotification(notification) {
    notifications.value.unshift({
      id: Date.now(),
      timestamp: new Date(),
      read: false,
      ...notification,
    })
  }

  function markRead(id) {
    const notification = notifications.value.find((n) => n.id === id)
    if (notification) {
      notification.read = true
    }
  }

  function markAllRead() {
    notifications.value.forEach((n) => (n.read = true))
  }

  function addToast(message, type = 'info', timeout = 3000) {
    const id = Date.now() + Math.random()
    toasts.value.push({ id, message, type })
    if (timeout) {
      setTimeout(() => removeToast(id), timeout)
    }
  }

  function removeToast(id) {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index !== -1) {
      toasts.value.splice(index, 1)
    }
  }

  return {
    notifications,
    toasts,
    unreadCount,
    addNotification,
    markRead,
    markAllRead,
    addToast,
    removeToast,
  }
})
