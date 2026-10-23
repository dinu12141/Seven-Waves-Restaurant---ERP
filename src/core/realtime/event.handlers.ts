// ═══════════════════════════════════════════════════════════════════
// EVENT HANDLERS — Route Realtime Events to Pinia Stores
// Seven Waves ERP — Step 03D Realtime Infrastructure
// ═══════════════════════════════════════════════════════════════════
//
// Each handler receives a RealtimeEventPayload and updates the
// corresponding Pinia store. Handlers are registered via
// realtimeManager.on('registryKey', handler).
//
// RULES:
//   1. Never call Supabase directly — stores do that
//   2. Import stores lazily (avoid circular deps)
//   3. Use defensive checks — payload.new may be null
//   4. Log critical events
// ═══════════════════════════════════════════════════════════════════

import type { RealtimeEventPayload } from './realtime.manager'
import { logger } from '../logging/logger'
import { Notify } from 'quasar'

// ─── POS Orders ─────────────────────────────────────────────────

export function handleOrderEvent(payload: RealtimeEventPayload): void {
  const record = payload.new as Record<string, unknown> | null
  const old = payload.old as Record<string, unknown> | null

  switch (payload.eventType) {
    case 'INSERT':
      logger.info('[RT:POS] New order', { id: record?.id })
      // Forward to KDS: new order may have existing KOTs if rapidly accepted
      if (record?.id) {
        _forwardOrderToKds(record.id as string)
      }
      break

    case 'UPDATE': {
      const status = record?.status as string
      const prevStatus = old?.status as string
      if (status !== prevStatus) {
        logger.info('[RT:POS] Order status changed', { id: record?.id, from: prevStatus, to: status })

        if (status === 'voided') {
          Notify.create({
            type: 'warning',
            message: `Order #${record?.id?.toString().slice(-6)} voided`,
            icon: 'cancel',
            position: 'top-right',
            timeout: 5000,
          })
        }

        // Forward to KDS store — replaces the duplicate 'orders' listener in kitchenDisplayStore.
        // P0-3: This centralises order→KDS routing here so the KDS channel doesn't need its own
        // orders subscription alongside the RealtimeManager's orders:{branchId} channel.
        if (record?.id) {
          _forwardOrderToKds(record.id as string)
        }
      }
      break
    }

    case 'DELETE':
      logger.warn('[RT:POS] Order deleted', { id: old?.id })
      break
  }
}

function _forwardOrderToKds(orderId: string): void {
  // Lazy import avoids circular dependency. If the KDS store is not mounted (user
  // is not on a kitchen screen) the import still resolves but selectedKitchenId
  // will be null and refreshTicketsForOrder will exit immediately.
  import('../../stores/kitchenDisplayStore')
    .then(({ useKitchenDisplayStore }) => {
      try {
        const kdsStore = useKitchenDisplayStore()
        if (kdsStore.selectedKitchenId) {
          kdsStore.refreshTicketsForOrder(orderId)
        }
      } catch {
        /* KDS store not initialised */
      }
    })
    .catch(() => { /* module not loaded */ })
}

// ─── Payments ───────────────────────────────────────────────────

export function handlePaymentEvent(payload: RealtimeEventPayload): void {
  const record = payload.new as Record<string, unknown> | null

  if (payload.eventType === 'INSERT') {
    const method = record?.payment_method as string
    const amount = record?.amount as number
    logger.info('[RT:POS] Payment received', { method, amount })
  }
}

// ─── Cashier Sessions ───────────────────────────────────────────

export function handleCashierEvent(payload: RealtimeEventPayload): void {
  const record = payload.new as Record<string, unknown> | null

  if (payload.eventType === 'UPDATE') {
    const status = record?.status as string
    if (status === 'closed') {
      logger.info('[RT:POS] Cashier session closed', { id: record?.id })
    }
  }
}

// ─── KDS / Kitchen ──────────────────────────────────────────────

export function handleKotTicketEvent(payload: RealtimeEventPayload): void {
  const record = payload.new as Record<string, unknown> | null
  const old = payload.old as Record<string, unknown> | null

  switch (payload.eventType) {
    case 'INSERT':
      logger.info('[RT:KDS] New KOT ticket', { id: record?.id, order_id: record?.order_id })
      // KDS sound alert handled by the KDS page component
      break

    case 'UPDATE': {
      const status = record?.status as string
      const prevStatus = old?.status as string
      if (status !== prevStatus) {
        logger.info('[RT:KDS] KOT status changed', { id: record?.id, from: prevStatus, to: status })

        if (status === 'ready') {
          Notify.create({
            type: 'positive',
            message: 'Order ready for pickup!',
            icon: 'restaurant',
            position: 'top',
            timeout: 5000,
          })
        }

        if (status === 'delayed') {
          Notify.create({
            type: 'warning',
            message: 'Kitchen order delayed!',
            icon: 'timer_off',
            position: 'top',
            timeout: 8000,
          })
        }
      }
      break
    }
  }
}

export function handleKotItemEvent(payload: RealtimeEventPayload): void {
  const record = payload.new as Record<string, unknown> | null
  if (payload.eventType === 'UPDATE') {
    logger.debug('[RT:KDS] KOT item updated', { id: record?.id, status: record?.status })
  }
}

// ─── Tables ─────────────────────────────────────────────────────

