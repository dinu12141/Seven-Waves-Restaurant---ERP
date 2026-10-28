// ═══════════════════════════════════════════════════════════════════════════════
// Finance Voucher Service — Pay & Received Vouchers
//
// Workflow: draft → submitted → approved → posted (→ cancelled).
// Posting / cancelling is done ONLY by the post_finance_voucher /
// cancel_finance_voucher RPCs (#134c), which write the balanced GL legs, the
// voucher lines and the cheque. On a v3 RPC the client writes no balances.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logFinanceAudit } from './finance-ledger.service'
import { useAuthStore } from 'src/stores/auth'
import { fetchAllPages } from './finance-statements.service'

// finance_vouchers has TWO FKs to finance_accounts (account_id + bank_id), so the
// embed MUST name the FK explicitly — otherwise PostgREST returns PGRST201 (400)
// "more than one relationship found" and every voucher list/get fails.
const VOUCHER_SELECT = '*, ledger:finance_ledgers(*), account:finance_accounts!account_id(*), bank:finance_accounts!bank_id(*), lines:finance_voucher_lines(*, ledger:finance_ledgers(*))'

const cleanUuid = (val) => (typeof val === 'string' && val.trim() !== '' ? val : null)

// Server rule (post_finance_voucher / cancel_finance_voucher #134c and the
// finance_vouchers RLS policy): only admin, or finance in their own branch, may
// write vouchers. 'manager' is NOT allowed by the DB, so it is not offered here.
export const VOUCHER_ADMIN_ROLES = ['admin', 'super_admin']
export const VOUCHER_WRITE_ROLES = ['admin', 'super_admin', 'finance', 'finance_manager', 'accountant']

/** Every role of the signed-in user (multi-role aware; falls back to the single profile role). */
export function currentRoles(authStore) {
  if (Array.isArray(authStore?.roles) && authStore.roles.length) return authStore.roles
  return [authStore?.userRole, authStore?.profile?.role].filter(Boolean)
}

/** True when the signed-in user may create / approve / post / cancel vouchers. */
export function canWriteVouchers(authStore) {
  return currentRoles(authStore).some((r) => VOUCHER_WRITE_ROLES.includes(r))
}

function assertVoucherRole(action) {
  const roles = currentRoles(useAuthStore())
  if (!roles.some((r) => VOUCHER_WRITE_ROLES.includes(r))) {
    throw new Error(`Unauthorized: Only finance or admin users can ${action} vouchers.`)
  }
  return roles
}

