// ═══════════════════════════════════════════════════════════════════════════════
// Finance POS Shift Service — shift register + GL posting status (#145)
// ═══════════════════════════════════════════════════════════════════════════════
// GL of record for POS (server-posted, supabase/finance_pos_sales_gl_145.sql):
//   pos_sale   — one set of legs per paid order (source_id = order id)
//   pos_shift  — cash over/short variance on close (source_id = shift id)
//   pos_payout — drawer cash_out → expense (source_id = cash movement id)
// Failures are logged in pos_gl_failures; fn_pos_post_unposted_sales(p_from)
// re-posts paid orders that have no pos_sale legs yet (admin/finance only).

import { supabase } from 'src/boot/supabase'
import { fetchAllPages } from './finance-statements.service'

const IN_CHUNK = 150 // keep `in.(…)` filters well under URL length limits

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100

function chunk(list, size = IN_CHUNK) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

async function selectIn(table, columns, column, ids, extra = (q) => q) {
  const rows = []
  for (const part of chunk([...new Set(ids)].filter(Boolean))) {
    const page = await fetchAllPages(() =>
      extra(supabase.from(table).select(columns).in(column, part).order('id', { ascending: true })),
    )
    rows.push(...page)
  }
  return rows
}

/** Local calendar date (YYYY-MM-DD) → ISO instant at local start / end of day. */
export function localDayBoundsIso(dateStr, endOfDay = false) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0)
  return dt.toISOString()
}

/**
 * Tender breakdown as stored on the shift row. pos_record_shift_payment adds
 * Visa / Master payments to card_sales_total AND to their own sub-bucket, so
 * they are informational only and must not be added to the total again.
 */
export function shiftTenderBreakdown(shift) {
  const s = shift || {}
  const card = round2(s.card_sales_total)
  const visa = round2(s.visa_sales_total)
  const master = round2(s.master_sales_total)
  const t = {
    cash: round2(s.cash_sales_total),
    card,
    visa,
    master,
    qr: round2(s.qr_sales_total),
    bank: round2(s.bank_sales_total),
    credit: round2(s.credit_sales_total),
  }
  t.total = round2(t.cash + t.card + t.qr + t.bank + t.credit)
  return t
}

/**
 * Build per-shift GL status from raw rows.
 * @returns Map<shiftId, { orders, ordersPosted, ordersUnposted, saleGl, varianceGl, variancePosted,
 *   payouts, payoutsTotal, payoutsPosted, failures, status }>
 */
export function buildShiftGlStatus({ shifts, payments, movements, legs, failures }) {
  const legsBySource = new Map()
  for (const l of legs || []) {
    const key = `${l.source_type}:${l.source_id}`
    const agg = legsBySource.get(key) || { debit: 0, credit: 0 }
    agg.debit += Number(l.debit_amount) || 0
    agg.credit += Number(l.credit_amount) || 0
    legsBySource.set(key, agg)
  }
  const openFailures = (failures || []).filter((f) => !f.resolved)

  const out = new Map()
  for (const s of shifts || []) {
    const orderIds = [...new Set((payments || []).filter((p) => p.shift_id === s.id).map((p) => p.order_id).filter(Boolean))]
    const posted = orderIds.filter((id) => legsBySource.has(`pos_sale:${id}`))
    const saleGl = round2(posted.reduce((sum, id) => sum + legsBySource.get(`pos_sale:${id}`).debit, 0))

    const shiftMoves = (movements || []).filter((m) => m.shift_id === s.id)
    const payouts = shiftMoves.filter((m) => m.type === 'cash_out' && Number(m.amount) > 0)
    const payoutsPosted = payouts.filter((m) => legsBySource.has(`pos_payout:${m.id}`)).length

    const variance = round2(s.variance)
    const variancePosted = legsBySource.has(`pos_shift:${s.id}`)
    const varianceNeeded = s.status === 'closed' && variance !== 0

    const refIds = new Set([s.id, ...orderIds, ...shiftMoves.map((m) => m.id)])
    const shiftFailures = openFailures.filter((f) => refIds.has(f.ref_id))

    let status
    if (shiftFailures.length) status = 'failed'
    else if (posted.length < orderIds.length || (varianceNeeded && !variancePosted) || payoutsPosted < payouts.length) {
      status = s.status === 'closed' ? 'unposted' : 'pending'
    } else status = 'posted'

    out.set(s.id, {
      orders: orderIds.length,
      ordersPosted: posted.length,
      ordersUnposted: orderIds.length - posted.length,
      unpostedOrderIds: orderIds.filter((id) => !legsBySource.has(`pos_sale:${id}`)),
      saleGl,
      varianceNeeded,
      variancePosted,
      payouts: payouts.length,
      payoutsTotal: round2(payouts.reduce((sum, m) => sum + Number(m.amount || 0), 0)),
      payoutsPosted,
      cashIn: round2(shiftMoves.filter((m) => m.type === 'cash_in').reduce((a, m) => a + Number(m.amount || 0), 0)),
      cashDrops: round2(shiftMoves.filter((m) => m.type === 'cash_drop').reduce((a, m) => a + Number(m.amount || 0), 0)),
      failures: shiftFailures,
      status,
    })
  }
  return out
}

