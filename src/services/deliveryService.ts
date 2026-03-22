/**
 * deliveryService.ts
 * ─────────────────────────────────────────────────────────────────
 * Delivery Management Service Layer
 *
 * Wraps all Supabase RPC calls and queries for the delivery rider system.
 * All state mutations go through SECURITY DEFINER RPCs.
 */

import { supabase } from 'src/boot/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeliveryAssignment {
  id: string
  order_id: string
  rider_id: string | null
  branch_id: string
  status: 'pending_rider' | 'accepted' | 'picked_up' | 'delivered' | 'cancelled'
  customer_name: string | null
  customer_phone: string | null
  delivery_address: string | null
  delivery_notes: string | null
  estimated_minutes: number
  assigned_at: string
  accepted_at: string | null
  picked_up_at: string | null
  delivered_at: string | null
  created_at: string
  updated_at: string
  // Joined data
  order?: {
    order_number: number
    order_type: string
    order_source: string
    status: string
    total_amount: number
    customer_name: string | null
    notes: string | null
    created_at: string
  }
  order_items?: {
    id: string
    quantity: number
    unit_price: number
    total_price: number
    notes: string | null
    menu_items: { name: string; image_url?: string } | null
  }[]
  rider?: {
    full_name: string
  } | null
}

export interface DeliveryRpcResult {
  success: boolean
  error?: string
  assignment_id?: string
  order_id?: string
  status?: string
  message?: string
}

// ─── Fetch Delivery Queue ─────────────────────────────────────────────────────

/**
 * Fetch all delivery assignments for a branch, with joined order data.
 * Used by the Delivery Dashboard and Manager views.
 */
export async function fetchDeliveryQueue(
  branchId: string,
  statuses: string[] = ['pending_rider', 'accepted', 'picked_up'],
): Promise<DeliveryAssignment[]> {
  const { data, error } = await supabase
    .from('delivery_assignments')
    .select(
      `
      id, order_id, rider_id, branch_id, status,
      customer_name, customer_phone, delivery_address, delivery_notes,
      estimated_minutes, assigned_at, accepted_at, picked_up_at, delivered_at,
      created_at, updated_at,
      order:orders!inner (
        order_number, order_type, order_source, status, total_amount,
        customer_name, notes, created_at
      ),
      rider:profiles!delivery_assignments_rider_id_fkey ( full_name )
    `,
    )
    .eq('branch_id', branchId)
    .in('status', statuses)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[DeliveryService] fetchDeliveryQueue error:', error)
    return []
  }

  return (data || []) as unknown as DeliveryAssignment[]
}

/**
 * Fetch a single delivery assignment with full order details.
 */
export async function fetchDeliveryDetail(assignmentId: string): Promise<DeliveryAssignment | null> {
  const { data, error } = await supabase
    .from('delivery_assignments')
    .select(
      `
      id, order_id, rider_id, branch_id, status,
      customer_name, customer_phone, delivery_address, delivery_notes,
      estimated_minutes, assigned_at, accepted_at, picked_up_at, delivered_at,
      created_at, updated_at,
      order:orders!inner (
        order_number, order_type, order_source, status, total_amount,
        customer_name, notes, created_at,
        order_items (
          id, quantity, unit_price, total_price, notes,
          menu_items ( name, image_url )
        ),
        kot_tickets ( id, status, kitchen_id )
      ),
      rider:profiles!delivery_assignments_rider_id_fkey ( full_name )
    `,
    )
    .eq('id', assignmentId)
    .single()

  if (error || !data) {
    console.error('[DeliveryService] fetchDeliveryDetail error:', error)
    return null
  }

  return data as unknown as DeliveryAssignment
}

/**
 * Fetch completed deliveries for history view.
 */
export async function fetchDeliveryHistory(
  branchId: string,
  riderId?: string,
  limit = 50,
): Promise<DeliveryAssignment[]> {
  let query = supabase
    .from('delivery_assignments')
    .select(
      `
      id, order_id, rider_id, branch_id, status,
      customer_name, delivery_address, estimated_minutes,
      assigned_at, accepted_at, picked_up_at, delivered_at,
      created_at, updated_at,
      order:orders!inner (
        order_number, order_type, total_amount, customer_name, created_at
      ),
      rider:profiles!delivery_assignments_rider_id_fkey ( full_name )
    `,
    )
    .eq('branch_id', branchId)
    .eq('status', 'delivered')
    .order('delivered_at', { ascending: false })
    .limit(limit)

  if (riderId) {
    query = query.eq('rider_id', riderId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[DeliveryService] fetchDeliveryHistory error:', error)
    return []
  }

  return (data || []) as unknown as DeliveryAssignment[]
}

// ─── Rider Actions ────────────────────────────────────────────────────────────

/**
 * Accept a pending delivery assignment.
 */
export async function acceptDelivery(assignmentId: string): Promise<DeliveryRpcResult> {
  const { data, error } = await supabase.rpc('rider_accept_delivery', {
    p_assignment_id: assignmentId,
  })

  if (error) {
    console.error('[DeliveryService] acceptDelivery RPC error:', error)
    return { success: false, error: error.message }
  }

  return data as DeliveryRpcResult
}

/**
 * Mark food picked up from kitchen.
 */
export async function markPickedUp(assignmentId: string): Promise<DeliveryRpcResult> {
  const { data, error } = await supabase.rpc('rider_mark_picked_up', {
    p_assignment_id: assignmentId,
  })

  if (error) {
    console.error('[DeliveryService] markPickedUp RPC error:', error)
    return { success: false, error: error.message }
  }

  return data as DeliveryRpcResult
}

/**
 * Mark delivery as completed.
 */
export async function markDelivered(assignmentId: string): Promise<DeliveryRpcResult> {
  const { data, error } = await supabase.rpc('rider_mark_delivered', {
    p_assignment_id: assignmentId,
  })

  if (error) {
    console.error('[DeliveryService] markDelivered RPC error:', error)
    return { success: false, error: error.message }
  }

  return data as DeliveryRpcResult
}

// ─── Realtime Subscription ────────────────────────────────────────────────────

/**
 * Subscribe to real-time delivery assignment changes for a branch.
 * Returns the channel for cleanup.
 */
export function subscribeToDeliveryAssignments(
  branchId: string,
  onUpdate: (payload: unknown) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`delivery-assignments-${branchId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'delivery_assignments',
        filter: `branch_id=eq.${branchId}`,
      },
      (payload) => {
        onUpdate(payload)
      },
    )
    .subscribe()

  return channel
}

/**
 * Subscribe to order status changes for delivery tracking.
 * Useful for riders to know when food is ready.
 */
export function subscribeToDeliveryOrders(
  branchId: string,
  onUpdate: (payload: unknown) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`delivery-orders-${branchId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `branch_id=eq.${branchId}`,
      },
      (payload) => {
        onUpdate(payload)
      },
    )
    .subscribe()

  return channel
}
