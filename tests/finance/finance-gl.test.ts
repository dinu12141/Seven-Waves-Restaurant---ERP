// ═══════════════════════════════════════════════════════════════════════════════
// Finance General Ledger — builder grouping + journal service RPC contract (#141)
// The GL page must show every cashbook posting (bills, payments, vouchers,
// journals), and manual journals must post/reverse through atomic RPCs only.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, calls } from '../helpers/supabaseMock'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  return { supabase: sb.mock.client }
})
const authMock = vi.hoisted(() => ({
  currentBranch: { id: 'branch-1', company_id: 'co-1' } as any,
  profile: { branch_id: null } as any,
}))
vi.mock('src/stores/auth', () => ({ useAuthStore: () => authMock }))

import {
  buildGlPostings,
  summarizeGlPostings,
  sourceLabel,
  postingKey,
  chunk,
} from 'src/modules/finance/services/finance-gl.builder'
import {
  financeJournalService,
  GL_RPC_MISSING_MSG,
  SYSTEM_JOURNAL_REVERSE_MSG,
  isSystemJournal,
} from 'src/modules/finance/services/finance-journal.service'

let m: ReturnType<typeof createSupabaseMock>
beforeEach(() => {
  m = sb.mock
  m.reset()
})

function leg(over: Record<string, unknown>) {
  return {
    id: Math.random().toString(36).slice(2),
    branch_id: 'branch-1',
    source_type: 'invoice',
    source_id: 'bill-1',
    entry_date: '2026-10-01',
    ledger_id: 'L-exp',
    account_id: null,
    description: 'Bill',
    debit_amount: 0,
    credit_amount: 0,
    created_at: '2026-10-01T08:00:00Z',
    ...over,
  }
}

const ledgers = new Map([
  ['L-exp', { ledger_code: '5001', ledger_name: 'Purchases' }],
  ['L-ap', { ledger_code: '2001', ledger_name: 'Accounts Payable' }],
  ['L-bank', { ledger_code: '1002-4', ledger_name: 'Bank - Current' }],
])
const accounts = new Map([['A-1', { registered_name: 'BOC Current', account_number: '0042' }]])