export function handleTableEvent(payload: RealtimeEventPayload): void {
  const record = payload.new as Record<string, unknown> | null
  logger.debug('[RT:Tables] Table changed', {
    id: record?.id,
    event: payload.eventType,
    status: record?.status,
  })
}

export function handleTableSessionEvent(payload: RealtimeEventPayload): void {
  const record = payload.new as Record<string, unknown> | null
  if (payload.eventType === 'INSERT') {
    logger.info('[RT:Tables] New table session', { table_id: record?.table_id })
  }
}

// ─── Inventory / Stock ──────────────────────────────────────────

export function handleStockEvent(payload: RealtimeEventPayload): void {
  const record = payload.new as Record<string, unknown> | null

  if (payload.eventType === 'UPDATE') {
    const qty = record?.quantity as number
    const name = record?.ingredient_name as string || 'Item'

    // Low stock alert
    if (typeof qty === 'number' && qty <= 0) {
      Notify.create({
        type: 'negative',
        message: `${name} is OUT OF STOCK!`,
        icon: 'inventory',
        position: 'top-right',
        timeout: 10000,
      })
      logger.warn('[RT:Inventory] Out of stock', { id: record?.id, ingredient: name })
    }
  }
}

// ─── Notifications ──────────────────────────────────────────────

export function handleNotificationEvent(payload: RealtimeEventPayload): void {
  const record = payload.new as Record<string, unknown> | null

  if (payload.eventType === 'INSERT' && record) {
    const severity = record.severity as string
    const title = record.title as string || 'New notification'

    // Critical notifications get a prominent toast
    if (severity === 'critical') {
      Notify.create({
        type: 'negative',
        message: title,
        icon: 'warning',
        position: 'top',
        timeout: 0, // Persistent
        actions: [{ label: 'Dismiss', color: 'white' }],
      })
    } else {
      Notify.create({
        type: severity === 'warning' ? 'warning' : 'info',
        message: title,
        icon: 'notifications',
        position: 'top-right',
        timeout: 5000,
      })
    }

    logger.info('[RT:Notify] New notification', { title, severity })
  }
}

// ─── Delivery ───────────────────────────────────────────────────

let lastDeliveryUpdate = 0
const DELIVERY_THROTTLE_MS = 3000

export function handleDeliveryEvent(payload: RealtimeEventPayload): void {
  const record = payload.new as Record<string, unknown> | null
  const now = Date.now()

  // Throttle rapid delivery updates (GPS location pings)
  if (payload.eventType === 'UPDATE' && now - lastDeliveryUpdate < DELIVERY_THROTTLE_MS) {
    return
  }
  lastDeliveryUpdate = now

  if (payload.eventType === 'UPDATE') {
    const status = record?.status as string
    if (status === 'delivered') {
      Notify.create({
        type: 'positive',
        message: 'Delivery completed!',
        icon: 'check_circle',
        position: 'top-right',
        timeout: 5000,
      })
    }
  }

  logger.debug('[RT:Delivery] Event', { event: payload.eventType, status: record?.status })
}

// ─── Audit ──────────────────────────────────────────────────────

export function handleAuditEvent(payload: RealtimeEventPayload): void {
  const record = payload.new as Record<string, unknown> | null

  if (payload.eventType === 'INSERT') {
    const severity = record?.severity as string
    if (severity === 'critical') {
      Notify.create({
        type: 'negative',
        message: `Security alert: ${record?.action_type}`,
        icon: 'security',
        position: 'top',
        timeout: 0,
        actions: [{ label: 'Review', color: 'white' }],
      })
      logger.error('[RT:Audit] Critical audit event', { action: record?.action_type })
    }
  }
}

// ─── Finance ────────────────────────────────────────────────────

export function handleFinanceVoucherEvent(payload: RealtimeEventPayload): void {
  logger.info('[RT:Finance] Voucher event', { event: payload.eventType })
  import('../../modules/finance/stores/finance-voucher.store')
    .then(({ useFinanceVoucherStore }) => {
      try {
        const store = useFinanceVoucherStore()
        store.fetchVouchers()
      } catch {
        /* Store not mounted */
      }
    })
    .catch(() => {
      /* Module not loaded */
    })
}

export function handleFinanceCashbookEvent(payload: RealtimeEventPayload): void {
  logger.info('[RT:Finance] Cashbook event', { event: payload.eventType })
  import('../../modules/finance/stores/finance-cashbook.store')
    .then(({ useFinanceCashbookStore }) => {
      try {
        const store = useFinanceCashbookStore()
        store.fetchEntries()
      } catch {
        /* Store not mounted */
      }
    })
    .catch(() => {
      /* Module not loaded */
    })
}

// ─── Handler Map ────────────────────────────────────────────────

/**
 * Maps registry keys to their handlers.
 * Used by the boot file to register all handlers at startup.
 */
export const EVENT_HANDLER_MAP: Record<string, (payload: RealtimeEventPayload) => void> = {
  orders: handleOrderEvent,
  payments: handlePaymentEvent,
  cashier_sessions: handleCashierEvent,
  kot_tickets: handleKotTicketEvent,
  kot_items: handleKotItemEvent,
  tables: handleTableEvent,
  table_sessions: handleTableSessionEvent,
  stock_levels: handleStockEvent,
  notifications: handleNotificationEvent,
  delivery_orders: handleDeliveryEvent,
  audit_logs: handleAuditEvent,
  finance_vouchers: handleFinanceVoucherEvent,
  finance_cashbook: handleFinanceCashbookEvent,
}
