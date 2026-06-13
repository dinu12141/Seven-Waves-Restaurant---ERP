// ═══════════════════════════════════════════════════════════════════
// Seven Waves ERP — Kitchen/KDS Service (ApiClient edition)
// ═══════════════════════════════════════════════════════════════════

import { api } from 'src/core/api/ApiClient'
import type { KotTicket, KitchenStation, RpcResult, UUID } from 'src/types/erp.types'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from 'src/boot/supabase'

const MODULE = 'kitchen'

// ─── KOT Dispatch ───────────────────────────────────────────────

export async function dispatchKot(orderId: UUID): Promise<RpcResult<{ kots_created: number }>> {
  const { data, error } = await api.rpc('kds_dispatch_kot', {
    p_order_id: orderId,
  }, { module: MODULE, action: 'dispatchKot', retries: 1 })
  if (error) return { success: false, error: error.userMessage }
  return data as RpcResult
}

export async function updateKotItemStatus(kotItemId: UUID, status: string): Promise<RpcResult<{ all_ready: boolean }>> {
  const { data, error } = await api.rpc('kds_update_item', {
    p_kot_item_id: kotItemId,
    p_status: status,
  }, { module: MODULE, action: 'updateKotItemStatus', retries: 0 })
  if (error) return { success: false, error: error.userMessage }
  return data as RpcResult
}

export async function markOrderServed(orderId: UUID): Promise<RpcResult> {
  const { data, error } = await api.rpc('kds_mark_served', {
    p_order_id: orderId,
  }, { module: MODULE, action: 'markOrderServed', retries: 0 })
  if (error) return { success: false, error: error.userMessage }
  return data as RpcResult
}

// ─── KOT Queries ────────────────────────────────────────────────

export async function getKotTickets(kitchenId: UUID, status?: string): Promise<KotTicket[]> {
  const { data } = await api.query(
    (client) => {
      let q = client
        .from('kot_tickets')
        .select('*, kot_items(*, order_items:order_item_id(name, quantity, notes))')
        .eq('kitchen_id', kitchenId)
        .order('created_at', { ascending: true })
      if (status) q = q.eq('status', status)
      return q
    },
    { module: MODULE, action: 'getKotTickets', silent: true },
  )
  return (data || []) as unknown as KotTicket[]
}

export async function getActiveKots(kitchenId: UUID): Promise<KotTicket[]> {
  const { data } = await api.query(
    (client) => client
      .from('kot_tickets')
      .select('*, kot_items(*)')
      .eq('kitchen_id', kitchenId)
      .in('status', ['pending', 'accepted', 'cooking'])
      .order('created_at', { ascending: true }),
    { module: MODULE, action: 'getActiveKots', silent: true },
  )
  return (data || []) as unknown as KotTicket[]
}

// ─── Stations ───────────────────────────────────────────────────

export async function getKitchenStations(kitchenId: UUID): Promise<KitchenStation[]> {
  const { data } = await api.query(
    (client) => client
      .from('kitchen_stations')
      .select('*')
      .eq('kitchen_id', kitchenId)
      .eq('is_active', true)
      .is('deleted_at', null),
    { module: MODULE, action: 'getKitchenStations', silent: true },
  )
  return (data || []) as KitchenStation[]
}

// ─── Realtime ───────────────────────────────────────────────────
// Note: Realtime subscriptions use supabase directly (not ApiClient) since
// the RealtimeEngine in core manages channels separately.

export function subscribeToKitchen(kitchenId: UUID, onUpdate: (payload: unknown) => void): RealtimeChannel {
  return supabase
    .channel(`kitchen:${kitchenId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kot_tickets', filter: `kitchen_id=eq.${kitchenId}` }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kot_items' }, onUpdate)
    .subscribe()
}

export function subscribeToOrders(branchId: UUID, onUpdate: (payload: unknown) => void): RealtimeChannel {
  return supabase
    .channel(`orders:${branchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` }, onUpdate)
    .subscribe()
}
