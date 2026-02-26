import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'

export const useNotificationStore = defineStore('notifications', () => {
  // ── State ──────────────────────────────────────────────────────────────────
  const notifications = ref([])
  const loading = ref(false)
  const initialized = ref(false)
  const toasts = ref([])

  let realtimeChannel = null
  let currentUserId = null

  // ── Getters ────────────────────────────────────────────────────────────────
  const unreadCount = computed(() => notifications.value.filter((n) => !n.is_read).length)
  const unreadNotifications = computed(() => notifications.value.filter((n) => !n.is_read))
  const readNotifications = computed(() => notifications.value.filter((n) => n.is_read))

  // ── Actions: Initialize ────────────────────────────────────────────────────

  async function initialize(userId) {
    if (initialized.value && currentUserId === userId) return
    currentUserId = userId
    if (!userId) return

    await fetchNotifications()
    subscribeRealtime(userId)
    initialized.value = true
  }

  // ── Actions: Fetch ─────────────────────────────────────────────────────────

  async function fetchNotifications() {
    if (!currentUserId) return
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      notifications.value = data ?? []
    } catch (e) {
      console.error('[Notifications] Fetch failed:', e)
    } finally {
      loading.value = false
    }
  }

  // ── Actions: Mark Read ─────────────────────────────────────────────────────

  async function markRead(id) {
    // Optimistic update
    const notif = notifications.value.find((n) => n.id === id)
    if (notif && !notif.is_read) {
      notif.is_read = true
      notif.read_at = new Date().toISOString()

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)

      if (error) {
        // Rollback
        notif.is_read = false
        notif.read_at = null
        console.error('[Notifications] markRead failed:', error)
      }
    }
  }

  async function markAllRead() {
    const unread = notifications.value.filter((n) => !n.is_read)
    if (unread.length === 0) return

    // Optimistic
    const now = new Date().toISOString()
    unread.forEach((n) => {
      n.is_read = true
      n.read_at = now
    })

    const ids = unread.map((n) => n.id)
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: now })
      .in('id', ids)

    if (error) {
      // Rollback
      unread.forEach((n) => {
        n.is_read = false
        n.read_at = null
      })
      console.error('[Notifications] markAllRead failed:', error)
    }
  }

  // ── Actions: Delete ────────────────────────────────────────────────────────

  async function deleteNotification(id) {
    const idx = notifications.value.findIndex((n) => n.id === id)
    if (idx === -1) return

    const removed = notifications.value.splice(idx, 1)[0]

    const { error } = await supabase.from('notifications').delete().eq('id', id)
    if (error) {
      // Rollback
      notifications.value.splice(idx, 0, removed)
      console.error('[Notifications] delete failed:', error)
    }
  }

  async function clearAll() {
    if (notifications.value.length === 0) return

    const backup = [...notifications.value]
    notifications.value = []

    const { error } = await supabase.from('notifications').delete().eq('user_id', currentUserId)

    if (error) {
      notifications.value = backup
      console.error('[Notifications] clearAll failed:', error)
    }
  }

  // ── Actions: Realtime ──────────────────────────────────────────────────────

  function subscribeRealtime(userId) {
    unsubscribeRealtime()

    realtimeChannel = supabase
      .channel('notifications:' + userId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Prepend new notification
          notifications.value.unshift(payload.new)

          // Fire a toast for the new notification
          addToast(payload.new.title, getToastType(payload.new.type), 4000)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const idx = notifications.value.findIndex((n) => n.id === payload.new.id)
          if (idx !== -1) {
            notifications.value[idx] = { ...notifications.value[idx], ...payload.new }
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          notifications.value = notifications.value.filter((n) => n.id !== payload.old.id)
        },
      )
      .subscribe((status) => {
        console.log('[Notifications] Realtime status:', status)
      })
  }

  function unsubscribeRealtime() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

  // ── Actions: Push Token (FCM) ──────────────────────────────────────────────

  async function registerPushToken(token, platform = 'web', deviceInfo = null) {
    if (!currentUserId) return

    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: currentUserId,
        token,
        platform,
        device_info: deviceInfo,
        is_active: true,
      },
      { onConflict: 'token' },
    )

    if (error) {
      console.error('[Notifications] Push token registration failed:', error)
    }
  }

  async function removePushToken(token) {
    const { error } = await supabase.from('push_tokens').delete().eq('token', token)

    if (error) {
      console.error('[Notifications] Push token removal failed:', error)
    }
  }

  // ── Actions: Toast (in-memory ephemeral) ───────────────────────────────────

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

  // ── Actions: Add local notification (backward-compat) ─────────────────────

  function addNotification(notification) {
    // For components that still call the old API — insert into DB
    if (currentUserId) {
      supabase
        .from('notifications')
        .insert({
          user_id: currentUserId,
          branch_id: notification.branch_id || null,
          type: notification.type || 'info',
          title: notification.title || 'Notification',
          message: notification.message || '',
          icon: notification.icon || 'info',
          color: notification.color || 'blue',
          action_url: notification.action_url || null,
          ref_type: notification.ref_type || null,
          ref_id: notification.ref_id || null,
        })
        .then(({ error }) => {
          if (error) console.error('[Notifications] Insert failed:', error)
        })
    } else {
      // Fallback: in-memory only
      notifications.value.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        created_at: new Date().toISOString(),
        is_read: false,
        ...notification,
      })
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getToastType(notifType) {
    switch (notifType) {
      case 'order_new':
        return 'info'
      case 'order_accepted':
        return 'positive'
      case 'kitchen_ready':
        return 'positive'
      case 'payment_complete':
        return 'positive'
      case 'warning':
        return 'warning'
      case 'alert':
        return 'negative'
      default:
        return 'info'
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  function cleanup() {
    unsubscribeRealtime()
    notifications.value = []
    initialized.value = false
    currentUserId = null
  }

  return {
    // State
    notifications,
    loading,
    initialized,
    toasts,
    // Getters
    unreadCount,
    unreadNotifications,
    readNotifications,
    // Actions
    initialize,
    fetchNotifications,
    markRead,
    markAllRead,
    deleteNotification,
    clearAll,
    addNotification,
    addToast,
    removeToast,
    registerPushToken,
    removePushToken,
    cleanup,
  }
})
