// ═══════════════════════════════════════════════════════════════════
// CHANNEL REGISTRY — Declarative Channel Definitions
// Seven Waves ERP — Step 03D Realtime Infrastructure
// ═══════════════════════════════════════════════════════════════════
//
// Every realtime channel is declared here. No ad-hoc subscriptions.
// The RealtimeManager uses this registry to subscribe, validate, and
// route events to the correct Pinia stores.
// ═══════════════════════════════════════════════════════════════════

export type ChannelScope = 'branch' | 'user' | 'kitchen' | 'global'

export interface ChannelDefinition {
  /** Unique key template — {branchId} / {userId} / {kitchenId} replaced at runtime */
  key: string
  /** Supabase table to watch */
  table: string
  /** postgres_changes event filter (INSERT, UPDATE, DELETE, *) */
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
  /** ERP module this channel belongs to */
  module: string
  /** Required permission to subscribe */
  permission: string
  /** Scope determines which ID is used in the filter */
  scope: ChannelScope
  /** Column used for scope filter (e.g., 'branch_id', 'user_id') */
  filterColumn: string
  /** Whether to auto-reconnect on disconnect */
  reconnect: boolean
  /** Max reconnect attempts (0 = infinite) */
  maxReconnectAttempts: number
  /** Whether to reject events older than X seconds */
  rejectStaleSeconds: number
  /** Whether this channel needs sound alerts */
  soundAlert?: boolean
}

/**
 * Master channel registry — every realtime subscription is declared here.
 */
export const CHANNEL_REGISTRY: Record<string, ChannelDefinition> = {
  // ── POS ──────────────────────────────────────────────────────────
  'orders': {
    key: 'orders:{branchId}',
    table: 'orders',
    event: '*',
    module: 'pos',
    permission: 'pos.order.create',
    scope: 'branch',
    filterColumn: 'branch_id',
    reconnect: true,
    maxReconnectAttempts: 0, // infinite
    rejectStaleSeconds: 300, // 5 min
  },
  'payments': {
    key: 'payments:{branchId}',
    table: 'payments',
    event: '*',
    module: 'pos',
    permission: 'pos.order.create',
    scope: 'branch',
    filterColumn: 'branch_id',
    reconnect: true,
    maxReconnectAttempts: 0,
    rejectStaleSeconds: 300,
  },
  'cashier_sessions': {
    key: 'cashier:{branchId}',
    table: 'cashier_sessions',
    event: '*',
    module: 'pos',
    permission: 'pos.session.open',
    scope: 'branch',
    filterColumn: 'branch_id',
    reconnect: true,
    maxReconnectAttempts: 0,
    rejectStaleSeconds: 600,
  },

  // ── Kitchen / KDS ────────────────────────────────────────────────
  'kot_tickets': {
    key: 'kitchen:{branchId}',
    table: 'kot_tickets',
    event: '*',
    module: 'kitchen',
    permission: 'kitchen.view',
    scope: 'branch',
    filterColumn: 'branch_id',
    reconnect: true,
    maxReconnectAttempts: 0,
    rejectStaleSeconds: 180, // 3 min
    soundAlert: true,
  },
  'kot_items': {
    key: 'kot-items:{branchId}',
    table: 'kot_items',
    event: 'UPDATE',
    module: 'kitchen',
    permission: 'kitchen.view',
    scope: 'branch',
    filterColumn: 'branch_id',
    reconnect: true,
    maxReconnectAttempts: 0,
    rejectStaleSeconds: 180,
  },

  // ── Tables ───────────────────────────────────────────────────────
  'tables': {
    key: 'tables:{branchId}',
    table: 'restaurant_tables',
    event: '*',
    module: 'operations',
    permission: 'operations.view',
    scope: 'branch',
    filterColumn: 'branch_id',
    reconnect: true,
    maxReconnectAttempts: 10,
    rejectStaleSeconds: 60,
  },
  'table_sessions': {
    key: 'table-sessions:{branchId}',
    table: 'table_sessions',
    event: '*',
    module: 'operations',
    permission: 'operations.view',
    scope: 'branch',
    filterColumn: 'branch_id',
    reconnect: true,
    maxReconnectAttempts: 10,
    rejectStaleSeconds: 120,
  },

  // ── Inventory ────────────────────────────────────────────────────
  'stock_levels': {
    key: 'stock:{branchId}',
    table: 'stock_levels',
    event: 'UPDATE',
    module: 'inventory',
    permission: 'inventory.view',
    scope: 'branch',
    filterColumn: 'branch_id',
    reconnect: true,
    maxReconnectAttempts: 5,
    rejectStaleSeconds: 600,
  },

  // ── Notifications ────────────────────────────────────────────────
  'notifications': {
    key: 'notifications:{userId}',
    table: 'notifications',
    event: 'INSERT',
    module: 'notifications',
    permission: 'dashboard.view',
    scope: 'user',
    filterColumn: 'user_id',
    reconnect: true,
    maxReconnectAttempts: 0,
    rejectStaleSeconds: 0, // never reject
    soundAlert: true,
  },

  // ── Delivery ─────────────────────────────────────────────────────
  'delivery_orders': {
    key: 'delivery:{branchId}',
    table: 'delivery_orders',
    event: '*',
    module: 'delivery',
    permission: 'delivery.view',
    scope: 'branch',
    filterColumn: 'branch_id',
    reconnect: true,
    maxReconnectAttempts: 10,
    rejectStaleSeconds: 300,
  },

  // ── Audit ────────────────────────────────────────────────────────
  'audit_logs': {
    key: 'audit:{branchId}',
    table: 'audit_logs',
    event: 'INSERT',
    module: 'admin',
    permission: 'admin.audit.view',
    scope: 'branch',
    filterColumn: 'branch_id',
    reconnect: true,
    maxReconnectAttempts: 5,
    rejectStaleSeconds: 0,
  },
}

/**
 * Resolve a channel key by replacing scope placeholders.
 */
export function resolveChannelKey(
  def: ChannelDefinition,
  ids: { branchId?: string; userId?: string; kitchenId?: string },
): string {
  return def.key
    .replace('{branchId}', ids.branchId || 'unknown')
    .replace('{userId}', ids.userId || 'unknown')
    .replace('{kitchenId}', ids.kitchenId || 'unknown')
}

/**
 * Build the Supabase filter string for a channel definition.
 */
export function buildFilter(
  def: ChannelDefinition,
  ids: { branchId?: string; userId?: string; kitchenId?: string },
): string | undefined {
  switch (def.scope) {
    case 'branch': return ids.branchId ? `${def.filterColumn}=eq.${ids.branchId}` : undefined
    case 'user': return ids.userId ? `${def.filterColumn}=eq.${ids.userId}` : undefined
    case 'kitchen': return ids.kitchenId ? `${def.filterColumn}=eq.${ids.kitchenId}` : undefined
    case 'global': return undefined
  }
}
