// Seven Waves ERP — Delivery Service
import { supabase } from 'src/boot/supabase'
import type { DeliveryOrder, Rider, RpcResult, UUID } from 'src/types/erp.types'
import type { RealtimeChannel } from '@supabase/supabase-js'

export async function assignRider(deliveryId: UUID, riderId: UUID): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('del_assign_rider', { p_delivery_id: deliveryId, p_rider_id: riderId })
  if (error) return { success: false, error: error.message }
  return data as RpcResult
}

export async function updateDeliveryStatus(deliveryId: UUID, status: string, lat?: number, lng?: number): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('del_update_status', {
    p_delivery_id: deliveryId, p_status: status, p_lat: lat || null, p_lng: lng || null,
  })
  if (error) return { success: false, error: error.message }
  return data as RpcResult
}

export async function getDeliveryOrders(branchId: UUID, status?: string): Promise<DeliveryOrder[]> {
  let query = supabase.from('delivery_orders').select('*, orders(total_amount, status), riders(name, phone), customers(first_name, last_name)')
    .eq('branch_id', branchId).is('deleted_at', null).order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data } = await query
  return (data || []) as unknown as DeliveryOrder[]
}

export async function getAvailableRiders(branchId: UUID): Promise<Rider[]> {
  const { data } = await supabase.from('riders').select('*').eq('branch_id', branchId).eq('status', 'online').is('deleted_at', null)
  return (data || []) as Rider[]
}

export async function getDeliveryPerformance(branchId: UUID) {
  const { data } = await supabase.from('v_delivery_performance').select('*').eq('branch_id', branchId)
  return data || []
}

export function subscribeToDeliveries(branchId: UUID, onUpdate: (payload: unknown) => void): RealtimeChannel {
  return supabase.channel(`deliveries:${branchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders', filter: `branch_id=eq.${branchId}` }, onUpdate)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'delivery_tracking' }, onUpdate)
    .subscribe()
}
