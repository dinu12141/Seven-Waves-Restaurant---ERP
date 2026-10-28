// ═══════════════════════════════════════════════════════════════════════════════
// Finance Journal Service — General Ledger Journal Entries (Double-Entry)
// Posting and reversal run in single server RPCs (finance_gl_integrity_141.sql),
// so a journal, its lines, its cashbook legs and the ledger balances are written
// atomically. The General Ledger view reads finance_cashbook_entries directly.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { logFinanceAudit } from './finance-ledger.service'
import { fetchAllPages } from './finance-statements.service'
import {
  buildGlPostings,
  chunk,
  docRefFromRow,
  GL_DOC_SOURCES,
  titleCase,
} from './finance-gl.builder'

const cleanUuid = (val) => (typeof val === 'string' && val.trim() !== '' ? val : null)

export const GL_RPC_MISSING_MSG =
  'The General Ledger posting functions are not installed on the database. ' +
  'Apply supabase/finance_gl_integrity_141.sql, then try again.'

export const SYSTEM_JOURNAL_REVERSE_MSG =
  'System journal — reverse it from its source document (e.g. cancel the supplier payment in Procurement → Payments).'

/** Manual journals (reference_type 'manual' or NULL) are the only ones reversible here. */
export function isSystemJournal(journal) {
  const t = journal?.reference_type
  return !(t === null || t === undefined || t === '' || t === 'manual')
}

function isMissingRpc(error) {
  return error?.code === 'PGRST202' || /Could not find the function/i.test(error?.message || '')
}

/** Normalise a `{ success, error }` jsonb RPC result; throws on any failure. */
function unwrapRpc(data, error) {
  if (error) {
    if (isMissingRpc(error)) throw new Error(GL_RPC_MISSING_MSG)
    throw new Error(error.message || 'Journal posting failed.')
  }
  const res = typeof data === 'string' ? JSON.parse(data) : data
  if (!res || res.success !== true) {
    throw new Error(res?.error || 'Journal posting failed.')
  }
  return res
}

/** `select … where id in (…)`, chunked (≤ 200 ids) to keep request URLs short. */
async function fetchByIds(table, select, ids, size = 200) {
  const rows = []
  for (const part of chunk(ids, size)) {
    const { data, error } = await supabase.from(table).select(select).in('id', part)
    if (error) throw error
    rows.push(...(data || []))
  }
  return rows
}

