// ═══════════════════════════════════════════════════════════════════════════════
// Finance Audit Log — merges the three places finance actions are recorded:
//   • finance_audit_logs       client logFinanceAudit (vouchers, ledgers, accounts,
//                              cheques, reconciliations, journals)
//   • audit_logs               server RPCs (cheque bounce, period close, refunds)
//                              — RLS: admin only; silently skipped otherwise
//   • payroll_finance_postings post_payroll_to_finance_v2 (writes no audit row)
// Reads are date-bounded and paged past the 1000-row cap.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { fetchAllPages } from './finance-statements.service'

/** audit_logs.table_name values that belong to Finance. */
export const FINANCE_AUDIT_TABLES = [
  'finance_cheques', 'finance_vouchers', 'finance_ledgers', 'finance_accounts',
  'finance_cashbook_entries', 'accounting_periods', 'journal_entries', 'supplier_payments',
  'payroll_runs', 'payslips', 'orders', 'invoices', 'customer_receivables', 'ar_receipts',
]

/** Local-day bounds as ISO instants (dateTo is inclusive of the whole day). */
export function auditDateBounds(dateFrom, dateTo) {
  return {
    from: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : null,
    to: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : null,
  }
}

/** Badge colour family for an action name such as 'voucher_posted' or 'REFUND'. */
export function actionKind(action) {
  const a = String(action || '').toLowerCase()
  if (/delet|cancel|reject|bounce|void/.test(a)) return 'danger'
  if (/revers|reopen|refund/.test(a)) return 'warning'
  if (/approv|lock|creat|insert|added/.test(a)) return 'success'
  if (/post|updat|clos/.test(a)) return 'info'
  return 'muted'
}

const fmtAmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function describe(entity, values) {
  const v = values || {}
  const ref = v.voucher_no || v.doc_number || v.cheque_no || v.ledger_code || v.registered_name || v.reference || ''
  const amt = v.amount ?? v.total_amount
  return [entity.replace(/_/g, ' '), ref, amt != null ? fmtAmt(amt) : ''].filter(Boolean).join(' · ')
}

export function normalizeAuditRows({ financeLogs = [], serverLogs = [], payrollPostings = [] }) {
  const rows = []
  for (const r of financeLogs || []) {
    rows.push({
      id: `fal-${r.id}`,
      source: 'finance',
      created_at: r.created_at,
      user_id: r.user_id,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      description: r.description || describe(r.entity_type || '', r.new_values || r.old_values),
      old_values: r.old_values,
      new_values: r.new_values,
    })
  }
  for (const r of serverLogs || []) {
    rows.push({
      id: `al-${r.id}`,
      source: 'server',
      created_at: r.created_at,
      user_id: r.user_id,
      action: r.action,
      entity_type: r.table_name,
      entity_id: r.record_id,
      description: describe(r.table_name || '', r.new_data || r.old_data) + (r.severity ? ` · ${r.severity}` : ''),
      old_values: r.old_data,
      new_values: r.new_data,
    })
  }
  for (const p of payrollPostings || []) {
    rows.push({
      id: `pfp-${p.id}`,
      source: 'payroll',
      created_at: p.posted_at || p.created_at,
      user_id: p.posted_by,
      action: 'payroll_posted',
      entity_type: 'payroll_run',
      entity_id: p.payroll_run_id,
      description: `Payroll posted to GL (${p.posting_version || 'legacy'}) · gross ${fmtAmt(p.total_gross)} · net ${fmtAmt(p.total_net)} · ${p.slips_posted ?? '?'} slip(s)`,
      old_values: null,
      new_values: {
        total_gross: p.total_gross, total_net: p.total_net,
        epf_employee: p.total_epf_employee, epf_employer: p.total_epf_employer,
        etf_employer: p.total_etf_employer, payment_method: p.payment_method,
        journal_entry_id: p.journal_entry_id,
      },
    })
  }
  return rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

export const financeAuditService = {
  /**
   * @param {{dateFrom?: string, dateTo?: string, entityType?: string, includeServer?: boolean}} f
   * @returns {Promise<{rows: object[], warnings: string[]}>}
   */
  async fetchLogs(f = {}) {
    const { from, to } = auditDateBounds(f.dateFrom, f.dateTo)
    const warnings = []
    const bound = (q, col = 'created_at') => {
      if (from) q = q.gte(col, from)
      if (to) q = q.lte(col, to)
      return q
    }
    const safe = async (label, fn) => {
      try {
        return await fn()
      } catch (e) {
        warnings.push(`${label}: ${e?.message || e}`)
        return []
      }
    }

    const [financeLogs, serverLogs, payrollPostings] = await Promise.all([
      safe('Finance audit log', () =>
        fetchAllPages(() => {
          let q = supabase.from('finance_audit_logs').select('*').order('created_at', { ascending: false }).order('id')
          if (f.entityType) q = q.eq('entity_type', f.entityType)
          return bound(q)
        }),
      ),
      f.entityType
        ? Promise.resolve([])
        : safe('Server audit log', () =>
            fetchAllPages(() =>
              bound(
                supabase
                  .from('audit_logs')
                  .select('id, user_id, action, table_name, record_id, old_data, new_data, created_at, severity')
                  .in('table_name', FINANCE_AUDIT_TABLES)
                  .order('created_at', { ascending: false })
                  .order('id'),
              ),
            ),
          ),
      f.entityType && f.entityType !== 'payroll_run'
        ? Promise.resolve([])
        : safe('Payroll postings', () =>
            fetchAllPages(() =>
              bound(
                supabase.from('payroll_finance_postings').select('*').order('posted_at', { ascending: false }).order('id'),
                'posted_at',
              ),
            ),
          ),
    ])

    const rows = normalizeAuditRows({ financeLogs, serverLogs, payrollPostings })
    const filtered = f.entityType ? rows.filter((r) => r.entity_type === f.entityType) : rows

    // user names (separate lookup: user_id FKs differ between the sources)
    const ids = [...new Set(filtered.map((r) => r.user_id).filter(Boolean))]
    const names = new Map()
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', ids.slice(i, i + 100))
      for (const p of data || []) names.set(p.id, p.full_name || p.email)
    }
    for (const r of filtered) r.user_name = names.get(r.user_id) || (r.user_id ? 'Unknown user' : 'System')
    return { rows: filtered, warnings }
  },
}
