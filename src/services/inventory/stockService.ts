// ═══════════════════════════════════════════════════════════════════
// Seven Waves ERP — Inventory Service (ApiClient edition)
// ═══════════════════════════════════════════════════════════════════

import { api } from 'src/core/api/ApiClient'
import type { StockLevel, StockLedgerEntry, StockAdjustPayload, RpcResult, UUID } from 'src/types/erp.types'

const MODULE = 'inventory'

// ─── Stock Adjustments ──────────────────────────────────────────

export async function adjustStock(payload: StockAdjustPayload): Promise<RpcResult<{ previous_qty: number; new_qty: number }>> {
  const { data, error } = await api.rpc('inv_stock_adjust', {
    p_branch_id: payload.branch_id,
    p_ingredient_id: payload.ingredient_id,
    p_quantity: payload.quantity,
    p_reason: payload.reason,
    p_movement_type: payload.movement_type || 'adjustment',
    p_unit_cost: payload.unit_cost || null,
    p_batch_no: payload.batch_no || null,
    p_notes: payload.notes || null,
  }, { module: MODULE, action: 'adjustStock', retries: 0 })
  if (error) return { success: false, error: error.userMessage }
  return data as RpcResult<{ previous_qty: number; new_qty: number }>
}

export async function bomDeduct(branchId: UUID, orderId: UUID): Promise<RpcResult<{ deductions: number }>> {
  const { data, error } = await api.rpc('inv_bom_deduct', {
    p_branch_id: branchId,
    p_order_id: orderId,
  }, { module: MODULE, action: 'bomDeduct', retries: 1 })
  if (error) return { success: false, error: error.userMessage }
  return data as RpcResult<{ deductions: number }>
}

export async function transferStock(fromBranch: UUID, toBranch: UUID, ingredientId: UUID, quantity: number, notes?: string): Promise<RpcResult> {
  const { data, error } = await api.rpc('inv_stock_transfer', {
    p_from_branch: fromBranch,
    p_to_branch: toBranch,
    p_ingredient_id: ingredientId,
    p_quantity: quantity,
    p_notes: notes || null,
  }, { module: MODULE, action: 'transferStock', retries: 0 })
  if (error) return { success: false, error: error.userMessage }
  return data as RpcResult
}

// ─── Queries ────────────────────────────────────────────────────

export async function getStockOnHand(branchId: UUID): Promise<Array<StockLevel & { ingredient_name: string; stock_status: string }>> {
  const { data } = await api.query(
    (client) => client.from('v_stock_on_hand').select('*').eq('branch_id', branchId),
    { module: MODULE, action: 'getStockOnHand', silent: true },
  )
  return (data || []) as Array<StockLevel & { ingredient_name: string; stock_status: string }>
}

export async function getStockLedger(branchId: UUID, ingredientId?: UUID, limit = 100): Promise<StockLedgerEntry[]> {
  const { data } = await api.query(
    (client) => {
      let q = client.from('v_inventory_ledger').select('*').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(limit)
      if (ingredientId) q = q.eq('ingredient_id', ingredientId)
      return q
    },
    { module: MODULE, action: 'getStockLedger', silent: true },
  )
  return (data || []) as StockLedgerEntry[]
}

export async function getLowStockItems(branchId: UUID): Promise<Array<StockLevel & { ingredient_name: string }>> {
  const { data } = await api.query(
    (client) => client.from('v_stock_on_hand').select('*').eq('branch_id', branchId).in('stock_status', ['low', 'out_of_stock']),
    { module: MODULE, action: 'getLowStockItems', silent: true },
  )
  return (data || []) as Array<StockLevel & { ingredient_name: string }>
}

export async function getWastageReport(branchId: UUID, startDate: string, endDate: string) {
  const { data } = await api.query(
    (client) => client.from('v_wastage_report').select('*').eq('branch_id', branchId).gte('wastage_date', startDate).lte('wastage_date', endDate),
    { module: MODULE, action: 'getWastageReport', silent: true },
  )
  return data || []
}