// ── Builder ──────────────────────────────────────────────────────────────────
describe('finance-gl.builder', () => {
  it('labels known source types and title-cases unknown ones', () => {
    expect(sourceLabel('invoice')).toBe('Supplier Bill')
    expect(sourceLabel('supplier_payment')).toBe('Supplier Payment')
    expect(sourceLabel('pay_voucher')).toBe('Pay Voucher')
    expect(sourceLabel('received_voucher')).toBe('Received Voucher')
    expect(sourceLabel('manual_adjustment')).toBe('Manual Journal')
    expect(sourceLabel('stock_write_off')).toBe('Stock Write Off')
    expect(sourceLabel('pos_cash_sale')).toBe('POS Cash Sale')
    expect(sourceLabel(null)).toBe('Unknown')
  })

  it('groups legs per source document and resolves ledgers, accounts and doc numbers', () => {
    const entries = [
      leg({ source_id: 'bill-1', ledger_id: 'L-exp', debit_amount: 1000 }),
      leg({ source_id: 'bill-1', ledger_id: 'L-ap', credit_amount: 1000 }),
      leg({
        source_type: 'supplier_payment',
        source_id: 'pay-1',
        entry_date: '2026-10-05',
        ledger_id: 'L-ap',
        debit_amount: 1000,
        description: 'Payment',
      }),
      leg({
        source_type: 'supplier_payment',
        source_id: 'pay-1',
        entry_date: '2026-10-05',
        ledger_id: 'L-bank',
        account_id: 'A-1',
        credit_amount: 1000,
        description: 'Payment',
      }),
    ]
    const docRefs = new Map([
      ['invoice|bill-1', 'BILL-0001'],
      ['supplier_payment|pay-1', 'SP-0001'],
    ])

    const postings = buildGlPostings(entries, { ledgers, accounts, docRefs })

    expect(postings).toHaveLength(2)
    // newest first
    expect(postings[0]).toMatchObject({
      source_type: 'supplier_payment',
      source_label: 'Supplier Payment',
      doc_ref: 'SP-0001',
      date: '2026-10-05',
      total_dr: 1000,
      total_cr: 1000,
      balanced: true,
      is_reversal: false,
    })
    expect(postings[0].lines).toHaveLength(2)
    const bankLeg = postings[0].lines.find((l: any) => l.credit > 0)
    expect(bankLeg).toMatchObject({
      ledger_code: '1002-4',
      ledger_name: 'Bank - Current',
      account_name: 'BOC Current · 0042',
    })
    expect(postings[1]).toMatchObject({ source_label: 'Supplier Bill', doc_ref: 'BILL-0001' })
    // debit legs listed first
    expect(postings[1].lines[0].debit).toBe(1000)
  })

  it('treats REVERSAL legs as their own posting', () => {
    const entries = [
      leg({ source_type: 'manual_adjustment', source_id: 'j1', ledger_id: 'L-exp', debit_amount: 500, description: 'Adj' }),
      leg({ source_type: 'manual_adjustment', source_id: 'j1', ledger_id: 'L-bank', credit_amount: 500, description: 'Adj' }),
      leg({ source_type: 'manual_adjustment', source_id: 'j1', ledger_id: 'L-exp', credit_amount: 500, description: 'REVERSAL of Adj' }),
      leg({ source_type: 'manual_adjustment', source_id: 'j1', ledger_id: 'L-bank', debit_amount: 500, description: 'REVERSAL of Adj' }),
    ]
    const postings = buildGlPostings(entries, { ledgers })
    expect(postings).toHaveLength(2)
    expect(postings.filter((p: any) => p.is_reversal)).toHaveLength(1)
    expect(postings.every((p: any) => p.balanced)).toBe(true)
    expect(postingKey(entries[0])).not.toBe(postingKey(entries[2]))
  })

  it('flags unbalanced postings and summarises KPIs', () => {
    const entries = [
      leg({ source_id: 'b1', ledger_id: 'L-exp', debit_amount: 100.1 }),
      leg({ source_id: 'b1', ledger_id: 'L-ap', credit_amount: 100.1 }),
      leg({ source_id: 'b2', ledger_id: 'L-exp', debit_amount: 300 }),
      leg({ source_id: 'b2', ledger_id: 'L-ap', credit_amount: 250 }),
    ]
    const postings = buildGlPostings(entries, { ledgers })
    const b2 = postings.find((p: any) => p.source_id === 'b2')
    expect(b2.balanced).toBe(false)
    expect(summarizeGlPostings(postings)).toEqual({
      count: 2,
      total_dr: 400.1,
      total_cr: 350.1,
      unbalanced: 1,
    })
  })

  it('falls back gracefully for unknown ledgers and missing doc numbers', () => {
    const [p] = buildGlPostings([leg({ ledger_id: 'nope', debit_amount: 1 })], {})
    expect(p.doc_ref).toBeNull()
    expect(p.lines[0].ledger_name).toBe('Unknown ledger')
  })

  it('chunks ids at ≤ 200', () => {
    const parts = chunk(Array.from({ length: 450 }, (_, i) => i), 200)
    expect(parts.map((c) => c.length)).toEqual([200, 200, 50])
  })
})

