// Seven Waves ERP — Notification Service (Centralized)
import { supabase } from 'src/boot/supabase'
import type { Notification, RpcResult, UUID } from 'src/types/erp.types'
import type { RealtimeChannel } from '@supabase/supabase-js'

export async function getNotifications(limit = 50): Promise<Notification[]> {
  const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit)
  return (data || []) as Notification[]
}

export async function getUnreadCount(): Promise<number> {
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false)
  return count || 0
}

export async function markRead(ids: UUID[]): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('notify_mark_read', { p_ids: ids })
  if (error) return { success: false, error: error.message }
  return data as RpcResult
}

export async function markAllRead(): Promise<RpcResult> {
  const { error } = await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('is_read', false)
  return error ? { success: false, error: error.message } : { success: true }
}

export function subscribeToNotifications(userId: UUID, onNew: (notification: Notification) => void): RealtimeChannel {
  return supabase.channel(`notifications:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onNew(payload.new as Notification))
    .subscribe()
}
