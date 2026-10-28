// ═══════════════════════════════════════════════════════════════════════════════
// Ledger / Account Statement Service — read-only drill-down into the GL
// Seven Waves Restaurant (Pvt) Ltd
//
// Loads every finance_cashbook_entries row of one ledger (or one cash/bank
// account) page by page, resolves source document numbers, and hands the
// numbers to the pure builder (finance-ledger-statement.builder.js).
// All entries are loaded (not only the period) so the balance b/f and the
// drift check against the stored current_balance are exact.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { fetchAllPages } from './finance-statements.service'
import {
  buildStatement,
  signedLedgerOpening,
  signedAccountOpening,
  filterAccountEntries,
  sourceTable,
} from './finance-ledger-statement.builder'

const ENTRY_COLUMNS =
  'id, branch_id, source_type, source_id, entry_date, ledger_id, account_id, description, debit_amount, credit_amount, created_at'

// Keeps `.in('id', [...])` URLs well under proxy limits.
const DOC_LOOKUP_CHUNK = 150

const DOC_COLUMNS = {
  ap_invoices: { select: 'id, doc_number', pick: (r) => r.doc_number },
  supplier_payments: { select: 'id, doc_number', pick: (r) => r.doc_number },
  finance_vouchers: { select: 'id, voucher_no', pick: (r) => r.voucher_no },
  orders: { select: 'id, order_number', pick: (r) => (r.order_number ? `Order #${r.order_number}` : null) },
  customer_receivables: { select: 'id, doc_number', pick: (r) => r.doc_number },
  ar_receipts: { select: 'id, receipt_no', pick: (r) => r.receipt_no },
  ar_write_offs: { select: 'id, write_off_no', pick: (r) => r.write_off_no },
  journal_entries: {
    select: 'id, description',
    pick: (r) => `JE-${String(r.id).slice(0, 8)}${r.description ? ` · ${String(r.description).slice(0, 40)}` : ''}`,
  },
}

async function fetchEntries({ ledgerId, accountId, branchId }) {
  return fetchAllPages(() => {
    let q = supabase
      .from('finance_cashbook_entries')
      .select(ENTRY_COLUMNS)
      .eq('ledger_id', ledgerId)
      .order('entry_date')
      .order('created_at')
      .order('id')
    if (accountId) q = q.eq('account_id', accountId)
    if (branchId) q = q.eq('branch_id', branchId)
    return q
  })
}

/** Best-effort doc-number lookup: a failed lookup only loses the pretty reference. */
export async function resolveDocRefs(entries) {
  const idsByTable = {}
  for (const e of entries || []) {
    const table = sourceTable(e.source_type)
    if (!table || !e.source_id) continue
    ;(idsByTable[table] ||= new Set()).add(e.source_id)
  }
  const refs = {}
  await Promise.all(
    Object.entries(idsByTable).map(async ([table, set]) => {
      const cfg = DOC_COLUMNS[table]
      const ids = [...set]
      refs[table] = {}
      for (let i = 0; i < ids.length; i += DOC_LOOKUP_CHUNK) {
        try {
          const { data, error } = await supabase
            .from(table)
            .select(cfg.select)
            .in('id', ids.slice(i, i + DOC_LOOKUP_CHUNK))
          if (error) continue
          for (const r of data || []) {
            const v = cfg.pick(r)
            if (v) refs[table][r.id] = v
          }
        } catch {
          /* ignore — fallback reference is used */
        }
      }
    }),
  )
  return refs
}

export const financeLedgerStatementService = {
  async getLedgerStatement({ ledgerId = null, dateFrom = null, dateTo = null, branchId = null } = {}) {
    if (!ledgerId) throw new Error('ledgerId is required')
    const { data: ledger, error } = await supabase.from('finance_ledgers').select('*').eq('id', ledgerId).single()
    if (error) throw error
    if (!ledger) throw new Error('Ledger not found')

    const entries = await fetchEntries({ ledgerId, branchId })
    const docRefs = await resolveDocRefs(entries)

    return buildStatement({
      subject: {
        type: 'ledger',
        id: ledger.id,
        code: ledger.ledger_code,
        name: ledger.ledger_name,
        group: ledger.account_group || null,
        ledger_type: ledger.ledger_type,
        ledger_nature: ledger.ledger_nature,
        is_deleted: !!ledger.deleted_at,
      },
      openingBase: signedLedgerOpening(ledger),
      entries,
      dateFrom,
      dateTo,
      storedCurrentBalance: ledger.current_balance,
      compareStored: !branchId,
      docRefs,
    })
  },

  async getAccountStatement({ accountId = null, dateFrom = null, dateTo = null, branchId = null } = {}) {
    if (!accountId) throw new Error('accountId is required')
    const { data: account, error } = await supabase
      .from('finance_accounts')
      .select('*, ledger:finance_ledgers(*)')
      .eq('id', accountId)
      .single()
    if (error) throw error
    if (!account) throw new Error('Account not found')

    // An account without a ledger cannot carry GL entries.
    const raw = account.ledger_id ? await fetchEntries({ ledgerId: account.ledger_id, accountId, branchId }) : []
    const entries = filterAccountEntries(raw, account)
    const docRefs = await resolveDocRefs(entries)

    return buildStatement({
      subject: {
        type: 'account',
        id: account.id,
        code: account.account_number || account.ledger?.ledger_code || '',
        name: account.registered_name,
        group: account.ledger
          ? `${account.ledger.ledger_code} ${account.ledger.ledger_name}${account.ledger.account_group ? ` · ${account.ledger.account_group}` : ''}`
          : null,
        account_type: account.account_type,
        ledger_id: account.ledger_id || null,
        is_deleted: !!account.deleted_at,
      },
      openingBase: signedAccountOpening(account),
      entries,
      dateFrom,
      dateTo,
      storedCurrentBalance: account.current_balance,
      compareStored: !branchId,
      docRefs,
    })
  },
}

export const getLedgerStatement = (args) => financeLedgerStatementService.getLedgerStatement(args)
export const getAccountStatement = (args) => financeLedgerStatementService.getAccountStatement(args)
