// Seven Waves ERP — Report Service (Centralized Reporting)
import { supabase } from 'src/boot/supabase'
import type { UUID } from 'src/types/erp.types'

interface DateRange { startDate: string; endDate: string }

export async function getDailySales(branchId: UUID, range: DateRange) {
  const { data } = await supabase.from('v_daily_sales').select('*').eq('branch_id', branchId)
    .gte('sale_date', range.startDate).lte('sale_date', range.endDate).order('sale_date', { ascending: false })
  return data || []
}

export async function getItemSales(branchId: UUID, range: DateRange) {
  const { data } = await supabase.from('v_item_sales').select('*').eq('branch_id', branchId)
    .gte('sale_date', range.startDate).lte('sale_date', range.endDate).order('revenue', { ascending: false })
  return data || []
}

export async function getPaymentSummary(branchId: UUID, range: DateRange) {
  const { data } = await supabase.from('v_payment_summary').select('*').eq('branch_id', branchId)
    .gte('payment_date', range.startDate).lte('payment_date', range.endDate)
  return data || []
}

export async function getCashierSummary(branchId: UUID) {
  const { data } = await supabase.from('v_cashier_summary').select('*').eq('branch_id', branchId).order('opened_at', { ascending: false }).limit(20)
  return data || []
}

export async function getKotReport(branchId: UUID) {
  const { data } = await supabase.from('v_kot_report').select('*').eq('branch_id', branchId).order('kot_created', { ascending: false }).limit(100)
  return data || []
}

export async function getStockOnHand(branchId: UUID) {
  const { data } = await supabase.from('v_stock_on_hand').select('*').eq('branch_id', branchId).order('ingredient_name')
  return data || []
}

export async function getInventoryLedger(branchId: UUID, ingredientId?: UUID) {
  let q = supabase.from('v_inventory_ledger').select('*').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(200)
  if (ingredientId) q = q.eq('ingredient_id', ingredientId)
  const { data } = await q
  return data || []
}

export async function getWastageReport(branchId: UUID, range: DateRange) {
  const { data } = await supabase.from('v_wastage_report').select('*').eq('branch_id', branchId)
    .gte('wastage_date', range.startDate).lte('wastage_date', range.endDate)
  return data || []
}

export async function getPayrollSummary(branchId: UUID) {
  const { data } = await supabase.from('v_payroll_summary').select('*').eq('branch_id', branchId).order('period_start', { ascending: false })
  return data || []
}

export async function getTrialBalance() {
  const { data } = await supabase.from('v_trial_balance_summary').select('*')
  return data || []
}

export async function getDeliveryPerformance(branchId: UUID) {
  const { data } = await supabase.from('v_delivery_performance').select('*').eq('branch_id', branchId)
  return data || []
}

export async function getAuditReport(branchId?: UUID, limit = 200) {
  let q = supabase.from('v_audit_report').select('*').order('created_at', { ascending: false }).limit(limit)
  if (branchId) q = q.eq('branch_id', branchId)
  const { data } = await q
  return data || []
}

export async function getCustomerAnalytics(branchId: UUID) {
  const { data } = await supabase.from('v_customer_analytics').select('*').eq('branch_id', branchId).order('total_spent', { ascending: false })
  return data || []
}
