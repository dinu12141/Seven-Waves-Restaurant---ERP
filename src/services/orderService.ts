import { supabase } from 'src/boot/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CartItem {
  menu_item_id: string
  name: string
  unit_price: number
  qty: number
  notes?: string
  variant_id?: string | null
}

export interface PlaceOrderResult {
  success: boolean
  error?: string
  order_id?: string
  table_id?: string
  branch_id?: string
  subtotal?: number
  status?: string
  order_source?: string
}

export interface OrderStatus {
  id: string
  status: string
  order_number: number
  total_amount: number
  customer_name?: string
  table_id?: string
  created_at: string
  updated_at: string
  kot_tickets?: KotTicket[]
  order_items?: OrderItem[]
}

export interface KotTicket {
  id: string
  status: string
  kitchen_id: string
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  menu_item_id: string
  quantity: number
  unit_price: number
  total_price: number
  status: string
  notes?: string
  // Supabase returns array for nested select; take [0] in template
  menu_items?: { name: string; image_url?: string }[] | { name: string; image_url?: string } | null
}

// ─── Place Order ──────────────────────────────────────────────────────────────

/**
 * Places an order via the server-side RPC (session-validated, price-confirmed).
 * Optionally attaches customer_id for loyalty tracking.
 */
export async function placeCustomerOrder(
  sessionToken: string,
  items: CartItem[],
  customerId?: string | null,
  notes?: string,
): Promise<PlaceOrderResult> {
  const payload = items.map((i) => ({
    menu_item_id: i.menu_item_id,
    qty: i.qty,
    notes: i.notes || undefined,
    variant_id: i.variant_id || undefined,
  }))

  const { data, error } = await supabase.rpc('create_order_from_session', {
    p_session_token: sessionToken,
    p_items: payload,
    p_source: 'qr',
  })

  if (error) return { success: false, error: error.message }

  const result = data as PlaceOrderResult

  // If customer linked, update order with customer_id
  if (result.success && result.order_id && customerId) {
    await supabase
      .from('orders')
      .update({
        customer_id: customerId,
        notes: notes || null,
      })
      .eq('id', result.order_id)
  }

  return result
}

// ─── Get Order Status ─────────────────────────────────────────────────────────

export async function getOrderStatus(orderId: string): Promise<OrderStatus | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      `
      id, status, order_number, total_amount, customer_name,
      table_id, created_at, updated_at,
      kot_tickets(id, status, kitchen_id, created_at, updated_at),
      order_items(
        id, menu_item_id, quantity, unit_price, total_price, status, notes,
        menu_items(name, image_url)
      )
    `,
    )
    .eq('id', orderId)
    .single()

  if (error || !data) return null

  return data as unknown as OrderStatus
}

// ─── Realtime Subscription ────────────────────────────────────────────────────

/**
 * Subscribe to real-time order status changes.
 * Returns the channel for cleanup.
 */
export function subscribeToOrder(
  orderId: string,
  onUpdate: (order: Partial<OrderStatus>) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`order-tracking-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      },
      (payload) => {
        onUpdate(payload.new as Partial<OrderStatus>)
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      },
      (payload) => {
        onUpdate(payload.new as Partial<OrderStatus>)
      },
    )
    .on(
      'postgres_changes',
      {
        // KOT status changes (created → preparing → ready)
        event: 'UPDATE',
        schema: 'public',
        table: 'kot_tickets',
        filter: `order_id=eq.${orderId}`,
      },
      () => {
        // Re-fetch full order when KOT status changes (includes nested kot_tickets)
        getOrderStatus(orderId).then((order) => {
          if (order) onUpdate(order)
        })
      },
    )
    .on(
      'postgres_changes',
      {
        // New KOT tickets created (e.g. waiter accepts and generates KOT)
        event: 'INSERT',
        schema: 'public',
        table: 'kot_tickets',
        filter: `order_id=eq.${orderId}`,
      },
      () => {
        getOrderStatus(orderId).then((order) => {
          if (order) onUpdate(order)
        })
      },
    )
    .on(
      'postgres_changes',
      {
        // order_items status updates (queued → sent_to_kitchen → preparing → ready)
        event: 'UPDATE',
        schema: 'public',
        table: 'order_items',
        filter: `order_id=eq.${orderId}`,
      },
      () => {
        getOrderStatus(orderId).then((order) => {
          if (order) onUpdate(order)
        })
      },
    )
    .subscribe()

  return channel
}

/**
 * Unsubscribe from order tracking channel.
 */
export async function unsubscribeFromOrder(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel)
}

// ─── Status Helpers ───────────────────────────────────────────────────────────

export interface StatusStep {
  key: string
  label: string
  icon: string
  color: string
}

export const ORDER_STATUS_STEPS: StatusStep[] = [
  { key: 'pending_waiter', label: 'Order Received', icon: 'receipt_long', color: '#f59e0b' },
  { key: 'accepted', label: 'Accepted by Waiter', icon: 'person_check', color: '#3b82f6' },
  { key: 'preparing', label: 'Being Prepared', icon: 'local_fire_department', color: '#8b5cf6' },
  { key: 'ready', label: 'Ready to Serve', icon: 'done_all', color: '#10b981' },
  { key: 'served', label: 'Served', icon: 'restaurant', color: '#06b6d4' },
  { key: 'paid', label: 'Payment Complete', icon: 'payments', color: '#22c55e' },
]

export function getStatusIndex(status: string): number {
  return ORDER_STATUS_STEPS.findIndex((s) => s.key === status)
}

export function getStatusStep(status: string): StatusStep | undefined {
  return ORDER_STATUS_STEPS.find((s) => s.key === status)
}