export const financePosShiftService = {
  async listShifts({ status = null, dateFrom = '', dateTo = '' } = {}) {
    return fetchAllPages(() => {
      let q = supabase
        .from('pos_shifts')
        .select('*, profiles:cashier_id(full_name), opened_by_user:cashier_id(full_name), closed_by_user:closed_by(full_name), branches:branch_id(name)')
        .order('opened_at', { ascending: false })
        .order('id', { ascending: true })
      if (status) q = q.eq('status', status)
      if (dateFrom) q = q.gte('opened_at', localDayBoundsIso(dateFrom))
      if (dateTo) q = q.lte('opened_at', localDayBoundsIso(dateTo, true))
      return q
    })
  },

  async loadGlStatus(shifts) {
    const shiftIds = (shifts || []).map((s) => s.id)
    if (!shiftIds.length) return new Map()

    const [payments, movements] = await Promise.all([
      selectIn('pos_shift_payments', 'id, shift_id, order_id, payment_method, amount', 'shift_id', shiftIds),
      selectIn('pos_shift_cash_movements', 'id, shift_id, type, amount, reason, expense_ledger_id, created_at', 'shift_id', shiftIds),
    ])
    const orderIds = [...new Set(payments.map((p) => p.order_id).filter(Boolean))]
    const movementIds = movements.map((m) => m.id)

    const [saleLegs, shiftLegs, payoutLegs, failures] = await Promise.all([
      selectIn('finance_cashbook_entries', 'id, source_type, source_id, debit_amount, credit_amount', 'source_id', orderIds, (q) => q.eq('source_type', 'pos_sale')),
      selectIn('finance_cashbook_entries', 'id, source_type, source_id, debit_amount, credit_amount', 'source_id', shiftIds, (q) => q.eq('source_type', 'pos_shift')),
      selectIn('finance_cashbook_entries', 'id, source_type, source_id, debit_amount, credit_amount', 'source_id', movementIds, (q) => q.eq('source_type', 'pos_payout')),
      selectIn('pos_gl_failures', 'id, kind, ref_id, error, resolved, created_at', 'ref_id', [...shiftIds, ...orderIds, ...movementIds], (q) => q.eq('resolved', false)),
    ])

    return buildShiftGlStatus({
      shifts,
      payments,
      movements,
      legs: [...saleLegs, ...shiftLegs, ...payoutLegs],
      failures,
    })
  },

  async countOpenFailures() {
    const { count, error } = await supabase
      .from('pos_gl_failures')
      .select('id', { count: 'exact', head: true })
      .eq('resolved', false)
    if (error) throw error
    return count || 0
  },

  /** Admin/finance: post every paid order since p_from that has no pos_sale legs. */
  async postUnpostedSales(fromDate = null) {
    const { data, error } = await supabase.rpc('fn_pos_post_unposted_sales', { p_from: fromDate || null })
    if (error) throw error
    if (!data?.success) throw new Error(data?.error || 'Catch-up posting failed')
    return { posted: Number(data.posted) || 0, failed: Number(data.failed) || 0 }
  },
}
