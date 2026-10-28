// ═══════════════════════════════════════════════════════════════════════════════
// Finance Reports Service — loads GL data (finance_ledgers +
// finance_cashbook_entries, paged past the 1000-row cap) for the Financial
// Reports page and hands it to finance-reports.builder.js.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { fetchAllPages } from './finance-statements.service'
import { classifyCashLedgers } from './finance-cashbook.builder'
import { buildMonthlySummary, buildCashFlow, buildGlCogs } from './finance-reports.builder'

const ENTRY_COLS = 'id, ledger_id, debit_amount, credit_amount, entry_date, source_type, source_id, created_at'

async function loadLedgers() {
  return fetchAllPages(() => supabase.from('finance_ledgers').select('*').order('ledger_code').order('id'))
}

async function loadEntries({ dateFrom, dateTo, branchId, ledgerIds, before } = {}) {
  return fetchAllPages(() => {
    let q = supabase.from('finance_cashbook_entries').select(ENTRY_COLS).order('entry_date').order('id')
    if (branchId) q = q.eq('branch_id', branchId)
    if (dateFrom) q = q.gte('entry_date', dateFrom)
    if (dateTo) q = q.lte('entry_date', dateTo)
    if (before) q = q.lt('entry_date', before)
    if (ledgerIds) q = q.in('ledger_id', ledgerIds)
    return q
  })
}

export const financeReportsService = {
  async monthlySummary(year, { branchId } = {}) {
    const [ledgers, entries] = await Promise.all([
      loadLedgers(),
      loadEntries({ dateFrom: `${year}-01-01`, dateTo: `${year}-12-31`, branchId }),
    ])
    return buildMonthlySummary(ledgers, entries, year)
  },

  async cashFlow(dateFrom, dateTo, { branchId } = {}) {
    const [ledgers, accRes] = await Promise.all([
      loadLedgers(),
      supabase.from('finance_accounts').select('id, ledger_id, account_type, deleted_at'),
    ])
    if (accRes.error) throw accRes.error
    const accounts = accRes.data || []
    const { cash, petty } = classifyCashLedgers(ledgers, accounts)
    const cashIds = [...cash, ...petty].map((l) => l.id)
    const [period, prior] = await Promise.all([
      loadEntries({ dateFrom, dateTo, branchId }),
      dateFrom && cashIds.length
        ? loadEntries({ before: dateFrom, branchId, ledgerIds: cashIds })
        : Promise.resolve([]),
    ])
    return buildCashFlow({ ledgers, accounts, entries: [...prior, ...period], dateFrom, dateTo })
  },

  async glCogs(dateFrom, dateTo, { branchId } = {}) {
    const [ledgers, entries] = await Promise.all([
      loadLedgers(),
      loadEntries({ dateFrom, dateTo, branchId }),
    ])
    return buildGlCogs(ledgers, entries, dateFrom, dateTo)
  },
}

/** Local-day bounds as ISO instants (Asia/Colombo is UTC+5:30, not UTC). */
export function localDayBounds(dateFrom, dateTo) {
  return {
    start: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : null,
    end: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : null,
  }
}

/** Recipe-based (theoretical) COGS per item/kitchen/table — operational analysis, not GL. */
export async function fetchRecipeCogs(dateFrom, dateTo, branchId = null) {
  const { start, end } = localDayBounds(dateFrom, dateTo)
  return fetchAllPages(() =>
    supabase.rpc('get_cogs_report', { p_start_date: start, p_end_date: end, p_branch_id: branchId }),
  )
}