// ── Service: create() ────────────────────────────────────────────────────────
describe('financeJournalService.create', () => {
  const header = { doc_date: '2026-10-20', description: ' Petty cash top-up ', reference_id: ' PC-01 ', reference_type: 'manual' }
  const lines = [
    { ledger_id: 'L-exp', dr_amount: 1500, cr_amount: null, memo: 'cleaning', account_code: '5001' },
    { ledger_id: 'L-bank', dr_amount: null, cr_amount: 1500, memo: '' },
  ]

  it('posts through fn_fin_post_manual_journal with the exact payload and no direct writes', async () => {
    m.queueRpc('fn_fin_post_manual_journal', { data: { success: true, journal_id: 'j-1', doc_ref: 'JV-1' } })
    m.queue('journal_entries', { data: { id: 'j-1', lines: [] } })

    const res = await financeJournalService.create(header, lines)

    expect(m.rpcCalls).toEqual([
      {
        name: 'fn_fin_post_manual_journal',
        args: {
          p_doc_date: '2026-10-20',
          p_description: 'Petty cash top-up',
          p_reference: 'PC-01',
          p_branch_id: 'branch-1',
          p_lines: [
            { ledger_id: 'L-exp', dr_amount: 1500, cr_amount: 0, memo: 'cleaning' },
            { ledger_id: 'L-bank', dr_amount: 0, cr_amount: 1500, memo: null },
          ],
        },
      },
    ])
    expect(res).toEqual({ id: 'j-1', lines: [] })
    // only the getById read + the audit-log row — no ledger writes from the client
    expect(m.queries.map((q) => q.table)).toEqual(['journal_entries', 'finance_audit_logs'])
    expect(calls(m.queries[0], 'insert')).toHaveLength(0)
    expect(m.on('finance_cashbook_entries')).toHaveLength(0)
    expect(m.on('finance_ledgers')).toHaveLength(0)
  })

  it('keeps a non-manual category visible in the narration', async () => {
    m.queueRpc('fn_fin_post_manual_journal', { data: { success: true, journal_id: 'j-2' } })
    await financeJournalService.create({ ...header, reference_type: 'petty_cash_reimbursement' }, lines)
    expect((m.rpcCalls[0].args as any).p_description).toBe('[Petty Cash Reimbursement] Petty cash top-up')
  })

  it('keeps client-side validation before any RPC', async () => {
    await expect(
      financeJournalService.create(header, [
        { ledger_id: 'a', dr_amount: 100 },
        { ledger_id: 'b', cr_amount: 80 },
      ]),
    ).rejects.toThrow('Double-entry imbalance')
    await expect(financeJournalService.create(header, [{ ledger_id: 'a', dr_amount: 1 }])).rejects.toThrow(
      'at least 2 lines',
    )
    expect(m.rpcCalls).toHaveLength(0)
  })

  it('throws the server error on success:false', async () => {
    m.queueRpc('fn_fin_post_manual_journal', { data: { success: false, error: 'Ledger is inactive' } })
    await expect(financeJournalService.create(header, lines)).rejects.toThrow('Ledger is inactive')
    expect(m.queries).toHaveLength(0)
  })

  it('tells the user to apply the migration when the RPC is missing (PGRST202) — no fallback', async () => {
    m.queueRpc('fn_fin_post_manual_journal', {
      error: { code: 'PGRST202', message: 'Could not find the function public.fn_fin_post_manual_journal' } as any,
    })
    await expect(financeJournalService.create(header, lines)).rejects.toThrow(GL_RPC_MISSING_MSG)
    expect(GL_RPC_MISSING_MSG).toContain('supabase/finance_gl_integrity_141.sql')
    expect(m.queries).toHaveLength(0)
  })
})

