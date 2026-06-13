// Seven Waves ERP — CRM & Loyalty Service
import { supabase } from 'src/boot/supabase'
import type { Customer, LoyaltyAccount, RpcResult, UUID } from 'src/types/erp.types'

export async function earnPoints(customerId: UUID, orderId: UUID, amountPaid: number): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('crm_earn_points', { p_customer_id: customerId, p_order_id: orderId, p_amount_paid: amountPaid })
  if (error) return { success: false, error: error.message }
  return data as RpcResult
}

export async function redeemPoints(customerId: UUID, points: number, orderId?: UUID): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('crm_redeem_points', { p_customer_id: customerId, p_points: points, p_order_id: orderId || null })
  if (error) return { success: false, error: error.message }
  return data as RpcResult
}

export async function getCustomers(branchId: UUID, search?: string): Promise<Customer[]> {
  let query = supabase.from('customers').select('*').eq('branch_id', branchId).is('deleted_at', null).order('first_name').limit(100)
  if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
  const { data } = await query
  return (data || []) as Customer[]
}

export async function getLoyaltyAccount(customerId: UUID): Promise<LoyaltyAccount | null> {
  const { data } = await supabase.from('loyalty_accounts').select('*').eq('customer_id', customerId).is('deleted_at', null).maybeSingle()
  return data as LoyaltyAccount | null
}

export async function getCustomerAnalytics(branchId: UUID) {
  const { data } = await supabase.from('v_customer_analytics').select('*').eq('branch_id', branchId).order('total_spent', { ascending: false }).limit(50)
  return data || []
}

export async function submitFeedback(payload: { company_id: UUID; branch_id: UUID; customer_id?: UUID; rating: number; comment?: string; feedback_source?: string }) {
  const { error } = await supabase.from('customer_feedback').insert(payload)
  return error ? { success: false, error: error.message } : { success: true }
}