export const financeJournalService = {
  // ── List (journal_entries — manual & legacy system journals) ─────────────
  async list(filters = {}) {
    const ok = (v) => v !== undefined && v !== null && v !== ''
    let q = supabase
      .from('journal_entries')
      .select('*, lines:journal_lines(*)')
      .order('doc_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (ok(filters.branch_id)) q = q.eq('branch_id', filters.branch_id)
    if (ok(filters.date_from)) q = q.gte('doc_date', filters.date_from)
    if (ok(filters.date_to)) q = q.lte('doc_date', filters.date_to)
    if (ok(filters.reference_type)) q = q.eq('reference_type', filters.reference_type)
    if (filters.is_reversed !== undefined && filters.is_reversed !== null) {
      q = q.eq('is_reversed', filters.is_reversed)
    }
    if (ok(filters.search)) {
      q = q.ilike('description', `%${filters.search}%`)
    }

    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('*, lines:journal_lines(*)')
      .eq('id', id)
      .single()

    if (error) throw error
    if (data?.lines) {
      data.lines.sort((a, b) => (a.line_number || 0) - (b.line_number || 0))
    }
    return data
  },

  // ── Create and Post Double-Entry Journal Entry (atomic RPC) ──────────────
  async create(header, lines) {
    const authStore = useAuthStore()

    if (!header.doc_date) throw new Error('Document date is required.')
    if (!header.description || !header.description.trim()) {
      throw new Error('Narration / Description is required.')
    }
    if (!Array.isArray(lines) || lines.length < 2) {
      throw new Error('A journal entry must contain at least 2 lines (at least one Debit and one Credit).')
    }

    // Validate lines and calculate sums
    let totalDr = 0
    let totalCr = 0
    const validLines = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const dr = Math.round((Number(line.dr_amount) || 0) * 100) / 100
      const cr = Math.round((Number(line.cr_amount) || 0) * 100) / 100

      if (!line.ledger_id) {
        throw new Error(`Line ${i + 1}: General ledger account is required.`)
      }
      if (dr === 0 && cr === 0) {
        throw new Error(`Line ${i + 1}: Either Debit or Credit must be greater than zero.`)
      }
      if (dr > 0 && cr > 0) {
        throw new Error(`Line ${i + 1}: A line cannot have both Debit and Credit amounts.`)
      }
      if (dr < 0 || cr < 0) {
        throw new Error(`Line ${i + 1}: Negative amounts are not allowed.`)
      }

      totalDr += dr
      totalCr += cr

      validLines.push({
        ledger_id: line.ledger_id,
        dr_amount: dr,
        cr_amount: cr,
        memo: line.memo || null,
      })
    }

    totalDr = Math.round(totalDr * 100) / 100
    totalCr = Math.round(totalCr * 100) / 100

    if (totalDr <= 0) {
      throw new Error('Total entry amount must be greater than zero.')
    }

    // Strict Double-Entry Balance Check
    if (Math.abs(totalDr - totalCr) > 0.01) {
      throw new Error(
        `Double-entry imbalance: Total Debit (LKR ${totalDr.toLocaleString()}) must equal Total Credit (LKR ${totalCr.toLocaleString()}). Difference: LKR ${Math.abs(totalDr - totalCr).toFixed(2)}`
      )
    }

    const branchId =
      cleanUuid(header.branch_id) ||
      cleanUuid(authStore.currentBranch?.id) ||
      cleanUuid(authStore.profile?.branch_id) ||
      null

    // Categories such as petty cash reimbursement / accrual are still manual
    // journals on the server; keep the category visible in the narration.
    let description = header.description.trim()
    const refType = header.reference_type || 'manual'
    if (refType !== 'manual') {
      const label = titleCase(refType)
      if (!description.startsWith(`[${label}]`)) description = `[${label}] ${description}`
    }

    // Single atomic server-side posting: journal_entries + journal_lines +
    // cashbook legs + ledger/account balances in one transaction.
    const { data, error } = await supabase.rpc('fn_fin_post_manual_journal', {
      p_doc_date: header.doc_date,
      p_description: description,
      p_reference: header.reference_id?.trim() || null,
      p_branch_id: branchId,
      p_lines: validLines,
    })
    const res = unwrapRpc(data, error)
    if (!res.journal_id) throw new Error('Journal posting did not return a journal id.')

    const journal = await this.getById(res.journal_id)
    await logFinanceAudit('journal_posted', 'journal_entry', res.journal_id, null, journal)
    return journal
  },

  // ── Reverse Journal Entry (manual journals only, atomic RPC) ─────────────
  async reverse(journalId, reason = '') {
    const original = await this.getById(journalId)

    if (!original) throw new Error('Journal entry not found.')
    if (original.is_reversed) throw new Error('This journal entry has already been reversed.')
    if (isSystemJournal(original)) throw new Error(SYSTEM_JOURNAL_REVERSE_MSG)

    const { data, error } = await supabase.rpc('fn_fin_reverse_manual_journal', {
      p_journal_id: journalId,
      p_reason: reason?.trim() || null,
    })
    const res = unwrapRpc(data, error)
    if (!res.reversal_id) return { id: null, reversal_of: journalId }
    const revJournal = await this.getById(res.reversal_id)
    await logFinanceAudit('journal_reversed', 'journal_entry', journalId, original, revJournal)
    return revJournal
  },

  // ── General Ledger: every cashbook posting, grouped per source document ──
  async listGeneralLedger(filters = {}) {
    const ok = (v) => v !== undefined && v !== null && v !== ''

    const entries = await fetchAllPages(() => {
      let q = supabase
        .from('finance_cashbook_entries')
        .select(
          'id, branch_id, source_type, source_id, entry_date, ledger_id, account_id, description, debit_amount, credit_amount, created_at',
        )
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
      if (ok(filters.branch_id)) q = q.eq('branch_id', filters.branch_id)
      if (ok(filters.date_from)) q = q.gte('entry_date', filters.date_from)
      if (ok(filters.date_to)) q = q.lte('entry_date', filters.date_to)
      if (ok(filters.source_type)) q = q.eq('source_type', filters.source_type)
      if (ok(filters.search)) q = q.ilike('description', `%${filters.search}%`)
      return q
    })

    const uniq = (arr) => [...new Set(arr.filter(Boolean))]

    const [ledgerRows, accountRows] = await Promise.all([
      fetchByIds(
        'finance_ledgers',
        'id, ledger_code, ledger_name, account_group',
        uniq(entries.map((e) => e.ledger_id)),
      ),
      fetchByIds(
        'finance_accounts',
        'id, registered_name, account_number',
        uniq(entries.map((e) => e.account_id)),
      ),
    ])
    const ledgers = new Map(ledgerRows.map((r) => [r.id, r]))
    const accounts = new Map(accountRows.map((r) => [r.id, r]))

    // Document numbers: one batched lookup per source table.
    const byTable = new Map()
    for (const e of entries) {
      const cfg = GL_DOC_SOURCES[e.source_type]
      if (!cfg || !e.source_id) continue
      const k = `${cfg.table}|${cfg.select}`
      if (!byTable.has(k)) byTable.set(k, { cfg, ids: new Set(), types: new Set() })
      const t = byTable.get(k)
      t.ids.add(e.source_id)
      t.types.add(e.source_type)
    }

    const docRefs = new Map()
    await Promise.all(
      [...byTable.values()].map(async ({ cfg, ids, types }) => {
        let rows = []
        try {
          rows = await fetchByIds(cfg.table, cfg.select, [...ids])
        } catch {
          return // a missing document number must never hide the ledger
        }
        for (const row of rows) {
          for (const type of types) {
            const ref = docRefFromRow(type, row)
            if (ref) docRefs.set(`${type}|${row.id}`, ref)
          }
        }
      }),
    )

    return buildGlPostings(entries, { ledgers, accounts, docRefs })
  },
}
