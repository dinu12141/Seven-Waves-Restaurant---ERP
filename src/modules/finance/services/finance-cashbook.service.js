// ═══════════════════════════════════════════════════════════════════════════════
// Finance Cashbook Service — Cashbook & Petty Cash Book straight from the GL
//
// Reads every finance_cashbook_entries leg posted to a cash / bank ledger (or a
// petty cash ledger), page by page (PostgREST caps a response at 1000 rows),
// and hands them to the pure builder (finance-cashbook.builder.js), which keeps
// a running balance per ledger with an exact balance b/f.
// The legacy finance_petty_cash_entries table is not part of the GL and is no
// longer read.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { fetchAllPages } from './finance-statements.service'
import { resolveDocRefs } from './finance-ledger-statement.service'
import { buildCashbook, classifyCashLedgers, inPeriod } from './finance-cashbook.builder'

const ENTRY_COLUMNS =
  'id, branch_id, source_type, source_id, entry_date, ledger_id, account_id, description, debit_amount, credit_amount, created_at'

const ok = (v) => v !== undefined && v !== null && v !== ''

const EMPTY = (filters = {}) => ({
  date_from: filters.date_from || null,
  date_to: filters.date_to || null,
  ledgers: [],
  rows: [],
  totals: { opening: 0, debit: 0, credit: 0, closing: 0, shown_debit: 0, shown_credit: 0 },
  books: { cash: [], petty: [] },
})

export const financeCashbookService = {
  /** Cash/bank and petty-cash ledgers (for the ledger pickers). */
  async getBookLedgers() {
    const [ledgers, accounts] = await Promise.all([
      fetchAllPages(() => supabase.from('finance_ledgers').select('*').order('ledger_code').order('id')),
      fetchAllPages(() =>
        supabase.from('finance_accounts').select('id, ledger_id, account_type, registered_name, deleted_at').order('id'),
      ),
    ])
    return classifyCashLedgers(ledgers, accounts)
  },

  /**
   * @param {object} filters
   *   book        'cash' (default, cash & bank) | 'petty' | 'all'
   *   ledger_id   one ledger of the book
   *   branch_id, date_from, date_to, source_type
   */
  async getReport(filters = {}) {
    const books = await this.getBookLedgers()
    const book = filters.book === 'petty' ? books.petty : filters.book === 'all' ? [...books.cash, ...books.petty] : books.cash
    const scope = ok(filters.ledger_id) ? book.filter((l) => l.id === filters.ledger_id) : book
    if (!scope.length) return { ...EMPTY(filters), books }

    const ids = scope.map((l) => l.id)
    // All dates are loaded: entries before date_from make up the balance b/f
    // and later ones the drift check against finance_ledgers.current_balance.
    const entries = await fetchAllPages(() => {
      let q = supabase
        .from('finance_cashbook_entries')
        .select(ENTRY_COLUMNS)
        .in('ledger_id', ids)
        .order('entry_date')
        .order('created_at')
        .order('id')
      if (ok(filters.branch_id)) q = q.eq('branch_id', filters.branch_id)
      return q
    })

    const shown = entries.filter(
      (e) => inPeriod(e, filters.date_from, filters.date_to) && (!ok(filters.source_type) || e.source_type === filters.source_type),
    )
    const docRefs = await resolveDocRefs(shown)

    const report = buildCashbook({
      ledgers: scope,
      entries,
      dateFrom: filters.date_from || null,
      dateTo: filters.date_to || null,
      sourceType: ok(filters.source_type) ? filters.source_type : null,
      compareStored: !ok(filters.branch_id),
      docRefs,
    })
    return { ...report, books }
  },

  async getTotals(filters = {}) {
    const r = await this.getReport(filters)
    return {
      totalDebit: r.totals.debit,
      totalCredit: r.totals.credit,
      balance: r.totals.closing,
      count: r.rows.filter((x) => x.kind === 'entry').length,
    }
  },

  /** Petty Cash Book — the same GL view scoped to the petty cash ledgers. */
  async getPettyCashReport(filters = {}) {
    return this.getReport({ ...filters, book: 'petty' })
  },
}