/** Local calendar date (YYYY-MM-DD) — toISOString() is UTC and gives yesterday before 05:30 in Sri Lanka. */
export function localToday(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Pure voucher validation, shared by the form and the service.
 * @param {object} form      voucher fields (+ optional lines)
 * @param {object|null} [account] the selected cash/bank finance_accounts row ({ id, ledger_id });
 *                           undefined = not checked, null = not found
 * @returns {string[]} human-readable errors (empty = valid)
 */
export function validateVoucherDraft(form = {}, account = undefined) {
  const errors = []
  const type = form.voucher_type
  if (type !== 'pay' && type !== 'received') errors.push('Voucher type must be pay or received.')
  if (!form.voucher_date) errors.push('Voucher date is required.')
  const amount = Number(form.amount)
  if (form.amount === null || form.amount === '' || !Number.isFinite(amount) || amount <= 0) errors.push('Amount must be greater than 0.')
  if (type === 'pay' && !String(form.pay_to || '').trim()) errors.push('Pay To is required.')
  if (type === 'received' && !String(form.received_from || '').trim()) errors.push('Received From is required.')
  if (!cleanUuid(form.ledger_id)) errors.push('Category ledger is required.')
  const accId = cleanUuid(form.account_id) || cleanUuid(form.bank_id)
  if (!accId) errors.push('Cash / bank account is required.')
  if (accId && account !== undefined) {
    if (!account) errors.push('The selected cash / bank account was not found.')
    else if (!account.ledger_id) errors.push('The selected cash / bank account has no linked ledger — link it to a ledger first.')
    else if (cleanUuid(form.ledger_id) && account.ledger_id === form.ledger_id) {
      errors.push('The category ledger cannot be the same ledger as the cash / bank account.')
    }
  }
  if (form.payment_method === 'cheque' && form.cheque_no !== undefined && !String(form.cheque_no || '').trim()) {
    errors.push('Cheque No is required for cheque vouchers.')
  }

  const lines = (form.lines || []).filter((l) => cleanUuid(l?.ledger_id))
  let dr = 0
  let cr = 0
  for (const l of lines) {
    const d = Number(l.debit_amount) || 0
    const c = Number(l.credit_amount) || 0
    if (d < 0 || c < 0) errors.push('Voucher line amounts cannot be negative.')
    else if ((d > 0) === (c > 0)) errors.push('Each voucher line needs either a debit or a credit amount.')
    dr += d
    cr += c
  }
  if (lines.length && Math.abs(dr - cr) > 0.01) errors.push(`Voucher lines are not balanced (Dr ${dr} / Cr ${cr}).`)
  return [...new Set(errors)]
}

function lineRowsFor(voucherId, lines) {
  return (lines || [])
    .filter((l) => cleanUuid(l.ledger_id))
    .map((l) => ({
      voucher_id: voucherId,
      ledger_id: l.ledger_id,
      description: l.description || null,
      debit_amount: Number(l.debit_amount) || 0,
      credit_amount: Number(l.credit_amount) || 0,
    }))
}

/**
 * finance_vouchers.cheque_no / cheque_date (#147): the cheque register entry
 * created when the voucher posts takes this number/date. Only for cheque
 * vouchers; cleared otherwise.
 */
export function chequeColumns(form = {}) {
  const isCheque = form.payment_method === 'cheque'
  const no = String(form.cheque_no || '').trim()
  return {
    cheque_no: isCheque && no ? no : null,
    cheque_date: isCheque && no && form.cheque_date ? form.cheque_date : null,
  }
}

/**
 * The cheque number/date are also kept in the narration so they print on the
 * voucher.
 */
export function narrationWithCheque(form = {}) {
  const base = String(form.narration || '').trim()
  if (form.payment_method !== 'cheque' || !String(form.cheque_no || '').trim()) return base || null
  const tag = `Cheque No ${String(form.cheque_no).trim()}${form.cheque_date ? ` dated ${form.cheque_date}` : ''}`
  if (base.includes(tag)) return base
  return base ? `${base} | ${tag}` : tag
}

/**
 * Client-side balance deltas needed to finish a cancel when the DB still runs
 * the legacy #98 cancel_finance_voucher (no `reversal_v3`). Together with the
 * RPC's own category-ledger delta (pay +amt / received −amt) they exactly undo
 * what post_finance_voucher (#127 math) applied:
 *   post pay      : cat ledger +amt, cat accounts +amt, cash acc −amt, cash ledger −amt
 *   post received : cat ledger +amt, cat accounts +amt, cash acc +amt, cash ledger +amt
 * Never used against the live #134c RPCs (they always report ledger_v3 / reversal_v3).
 */
export function voucherLegacyCancelDeltas(voucherType, amount) {
  const amt = Number(amount) || 0
  if (voucherType === 'pay') {
    return { categoryLedger: -2 * amt, categoryAccounts: -amt, cashAccount: amt, cashLedger: amt }
  }
  return { categoryLedger: 0, categoryAccounts: -amt, cashAccount: -amt, cashLedger: -amt }
}

export const financeVoucherService = {
  // ── List ──────────────────────────────────────────────────────────────────
  async list(filters = {}) {
    // Guard: only apply a filter when it is a real, non-empty value. A stray
    // `undefined`/`null`/'' (e.g. branch_id=undefined) would become
    // `col=eq.undefined` and PostgREST 400s (invalid uuid/date).
    const ok = (v) => v !== undefined && v !== null && v !== ''
    // Paged: PostgREST caps a single response at 1000 rows.
    return fetchAllPages(() => {
      let q = supabase.from('finance_vouchers').select(VOUCHER_SELECT).is('deleted_at', null)
        .order('created_at', { ascending: false }).order('id')
      if (ok(filters.voucher_type)) q = q.eq('voucher_type', filters.voucher_type)
      if (ok(filters.status)) q = q.eq('status', filters.status)
      if (ok(filters.branch_id)) q = q.eq('branch_id', filters.branch_id)
      if (ok(filters.date_from)) q = q.gte('voucher_date', filters.date_from)
      if (ok(filters.date_to)) q = q.lte('voucher_date', filters.date_to)
      if (ok(filters.ledger_id)) q = q.eq('ledger_id', filters.ledger_id)
      return q
    })
  },

  async getById(id) {
    const { data, error } = await supabase.from('finance_vouchers').select(VOUCHER_SELECT).eq('id', id).single()
    if (error) throw error
    return data
  },

  // ── Create ────────────────────────────────────────────────────────────────
  async createPayVoucher(form) {
    return this._createVoucher({ ...form, voucher_type: 'pay' })
  },

  async createReceivedVoucher(form) {
    return this._createVoucher({ ...form, voucher_type: 'received' })
  },

  async _createVoucher(form) {
    const authStore = useAuthStore()
    assertVoucherRole('create')
    await this._assertValid(form)
    const voucherNo = await this._generateVoucherNo(form.voucher_type)
    const { lines, ...voucherData } = form
    const narration = narrationWithCheque(voucherData)
    // #147: stored on the voucher; the cheque register takes this number/date
    const chequeFields = chequeColumns(voucherData)
    delete voucherData.cheque_no
    delete voucherData.cheque_date

    const payload = {
      ...voucherData,
      voucher_no: voucherNo,
      status: 'draft',
      approval_status: 'pending',
      amount: Number(voucherData.amount),
      account_id: cleanUuid(voucherData.account_id),
      bank_id: cleanUuid(voucherData.bank_id),
      ledger_id: cleanUuid(voucherData.ledger_id),
      pay_to: voucherData.voucher_type === 'pay' ? voucherData.pay_to || null : null,
      received_from: voucherData.voucher_type === 'received' ? voucherData.received_from || null : null,
      remark: voucherData.remark || null,
      narration,
      company_id: cleanUuid(voucherData.company_id) || cleanUuid(authStore.currentBranch?.company_id) || cleanUuid(authStore.profile?.company_id) || null,
      branch_id: cleanUuid(voucherData.branch_id) || cleanUuid(authStore.currentBranch?.id) || cleanUuid(authStore.profile?.branch_id) || null,
      created_by: cleanUuid(voucherData.created_by) || cleanUuid(authStore.user?.id) || null,
      ...chequeFields,
    }

    const { data: voucher, error } = await supabase.from('finance_vouchers').insert(payload).select().single()
    if (error) throw error

    // Insert voucher lines — never leave a header behind without its lines.
    const lineRows = lineRowsFor(voucher.id, lines)
    if (lineRows.length) {
      const { error: lineErr } = await supabase.from('finance_voucher_lines').insert(lineRows)
      if (lineErr) {
        await supabase.from('finance_vouchers').delete().eq('id', voucher.id).eq('status', 'draft')
        throw lineErr
      }
    }

    await logFinanceAudit('voucher_created', 'finance_voucher', voucher.id, null, voucher)
    return this.getById(voucher.id)
  },

  /** Validates against the live account row (ledger link, ledger ≠ cash ledger). */
  async _assertValid(form) {
    const accId = cleanUuid(form.account_id) || cleanUuid(form.bank_id)
    let account
    if (accId) {
      const { data, error } = await supabase.from('finance_accounts').select('id, ledger_id').eq('id', accId).maybeSingle()
      if (error) throw error
      account = data || null
    }
    const errors = validateVoucherDraft(form, account)
    if (errors.length) throw new Error(errors.join(' '))
  },

  // ── Workflow ──────────────────────────────────────────────────────────────
  async submitVoucher(id) {
    assertVoucherRole('submit')
    const voucher = await this.getById(id)
    if (voucher.status !== 'draft') {
      throw new Error(`Only draft vouchers can be submitted (this one is '${voucher.status}').`)
    }
    return this._updateStatus(id, 'submitted', 'voucher_submitted', voucher, { approval_status: 'pending' })
  },

  async approveVoucher(id, autoPost = true) {
    const userId = (await supabase.auth.getUser()).data?.user?.id
    const roles = assertVoucherRole('approve')
    const voucher = await this.getById(id)

    // Segregation of duties: only an admin may approve a voucher they created.
    const isAdmin = roles.some((r) => VOUCHER_ADMIN_ROLES.includes(r))
    if (voucher.created_by && voucher.created_by === userId && !isAdmin) {
      throw new Error('Creator cannot approve their own voucher')
    }

    if (voucher.status === 'posted') {
      return voucher
    }

    // Workflow: draft → submitted → approved → posted. A draft must be
    // submitted first — no approving straight from draft.
    if (voucher.status !== 'submitted' && voucher.status !== 'approved') {
      throw new Error(`Cannot approve a ${voucher.status} voucher — only submitted vouchers can be approved.`)
    }

    let data = voucher
    if (voucher.status === 'submitted') {
      const now = new Date().toISOString()
      const { data: updated, error } = await supabase.from('finance_vouchers').update({
        status: 'approved', approval_status: 'approved',
        approved_by: userId, approved_at: now,
        updated_by: userId || null, updated_at: now,
      }).eq('id', id).eq('status', 'submitted').select().single()

      if (error) throw error
      data = updated
      await logFinanceAudit('voucher_approved', 'finance_voucher', id, voucher, data)
    }

    if (autoPost) {
      try {
        return await this.postVoucher(id)
      } catch (e) {
        const err = new Error(`Voucher ${voucher.voucher_no} was approved but posting failed: ${e?.message || e}`)
        err.approved = true
        err.cause = e
        throw err
      }
    }

    return data
  },

  async rejectVoucher(id, reason) {
    const userId = (await supabase.auth.getUser()).data?.user?.id
    assertVoucherRole('reject')
    if (!String(reason || '').trim()) throw new Error('A rejection reason is required.')

    const voucher = await this.getById(id)
    if (voucher.status !== 'submitted' && voucher.status !== 'approved') {
      throw new Error(`Only submitted or approved (unposted) vouchers can be rejected (this one is '${voucher.status}').`)
    }

    const { data, error } = await supabase.from('finance_vouchers').update({
      status: 'rejected', approval_status: 'rejected',
      rejected_by: userId, rejected_at: new Date().toISOString(),
      rejection_reason: String(reason).trim(), updated_by: userId || null, updated_at: new Date().toISOString(),
    }).eq('id', id).in('status', ['submitted', 'approved']).select().single()

    if (error) throw error
    await logFinanceAudit('voucher_rejected', 'finance_voucher', id, voucher, data)
    return data
  },

  async postVoucher(id) {
    // P0 #50/#51 / #135 — post atomically in a single DB transaction.
    assertVoucherRole('post')

    const before = await this.getById(id)

    // Security Fix #135: Reject unapproved vouchers. No silent auto-approval bypass.
    if (before.status !== 'approved' && before.status !== 'posted') {
      throw new Error(`Cannot post voucher in '${before.status}' status. Voucher must be approved first by an authorized manager.`)
    }

    const { data: result, error } = await supabase.rpc('post_finance_voucher', {
      p_voucher_id: id,
    })
    if (error) throw error
    if (!result?.success) throw new Error(result?.error || 'Failed to post voucher')

    // The DB is the ONLY writer of header balances. Lines are applied by the
    // client only against a legacy (pre-#134c) RPC that ignored them.
    if (!result.already_posted && !result.ledger_v3) {
      await this._applyLineDeltas(before, +1)
    }
    const after = await this.getById(id)
    if (!result.already_posted) {
      await logFinanceAudit('voucher_posted', 'finance_voucher', id, before, after)
    }
    return after
  },

  async cancelVoucher(id, reason) {
    assertVoucherRole('cancel')

    const before = await this.getById(id)

    const { data: result, error } = await supabase.rpc('cancel_finance_voucher', {
      p_voucher_id: id,
      p_reason: reason || null,
    })
    if (error) throw error
    if (!result?.success) throw new Error(result?.error || 'Failed to cancel voucher')

    if (!result.already_cancelled && !result.reversal_v3 && before.status === 'posted') {
      await this._legacyMirrorCancel(before)
    }

    const after = await this.getById(id)
    if (!result.already_cancelled) {
      await logFinanceAudit('voucher_cancelled', 'finance_voucher', id, before, { ...after, cancel_reason: reason })
    }
    return after
  },

  // Legacy (#98 RPC) cancel completion — see cancelVoucher. Header deltas are
  // derived purely from voucher_type/amount; see voucherLegacyCancelDeltas().
  async _legacyMirrorCancel(before) {
    const amt = Number(before.amount) || 0
    if (amt <= 0) return
    const d = voucherLegacyCancelDeltas(before.voucher_type, amt)

    if (before.ledger_id) {
      await this._addToBalance('finance_ledgers', before.ledger_id, d.categoryLedger)
      const { data: catAccs } = await supabase.from('finance_accounts').select('id').eq('ledger_id', before.ledger_id)
      for (const ca of catAccs || []) {
        await this._addToBalance('finance_accounts', ca.id, d.categoryAccounts)
      }
    }

    const cashAccId = before.account_id || before.bank_id
    if (cashAccId) {
      const { data: cashAcc } = await supabase.from('finance_accounts').select('id, ledger_id').eq('id', cashAccId).single()
      if (cashAcc) {
        await this._addToBalance('finance_accounts', cashAcc.id, d.cashAccount)
        if (cashAcc.ledger_id) await this._addToBalance('finance_ledgers', cashAcc.ledger_id, d.cashLedger)
      }
    }

    await this._applyLineDeltas(before, -1)
  },

  // Applies Σ(debit − credit) of each voucher line to its ledger (sign = +1 on
  // post, −1 on reversal). Only used against the legacy RPC.
  async _applyLineDeltas(voucher, sign) {
    for (const line of voucher.lines || []) {
      if (!line.ledger_id) continue
      const lineDelta = (Number(line.debit_amount) || 0) - (Number(line.credit_amount) || 0)
      if (lineDelta !== 0) await this._addToBalance('finance_ledgers', line.ledger_id, sign * lineDelta)
    }
  },

  async _addToBalance(table, id, delta) {
    if (!delta) return
    const { data, error } = await supabase.from(table).select('current_balance').eq('id', id).single()
    if (error) throw error
    if (!data) return
    const { error: upErr } = await supabase.from(table).update({
      current_balance: Number(data.current_balance || 0) + delta,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (upErr) throw upErr
  },

  // ── Update (draft only) ───────────────────────────────────────────────────
  async updateVoucher(id, updates) {
    assertVoucherRole('edit')
    const voucher = await this.getById(id)
    if (voucher.status !== 'draft' && voucher.status !== 'rejected') {
      throw new Error('Only draft or rejected vouchers can be edited')
    }

    const { lines, ...voucherUpdates } = updates
    const merged = { ...voucher, ...voucherUpdates, voucher_type: voucher.voucher_type, lines: lines ?? voucher.lines }
    await this._assertValid(merged)
    const narration = narrationWithCheque(merged)
    const chequeFields = chequeColumns(merged)
    // Never let an edit touch identity / workflow / embedded columns.
    for (const k of ['cheque_no', 'cheque_date', 'id', 'voucher_no', 'voucher_type', 'status', 'approval_status', 'created_by', 'created_at',
      'approved_by', 'approved_at', 'rejected_by', 'rejected_at', 'posted_by', 'posted_at', 'posting_version', 'deleted_at',
      'ledger', 'account', 'bank', 'idx']) {
      delete voucherUpdates[k]
    }

    const payload = {
      ...voucherUpdates,
      status: 'draft',
      approval_status: 'pending',
      amount: Number(merged.amount),
      account_id: cleanUuid(merged.account_id),
      bank_id: cleanUuid(merged.bank_id),
      ledger_id: cleanUuid(merged.ledger_id),
      pay_to: voucher.voucher_type === 'pay' ? merged.pay_to || null : null,
      received_from: voucher.voucher_type === 'received' ? merged.received_from || null : null,
      remark: merged.remark || null,
      narration,
      rejection_reason: null,
      company_id: cleanUuid(voucherUpdates.company_id) || voucher.company_id || null,
      branch_id: cleanUuid(voucherUpdates.branch_id) || voucher.branch_id || null,
      updated_at: new Date().toISOString(),
      ...chequeFields,
    }

    const { data, error } = await supabase.from('finance_vouchers').update(payload)
      .eq('id', id).in('status', ['draft', 'rejected']).select().single()

    if (error) throw error

    // Replace lines if provided
    if (lines) {
      const { error: delErr } = await supabase.from('finance_voucher_lines').delete().eq('voucher_id', id)
      if (delErr) throw delErr
      const lineRows = lineRowsFor(id, lines)
      if (lineRows.length) {
        const { error: lineErr } = await supabase.from('finance_voucher_lines').insert(lineRows)
        if (lineErr) throw lineErr
      }
    }

    await logFinanceAudit('voucher_updated', 'finance_voucher', id, voucher, data)
    return this.getById(id)
  },

  // ── Approval Queue ────────────────────────────────────────────────────────
  async getApprovalQueue(filters = {}) {
    return this.list({ ...filters, status: 'submitted' })
  },

  // ── Internal helpers ──────────────────────────────────────────────────────
  async _generateVoucherNo(type) {
    // P0 #54 — concurrency-safe sequence-backed numbering (was client count()+1,
    // which produced duplicates when two vouchers were created at once).
    const { data, error } = await supabase.rpc('next_voucher_no', { p_type: type })
    if (error) throw error
    if (!data) throw new Error('Could not allocate a voucher number.')
    return data
  },

  // Status change guarded on the status we read (optimistic lock): a voucher
  // that moved on in the meantime is not overwritten.
  async _updateStatus(id, status, auditAction, old = null, extra = {}) {
    if (!old) old = await this.getById(id)
    const { data, error } = await supabase.from('finance_vouchers')
      .update({ ...extra, status, updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', old.status).select().single()
    if (error) throw error
    await logFinanceAudit(auditAction, 'finance_voucher', id, old, data)
    return data
  },

  // NOTE: cashbook legs and cheques are created ONLY by the post_finance_voucher
  // RPC (#134c), and reversed only by cancel_finance_voucher. The old client
  // helpers (_createCashbookEntry / _createReversalCashbookEntry /
  // _createChequeFromVoucher) wrote GL rows directly and were removed.
}