// ── Service: reverse() ───────────────────────────────────────────────────────
describe('financeJournalService.reverse', () => {
  it('refuses system journals client-side without calling the RPC', async () => {
    m.queue('journal_entries', {
      data: { id: 'j-sys', reference_type: 'supplier_payment', is_reversed: false, lines: [] },
    })
    await expect(financeJournalService.reverse('j-sys', 'oops')).rejects.toThrow(SYSTEM_JOURNAL_REVERSE_MSG)
    expect(m.rpcCalls).toHaveLength(0)
    expect(m.on('finance_cashbook_entries')).toHaveLength(0)
  })

  it('reverses manual journals through fn_fin_reverse_manual_journal', async () => {
    m.queue(
      'journal_entries',
      { data: { id: 'j-1', reference_type: 'manual', is_reversed: false, lines: [] } },
      { data: { id: 'j-rev', reference_type: 'reversal', lines: [] } },
    )
    m.queueRpc('fn_fin_reverse_manual_journal', { data: { success: true, reversal_id: 'j-rev' } })

    const res = await financeJournalService.reverse('j-1', ' typo ')

    expect(m.rpcCalls).toEqual([
      { name: 'fn_fin_reverse_manual_journal', args: { p_journal_id: 'j-1', p_reason: 'typo' } },
    ])
    expect(res.id).toBe('j-rev')
  })

  it('throws on success:false from the reverse RPC', async () => {
    m.queue('journal_entries', { data: { id: 'j-1', reference_type: null, is_reversed: false, lines: [] } })
    m.queueRpc('fn_fin_reverse_manual_journal', { data: { success: false, error: 'Period is closed' } })
    await expect(financeJournalService.reverse('j-1')).rejects.toThrow('Period is closed')
  })

  it('isSystemJournal: only manual / null are user journals', () => {
    expect(isSystemJournal({ reference_type: 'manual' })).toBe(false)
    expect(isSystemJournal({ reference_type: null })).toBe(false)
    expect(isSystemJournal({ reference_type: 'supplier_payment' })).toBe(true)
    expect(isSystemJournal({ reference_type: 'reversal' })).toBe(true)
  })
})

// ── Service: listGeneralLedger() ─────────────────────────────────────────────
describe('financeJournalService.listGeneralLedger', () => {
  it('pages the cashbook, applies filters and resolves names + doc numbers in batches', async () => {
    m.queue('finance_cashbook_entries', {
      data: [
        leg({ id: 'e1', source_id: 'bill-1', ledger_id: 'L-exp', debit_amount: 10 }),
        leg({ id: 'e2', source_id: 'bill-1', ledger_id: 'L-ap', credit_amount: 10 }),
        leg({ id: 'e3', source_type: 'pay_voucher', source_id: 'v-1', ledger_id: 'L-exp', debit_amount: 5 }),
        leg({ id: 'e4', source_type: 'pay_voucher', source_id: 'v-1', ledger_id: 'L-bank', account_id: 'A-1', credit_amount: 5 }),
      ],
    })
    m.queue('finance_ledgers', {
      data: [
        { id: 'L-exp', ledger_code: '5001', ledger_name: 'Purchases' },
        { id: 'L-ap', ledger_code: '2001', ledger_name: 'Accounts Payable' },
        { id: 'L-bank', ledger_code: '1002-4', ledger_name: 'Bank' },
      ],
    })
    m.queue('finance_accounts', { data: [{ id: 'A-1', registered_name: 'BOC', account_number: '42' }] })
    m.queue('ap_invoices', { data: [{ id: 'bill-1', doc_number: 'BILL-9' }] })
    m.queue('finance_vouchers', { data: [{ id: 'v-1', voucher_no: 'PV-3' }] })

    const postings = await financeJournalService.listGeneralLedger({
      source_type: '',
      date_from: '2026-10-01',
      search: 'Bill',
    })

    const cb = m.on('finance_cashbook_entries')[0]
    expect(call(cb, 'range')).toEqual([0, 999])
    expect(call(cb, 'gte')).toEqual(['entry_date', '2026-10-01'])
    expect(call(cb, 'ilike')).toEqual(['description', '%Bill%'])
    expect(calls(cb, 'eq')).toHaveLength(0) // empty source_type ignored

    expect(postings.map((p: any) => p.doc_ref).sort()).toEqual(['BILL-9', 'PV-3'])
    const pv = postings.find((p: any) => p.source_type === 'pay_voucher')
    expect(pv.source_label).toBe('Pay Voucher')
    expect(pv.lines.find((l: any) => l.credit > 0).ledger_code).toBe('1002-4')
  })
})

function call(q: any, method: string) {
  return q?.calls.find((c: any) => c.method === method)?.args
}
