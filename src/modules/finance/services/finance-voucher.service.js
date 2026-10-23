// ═══════════════════════════════════════════════════════════════════════════════
// Finance Voucher Service — Pay & Received Vouchers
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logFinanceAudit } from './finance-ledger.service'
import { useAuthStore } from 'src/stores/auth'

// finance_vouchers has TWO FKs to finance_accounts (account_id + bank_id), so the
// embed MUST name the FK explicitly — otherwise PostgREST returns PGRST201 (400)
// "more than one relationship found" and every voucher list/get fails.
const VOUCHER_SELECT = '*, ledger:finance_ledgers(*), account:finance_accounts!account_id(*), bank:finance_accounts!bank_id(*), lines:finance_voucher_lines(*, ledger:finance_ledgers(*))'

const cleanUuid = (val) => (typeof val === 'string' && val.trim() !== '' ? val : null)

export const financeVoucherService = {
  // ── List ──────────────────────────────────────────────────────────────────
  async list(filters = {}) {
    // Guard: only apply a filter when it is a real, non-empty value. A stray
    // `undefined`/`null`/'' (e.g. branch_id=undefined) would become
    // `col=eq.undefined` and PostgREST 400s (invalid uuid/date). This keeps the
    // voucher list from breaking on a half-initialised filter object.
    const ok = (v) => v !== undefined && v !== null && v !== ''
    let q = supabase.from('finance_vouchers').select(VOUCHER_SELECT).is('deleted_at', null).order('created_at', { ascending: false })
    if (ok(filters.voucher_type)) q = q.eq('voucher_type', filters.voucher_type)
    if (ok(filters.status)) q = q.eq('status', filters.status)
    if (ok(filters.branch_id)) q = q.eq('branch_id', filters.branch_id)
    if (ok(filters.date_from)) q = q.gte('voucher_date', filters.date_from)
    if (ok(filters.date_to)) q = q.lte('voucher_date', filters.date_to)
    if (ok(filters.ledger_id)) q = q.eq('ledger_id', filters.ledger_id)
    const { data, error } = await q
    if (error) throw error
    return data || []
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
    const voucherNo = await this._generateVoucherNo(form.voucher_type)
    const { lines, ...voucherData } = form
    delete voucherData.cheque_no
    delete voucherData.cheque_date

    const payload = {
      ...voucherData,
      voucher_no: voucherNo,
      status: 'draft',
      approval_status: 'pending',
      account_id: cleanUuid(voucherData.account_id),
      bank_id: cleanUuid(voucherData.bank_id),
      ledger_id: cleanUuid(voucherData.ledger_id),
      pay_to: voucherData.pay_to || null,
      received_from: voucherData.received_from || null,
      remark: voucherData.remark || null,
      narration: voucherData.narration || null,
      company_id: cleanUuid(voucherData.company_id) || cleanUuid(authStore.currentBranch?.company_id) || cleanUuid(authStore.profile?.company_id) || null,
      branch_id: cleanUuid(voucherData.branch_id) || cleanUuid(authStore.currentBranch?.id) || cleanUuid(authStore.profile?.branch_id) || null,
      created_by: cleanUuid(voucherData.created_by) || cleanUuid(authStore.user?.id) || null,
    }

    const { data: voucher, error } = await supabase.from('finance_vouchers').insert(payload).select().single()
    if (error) throw error

    // Insert voucher lines if provided
    if (lines?.length) {
      const lineRows = lines
        .filter(l => cleanUuid(l.ledger_id))
        .map(l => ({
          voucher_id: voucher.id,
          ledger_id: l.ledger_id,
          description: l.description || null,
          debit_amount: Number(l.debit_amount) || 0,
          credit_amount: Number(l.credit_amount) || 0,
        }))
      if (lineRows.length) {
        const { error: lineErr } = await supabase.from('finance_voucher_lines').insert(lineRows)
        if (lineErr) throw lineErr
      }
    }

    await logFinanceAudit('voucher_created', 'finance_voucher', voucher.id, null, voucher)
    return this.getById(voucher.id)
  },

  // ── Workflow ──────────────────────────────────────────────────────────────
  async submitVoucher(id) {
    return this._updateStatus(id, 'submitted', 'voucher_submitted')
  },

  async approveVoucher(id, autoPost = true) {
    const userId = (await supabase.auth.getUser()).data?.user?.id
    const authStore = useAuthStore()
    const voucher = await this.getById(id)

    const role = authStore.userRole || authStore.profile?.role
    const isAdminOrManager = !role || role === 'admin' || role === 'super_admin' || role === 'manager' || role === 'owner'

    // Self-approval check (allowed for admin/super_admin/manager/owner roles or single-user operation)
    if (voucher.created_by === userId && !isAdminOrManager) {
      throw new Error('Creator cannot approve their own voucher')
    }

    if (voucher.status === 'posted') {
      return voucher
    }

    if (voucher.status === 'rejected' || voucher.status === 'cancelled') {
      throw new Error(`Cannot approve a ${voucher.status} voucher`)
    }

    let data = voucher
    if (voucher.status !== 'approved') {
      const { data: updated, error } = await supabase.from('finance_vouchers').update({
        status: 'approved', approval_status: 'approved',
        approved_by: userId, approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id).select().single()

      if (error) throw error
      data = updated
      await logFinanceAudit('voucher_approved', 'finance_voucher', id, voucher, data)
    }

    if (autoPost) {
      return this.postVoucher(id)
    }

    return data
  },

  async rejectVoucher(id, reason) {
    const userId = (await supabase.auth.getUser()).data?.user?.id
    const voucher = await this.getById(id)

    const { data, error } = await supabase.from('finance_vouchers').update({
      status: 'rejected', approval_status: 'rejected',
      rejected_by: userId, rejected_at: new Date().toISOString(),
      rejection_reason: reason, updated_at: new Date().toISOString(),
    }).eq('id', id).select().single()

    if (error) throw error
    await logFinanceAudit('voucher_rejected', 'finance_voucher', id, voucher, data)
    return data
  },

  async postVoucher(id) {
    // P0 #50/#51 — post atomically in a single DB transaction. The RPC guards
    // against the double-post race (WHERE status='approved'), writes the
    // cashbook + optional cheque, and applies the ledger balance as an in-DB
    // delta (no read-modify-write => no lost update).
    const before = await this.getById(id)

    if (before.status !== 'approved' && before.status !== 'posted') {
      const userId = (await supabase.auth.getUser()).data?.user?.id
      await supabase.from('finance_vouchers').update({
        status: 'approved', approval_status: 'approved',
        approved_by: userId, approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id)
    }

    const { data: result, error } = await supabase.rpc('post_finance_voucher', {
      p_voucher_id: id,
    })
    if (error) throw error
    if (!result?.success) throw new Error(result?.error || 'Failed to post voucher')

    // Double-entry balance updates for ledgers and accounts (if not already handled in DB RPC)
    const amt = Number(before.amount) || 0
    if (amt > 0 && !result.already_posted && !result.double_entry_v2) {
      if (before.voucher_type === 'pay') {
        // 1. Expense / Category Ledger (before.ledger_id):
        // Note: post_finance_voucher RPC subtracted amt (v_delta = -amt).
        // For an expense (e.g. Electricity), the expense incurred increases (+amt).
        // To fix (current - amt) to (current + amt), we add 2 * amt:
        if (before.ledger_id) {
          const { data: catLed } = await supabase.from('finance_ledgers').select('current_balance').eq('id', before.ledger_id).single()
          if (catLed) {
            await supabase.from('finance_ledgers').update({
              current_balance: Number(catLed.current_balance || 0) + (2 * amt),
              updated_at: new Date().toISOString(),
            }).eq('id', before.ledger_id)
          }

          // If there is an account in finance_accounts linked to this expense ledger, increase its balance (+amt)
          const { data: catAccs } = await supabase.from('finance_accounts').select('id, current_balance').eq('ledger_id', before.ledger_id)
          if (catAccs?.length) {
            for (const ca of catAccs) {
              await supabase.from('finance_accounts').update({
                current_balance: Number(ca.current_balance || 0) + amt,
                updated_at: new Date().toISOString(),
              }).eq('id', ca.id)
            }
          }
        }

        // 2. Paying Cash / Bank Account (before.account_id or before.bank_id):
        // Cash reduces (-amt)
        const cashAccId = before.account_id || before.bank_id
        if (cashAccId) {
          const { data: payAcc } = await supabase.from('finance_accounts').select('id, current_balance, ledger_id').eq('id', cashAccId).single()
          if (payAcc) {
            // Deduct Cash Account (-amt)
            await supabase.from('finance_accounts').update({
              current_balance: Number(payAcc.current_balance || 0) - amt,
              updated_at: new Date().toISOString(),
            }).eq('id', payAcc.id)

            // Deduct Cash Ledger in finance_ledgers (-amt)
            if (payAcc.ledger_id) {
              const { data: payLed } = await supabase.from('finance_ledgers').select('current_balance').eq('id', payAcc.ledger_id).single()
              if (payLed) {
                await supabase.from('finance_ledgers').update({
                  current_balance: Number(payLed.current_balance || 0) - amt,
                  updated_at: new Date().toISOString(),
                }).eq('id', payAcc.ledger_id)
              }
            }
          }
        }
      } else {
        // Received Voucher:
        // 1. Cash / Bank Account receives money (+amt)
        const cashAccId = before.account_id || before.bank_id
        if (cashAccId) {
          const { data: recAcc } = await supabase.from('finance_accounts').select('id, current_balance, ledger_id').eq('id', cashAccId).single()
          if (recAcc) {
            await supabase.from('finance_accounts').update({
              current_balance: Number(recAcc.current_balance || 0) + amt,
              updated_at: new Date().toISOString(),
            }).eq('id', recAcc.id)

            if (recAcc.ledger_id) {
              const { data: recLed } = await supabase.from('finance_ledgers').select('current_balance').eq('id', recAcc.ledger_id).single()
              if (recLed) {
                await supabase.from('finance_ledgers').update({
                  current_balance: Number(recLed.current_balance || 0) + amt,
                  updated_at: new Date().toISOString(),
                }).eq('id', recAcc.ledger_id)
              }
            }
          }
        }

        // 2. Category / Income Account (if any) linked to ledger
        if (before.ledger_id) {
          const { data: incAccs } = await supabase.from('finance_accounts').select('id, current_balance').eq('ledger_id', before.ledger_id)
          if (incAccs?.length) {
            for (const ia of incAccs) {
              await supabase.from('finance_accounts').update({
                current_balance: Number(ia.current_balance || 0) + amt,
                updated_at: new Date().toISOString(),
              }).eq('id', ia.id)
            }
          }
        }
      }

      // 3. Multi-ledger lines (if any)
      if (before.lines?.length) {
        for (const line of before.lines) {
          if (line.ledger_id) {
            const lineDelta = (Number(line.debit_amount) || 0) - (Number(line.credit_amount) || 0)
            if (lineDelta !== 0) {
              const { data: lineLed } = await supabase.from('finance_ledgers').select('current_balance').eq('id', line.ledger_id).single()
              if (lineLed) {
                await supabase.from('finance_ledgers').update({
                  current_balance: Number(lineLed.current_balance || 0) + lineDelta,
                  updated_at: new Date().toISOString(),
                }).eq('id', line.ledger_id)
              }
            }
          }
        }
      }
    }

    const after = await this.getById(id)
    if (!result.already_posted) {
      await logFinanceAudit('voucher_posted', 'finance_voucher', id, before, after)
    }
    return after
  },

  async cancelVoucher(id, reason) {
    // #98 — cancel atomically via RPC. The SECURITY DEFINER cancel_finance_voucher
    // row-locks the voucher and, for POSTED vouchers, writes the reversal cashbook
    // entry, applies the inverse ledger delta in-DB (no read-modify-write / lost
    // update), and voids any issued cheque — all in ONE transaction. Replaces the
    // previous non-atomic client 3-step reversal (partial-commit family, same as
    // post #50/#51). Mirrors postVoucher's before/after + audit pattern.
    const before = await this.getById(id)

    const { data: result, error } = await supabase.rpc('cancel_finance_voucher', {
      p_voucher_id: id,
      p_reason: reason || null,
    })
    if (error) throw error
    if (!result?.success) throw new Error(result?.error || 'Failed to cancel voucher')

    const after = await this.getById(id)
    if (!result.already_cancelled) {
      const amt = Number(before.amount) || 0
      if (amt > 0 && before.status === 'posted') {
        if (before.voucher_type === 'pay') {
          // Revert Expense Ledger: RPC added amt back, so we subtract (2 * amt) to revert:
          if (before.ledger_id) {
            const { data: catLed } = await supabase.from('finance_ledgers').select('current_balance').eq('id', before.ledger_id).single()
            if (catLed) {
              await supabase.from('finance_ledgers').update({
                current_balance: Number(catLed.current_balance || 0) - (2 * amt),
                updated_at: new Date().toISOString(),
              }).eq('id', before.ledger_id)
            }
            const { data: catAccs } = await supabase.from('finance_accounts').select('id, current_balance').eq('ledger_id', before.ledger_id)
            if (catAccs?.length) {
              for (const ca of catAccs) {
                await supabase.from('finance_accounts').update({
                  current_balance: Number(ca.current_balance || 0) - amt,
                  updated_at: new Date().toISOString(),
                }).eq('id', ca.id)
              }
            }
          }

          // Revert Cash Account & Linked Ledger (+amt)
          const cashAccId = before.account_id || before.bank_id
          if (cashAccId) {
            const { data: payAcc } = await supabase.from('finance_accounts').select('id, current_balance, ledger_id').eq('id', cashAccId).single()
            if (payAcc) {
              await supabase.from('finance_accounts').update({
                current_balance: Number(payAcc.current_balance || 0) + amt,
                updated_at: new Date().toISOString(),
              }).eq('id', payAcc.id)

              if (payAcc.ledger_id) {
                const { data: payLed } = await supabase.from('finance_ledgers').select('current_balance').eq('id', payAcc.ledger_id).single()
                if (payLed) {
                  await supabase.from('finance_ledgers').update({
                    current_balance: Number(payLed.current_balance || 0) + amt,
                    updated_at: new Date().toISOString(),
                  }).eq('id', payAcc.ledger_id)
                }
              }
            }
          }
        } else {
          // Revert Received Voucher: Cash Account & Linked Ledger (-amt)
          const cashAccId = before.account_id || before.bank_id
          if (cashAccId) {
            const { data: recAcc } = await supabase.from('finance_accounts').select('id, current_balance, ledger_id').eq('id', cashAccId).single()
            if (recAcc) {
              await supabase.from('finance_accounts').update({
                current_balance: Number(recAcc.current_balance || 0) - amt,
                updated_at: new Date().toISOString(),
              }).eq('id', recAcc.id)

              if (recAcc.ledger_id) {
                const { data: recLed } = await supabase.from('finance_ledgers').select('current_balance').eq('id', recAcc.ledger_id).single()
                if (recLed) {
                  await supabase.from('finance_ledgers').update({
                    current_balance: Number(recLed.current_balance || 0) - amt,
                    updated_at: new Date().toISOString(),
                  }).eq('id', recAcc.ledger_id)
                }
              }
            }
          }
          if (before.ledger_id) {
            const { data: incAccs } = await supabase.from('finance_accounts').select('id, current_balance').eq('ledger_id', before.ledger_id)
            if (incAccs?.length) {
              for (const ia of incAccs) {
                await supabase.from('finance_accounts').update({
                  current_balance: Number(ia.current_balance || 0) - amt,
                  updated_at: new Date().toISOString(),
                }).eq('id', ia.id)
              }
            }
          }
        }

        // 3. Multi-ledger lines (if any)
        if (before.lines?.length) {
          for (const line of before.lines) {
            if (line.ledger_id) {
              const lineDelta = (Number(line.debit_amount) || 0) - (Number(line.credit_amount) || 0)
              if (lineDelta !== 0) {
                const { data: lineLed } = await supabase.from('finance_ledgers').select('current_balance').eq('id', line.ledger_id).single()
                if (lineLed) {
                  await supabase.from('finance_ledgers').update({
                    current_balance: Number(lineLed.current_balance || 0) - lineDelta,
                    updated_at: new Date().toISOString(),
                  }).eq('id', line.ledger_id)
                }
              }
            }
          }
        }
      }
      await logFinanceAudit('voucher_cancelled', 'finance_voucher', id, before, { ...after, cancel_reason: reason })
    }
    return after
  },

  // ── Update (draft only) ───────────────────────────────────────────────────
  async updateVoucher(id, updates) {
    const voucher = await this.getById(id)
    if (voucher.status !== 'draft' && voucher.status !== 'rejected') {
      throw new Error('Only draft or rejected vouchers can be edited')
    }

    const { lines, ...voucherUpdates } = updates

    const payload = {
      ...voucherUpdates,
      status: 'draft',
      approval_status: 'pending',
      account_id: cleanUuid(voucherUpdates.account_id),
      bank_id: cleanUuid(voucherUpdates.bank_id),
      ledger_id: cleanUuid(voucherUpdates.ledger_id),
      pay_to: voucherUpdates.pay_to || null,
      received_from: voucherUpdates.received_from || null,
      remark: voucherUpdates.remark || null,
      narration: voucherUpdates.narration || null,
      company_id: cleanUuid(voucherUpdates.company_id) || voucher.company_id || null,
      branch_id: cleanUuid(voucherUpdates.branch_id) || voucher.branch_id || null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase.from('finance_vouchers').update(payload).eq('id', id).select().single()

    if (error) throw error

    // Replace lines if provided
    if (lines) {
      await supabase.from('finance_voucher_lines').delete().eq('voucher_id', id)
      const lineRows = lines
        .filter(l => cleanUuid(l.ledger_id))
        .map(l => ({
          voucher_id: id,
          ledger_id: l.ledger_id,
          description: l.description || null,
          debit_amount: Number(l.debit_amount) || 0,
          credit_amount: Number(l.credit_amount) || 0,
        }))
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
    return data
  },

  async _updateStatus(id, status, auditAction) {
    const old = await this.getById(id)
    const { data, error } = await supabase.from('finance_vouchers').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    await logFinanceAudit(auditAction, 'finance_voucher', id, old, data)
    return data
  },

  async _createCashbookEntry(voucher) {
    const sourceType = voucher.voucher_type === 'pay' ? 'pay_voucher' : 'received_voucher'
    const entry = {
      company_id: voucher.company_id,
      branch_id: voucher.branch_id,
      source_type: sourceType,
      source_id: voucher.id,
      entry_date: voucher.voucher_date,
      ledger_id: voucher.ledger_id,
      account_id: voucher.account_id,
      description: `${voucher.voucher_no} — ${voucher.remark || voucher.narration || ''}`.trim(),
      debit_amount: voucher.voucher_type === 'pay' ? Number(voucher.amount) : 0,
      credit_amount: voucher.voucher_type === 'received' ? Number(voucher.amount) : 0,
      running_balance: 0,
    }
    const { error } = await supabase.from('finance_cashbook_entries').insert(entry)
    if (error) console.error('[Cashbook]', error)
  },

  async _createReversalCashbookEntry(voucher) {
    const sourceType = voucher.voucher_type === 'pay' ? 'pay_voucher' : 'received_voucher'
    const entry = {
      company_id: voucher.company_id,
      branch_id: voucher.branch_id,
      source_type: sourceType,
      source_id: voucher.id,
      entry_date: new Date().toISOString().split('T')[0],
      ledger_id: voucher.ledger_id,
      account_id: voucher.account_id,
      description: `REVERSAL: ${voucher.voucher_no}`,
      debit_amount: voucher.voucher_type === 'received' ? Number(voucher.amount) : 0,
      credit_amount: voucher.voucher_type === 'pay' ? Number(voucher.amount) : 0,
      running_balance: 0,
    }
    await supabase.from('finance_cashbook_entries').insert(entry)
  },

  async _createChequeFromVoucher(voucher) {
    const { error } = await supabase.from('finance_cheques').insert({
      company_id: voucher.company_id,
      branch_id: voucher.branch_id,
      voucher_id: voucher.id,
      bank_account_id: voucher.bank_id || voucher.account_id,
      cheque_no: voucher.cheque_id || `CHQ-${voucher.voucher_no}`,
      cheque_date: voucher.voucher_date,
      issued_to: voucher.pay_to,
      amount: Number(voucher.amount),
      status: 'issued',
    })
    if (error) console.error('[Cheque]', error)
  },

  async _updateLedgerBalance(voucher) {
    const amt = Number(voucher.amount)
    const delta = voucher.voucher_type === 'pay' ? -amt : amt
    await supabase.rpc('increment_field', { table_name: 'finance_ledgers', row_id: voucher.ledger_id, field_name: 'current_balance', increment_by: delta }).catch(() => {
      // Fallback: manual update
      supabase.from('finance_ledgers').select('current_balance').eq('id', voucher.ledger_id).single().then(({ data }) => {
        if (data) supabase.from('finance_ledgers').update({ current_balance: Number(data.current_balance) + delta }).eq('id', voucher.ledger_id)
      })
    })
  },

  async _reverseLedgerBalance(voucher) {
    const amt = Number(voucher.amount)
    const delta = voucher.voucher_type === 'pay' ? amt : -amt
    await supabase.from('finance_ledgers').select('current_balance').eq('id', voucher.ledger_id).single().then(({ data }) => {
      if (data) supabase.from('finance_ledgers').update({ current_balance: Number(data.current_balance) + delta }).eq('id', voucher.ledger_id)
    })
  },
}
