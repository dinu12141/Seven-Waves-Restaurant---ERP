// ═══════════════════════════════════════════════════════════════════════════════
// Finance Journal Service — General Ledger Journal Entries (Double-Entry)
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logFinanceAudit } from './finance-ledger.service'
import { useAuthStore } from 'src/stores/auth'

const cleanUuid = (val) => (typeof val === 'string' && val.trim() !== '' ? val : null)

export const financeJournalService = {
  // ── List ──────────────────────────────────────────────────────────────────
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

  // ── Create and Post Double-Entry Journal Entry ───────────────────────────
  async create(header, lines) {
    const authStore = useAuthStore()
    const user = (await supabase.auth.getUser()).data?.user

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
        account_code: line.account_code || '',
        account_name: line.account_name || '',
        dr_amount: dr,
        cr_amount: cr,
        memo: line.memo || null,
        line_number: i + 1,
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

    const companyId =
      cleanUuid(header.company_id) ||
      cleanUuid(authStore.currentBranch?.company_id) ||
      cleanUuid(authStore.profile?.company_id) ||
      null

    const branchId =
      cleanUuid(header.branch_id) ||
      cleanUuid(authStore.currentBranch?.id) ||
      cleanUuid(authStore.profile?.branch_id) ||
      null

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const toUuidOrNull = (v) => (typeof v === 'string' && UUID_RE.test(v.trim()) ? v.trim() : null)

    const refText = header.reference_id?.trim() || ''
    const refUuid = toUuidOrNull(refText)
    let fullDescription = header.description.trim()
    if (refText && !refUuid && !fullDescription.includes(refText)) {
      fullDescription = `[Ref: ${refText}] ${fullDescription}`
    }

    // 1. Insert header as draft (is_posted: false) so lines can be inserted
    // (Database has a trigger blocking line modifications once is_posted = true)
    const headerPayload = {
      company_id: companyId,
      branch_id: branchId,
      doc_date: header.doc_date,
      description: fullDescription,
      reference_type: header.reference_type || 'manual',
      reference_id: refUuid,
      total_dr: totalDr,
      total_cr: totalCr,
      is_posted: false,
      posted_by: user?.id || null,
    }

    const { data: journal, error: jErr } = await supabase
      .from('journal_entries')
      .insert(headerPayload)
      .select()
      .single()

    if (jErr) throw jErr

    // 2. Insert journal lines
    const linePayloads = validLines.map((l) => ({
      journal_id: journal.id,
      account_code: l.account_code,
      account_name: l.account_name,
      dr_amount: l.dr_amount,
      cr_amount: l.cr_amount,
      memo: l.memo,
      line_number: l.line_number,
      branch_id: branchId,
    }))

    const { error: linesErr } = await supabase.from('journal_lines').insert(linePayloads)
    if (linesErr) {
      // Clean up orphaned header if line insert fails
      await supabase.from('journal_entries').delete().eq('id', journal.id).catch(() => {})
      throw linesErr
    }

    // 3. Mark journal as posted (locks lines and activates immutability guard)
    const { error: postErr } = await supabase
      .from('journal_entries')
      .update({
        is_posted: true,
        posted_at: new Date().toISOString(),
      })
      .eq('id', journal.id)

    if (postErr) throw postErr

    // 3. Post movements to Cashbook entries & update Ledger balances
    for (const l of validLines) {
      const delta = l.dr_amount - l.cr_amount

      // Write to finance_cashbook_entries for Trial Balance, P&L and statement aggregations
      await supabase.from('finance_cashbook_entries').insert({
        company_id: companyId,
        branch_id: branchId,
        source_type: 'manual_adjustment',
        source_id: journal.id,
        entry_date: journal.doc_date,
        ledger_id: l.ledger_id,
        description: `${journal.description}${l.memo ? ' — ' + l.memo : ''}`,
        debit_amount: l.dr_amount,
        credit_amount: l.cr_amount,
        running_balance: 0,
      })

      // Update finance_ledgers current balance
      const { data: currLedger } = await supabase
        .from('finance_ledgers')
        .select('current_balance')
        .eq('id', l.ledger_id)
        .single()

      if (currLedger) {
        const newBal = Number(currLedger.current_balance || 0) + delta
        await supabase
          .from('finance_ledgers')
          .update({ current_balance: newBal, updated_at: new Date().toISOString() })
          .eq('id', l.ledger_id)
      }
    }

    await logFinanceAudit('journal_posted', 'journal_entry', journal.id, null, journal)
    return this.getById(journal.id)
  },

  // ── Reverse Journal Entry ────────────────────────────────────────────────
  async reverse(journalId, reason = '') {
    const user = (await supabase.auth.getUser()).data?.user
    const original = await this.getById(journalId)

    if (!original) throw new Error('Journal entry not found.')
    if (original.is_reversed) throw new Error('This journal entry has already been reversed.')

    // 1. Mark original as reversed
    const { error: updErr } = await supabase
      .from('journal_entries')
      .update({
        is_reversed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', journalId)

    if (updErr) throw updErr

    // 2. Prepare reversed lines (swap Debit and Credit)
    const reversedLines = (original.lines || []).map((l, idx) => ({
      account_code: l.account_code,
      account_name: l.account_name,
      dr_amount: l.cr_amount || 0, // Swapped
      cr_amount: l.dr_amount || 0, // Swapped
      memo: `Reversal of line ${l.line_number}: ${l.memo || ''}`.trim(),
      line_number: idx + 1,
    }))

    // 3. Insert Reversal Journal Entry header as draft
    const reversalDesc = `REVERSAL of ${original.description}${reason ? ' (' + reason + ')' : ''}`
    const { data: revJournal, error: revErr } = await supabase
      .from('journal_entries')
      .insert({
        company_id: original.company_id,
        branch_id: original.branch_id,
        doc_date: new Date().toISOString().slice(0, 10),
        description: reversalDesc,
        reference_type: 'reversal',
        reference_id: original.id,
        total_dr: original.total_cr,
        total_cr: original.total_dr,
        is_posted: false,
        posted_by: user?.id || null,
        reversal_id: original.id,
      })
      .select()
      .single()

    if (revErr) throw revErr

    // 4. Insert lines for reversal journal
    const revLinePayloads = reversedLines.map((l) => ({
      journal_id: revJournal.id,
      account_code: l.account_code,
      account_name: l.account_name,
      dr_amount: l.dr_amount,
      cr_amount: l.cr_amount,
      memo: l.memo,
      line_number: l.line_number,
      branch_id: original.branch_id,
    }))

    await supabase.from('journal_lines').insert(revLinePayloads)

    // Mark reversal as posted (locks lines)
    await supabase
      .from('journal_entries')
      .update({
        is_posted: true,
        posted_at: new Date().toISOString(),
      })
      .eq('id', revJournal.id)

    // Update original to link reversal
    await supabase
      .from('journal_entries')
      .update({ reversed_by_id: revJournal.id })
      .eq('id', journalId)

    // 5. Post reversing movements to cashbook & restore ledgers
    for (const l of (original.lines || [])) {
      // Lookup ledger by account_code and branch/company
      let ledgerQuery = supabase
        .from('finance_ledgers')
        .select('id, current_balance')
        .eq('ledger_code', l.account_code)
      if (original.branch_id) {
        ledgerQuery = ledgerQuery.eq('branch_id', original.branch_id)
      }
      let { data: matchedLedger } = await ledgerQuery.maybeSingle()
      if (!matchedLedger) {
        const { data: fallbackList } = await supabase
          .from('finance_ledgers')
          .select('id, current_balance')
          .eq('ledger_code', l.account_code)
          .limit(1)
        matchedLedger = fallbackList?.[0] || null
      }

      if (matchedLedger) {
        // Reverse direction: Credit the original Dr, Debit the original Cr
        const revDr = l.cr_amount || 0
        const revCr = l.dr_amount || 0
        const delta = revDr - revCr

        await supabase.from('finance_cashbook_entries').insert({
          company_id: original.company_id,
          branch_id: original.branch_id,
          source_type: 'manual_adjustment',
          source_id: revJournal.id,
          entry_date: revJournal.doc_date,
          ledger_id: matchedLedger.id,
          description: `REVERSAL of ${original.description}`,
          debit_amount: revDr,
          credit_amount: revCr,
          running_balance: 0,
        })

        const newBal = Number(matchedLedger.current_balance || 0) + delta
        await supabase
          .from('finance_ledgers')
          .update({ current_balance: newBal, updated_at: new Date().toISOString() })
          .eq('id', matchedLedger.id)
      }
    }

    await logFinanceAudit('journal_reversed', 'journal_entry', journalId, original, revJournal)
    return revJournal
  },
}
