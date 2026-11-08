// ═══════════════════════════════════════════════════════════════════════════
// Tax Settlement Service
// Handles periodic VAT reconciliation and IRD remittance:
//   1. Debit Output VAT Payable (2006 Liability - clearing liability)
//   2. Credit Input VAT - Recoverable (1010 Asset - offsetting tax asset)
//   3. Credit Bank Account for net remittance to Inland Revenue Department
// Seven Waves Restaurant ERP
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'

export interface VatSettlementPayload {
  companyId?: string
  branchId?: string
  periodMonth: string // 'YYYY-MM'
  periodDate: string  // 'YYYY-MM-DD'
  accountId: string   // finance_accounts id
  paymentMethod: 'bank_transfer' | 'cheque' | 'cash'
  paymentRef?: string
  outputVatClear: number
  inputVatOffset: number
  notes?: string
}

export interface PayingAccount {
  id: string
  registered_name?: string
  name?: string
  account_type: string
  account_number?: string
  bank_name?: string
  current_balance?: number
  ledger_id: string
  ledger?: {
    ledger_code: string
    ledger_name: string
  }
}

export const taxSettlementService = {
  /**
   * Fetches active bank and cash accounts capable of remitting tax to IRD.
   */
  async fetchPayingAccounts(): Promise<PayingAccount[]> {
    const { data, error } = await supabase
      .from('finance_accounts')
      .select('id, registered_name, account_type, account_number, bank_name, current_balance, ledger_id, ledger:finance_ledgers(ledger_code, ledger_name)')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('registered_name')

    if (error) {
      console.error('[TaxSettlement] fetchPayingAccounts error:', error)
      return []
    }
    return (data || []).map((a: any) => ({
      ...a,
      name: a.registered_name || a.bank_name || 'Account',
    })) as PayingAccount[]
  },

  /**
   * Records a balanced VAT Settlement transaction:
   *   Dr 2006 Output VAT (clear liability)
   *   Cr 1010 Input VAT (offset asset)
   *   Cr Bank (net remittance to IRD) OR Dr Bank (if refund)
   */
  async recordVatSettlement(payload: VatSettlementPayload) {
    const netPay = Math.round((Number(payload.outputVatClear || 0) - Number(payload.inputVatOffset || 0)) * 100) / 100

    // Fetch the 2006 and 1010 VAT ledgers
    const { data: ledgers, error: legErr } = await supabase
      .from('finance_ledgers')
      .select('id, company_id, ledger_code, ledger_name, current_balance')
      .in('ledger_code', ['2006', '1010'])
      .is('deleted_at', null)

    if (legErr || !ledgers || ledgers.length === 0) {
      throw new Error('Could not find VAT ledgers (2006 / 1010): ' + (legErr?.message || ''))
    }

    const outLedger = ledgers.find((l) => l.ledger_code === '2006')
    const inpLedger = ledgers.find((l) => l.ledger_code === '1010')

    if (!outLedger || !inpLedger) {
      throw new Error('Both 2006 Output VAT and 1010 Input VAT ledgers are required.')
    }

    const companyId = payload.companyId || outLedger.company_id || ledgers[0].company_id

    const { data: bankAcc, error: bankErr } = await supabase
      .from('finance_accounts')
      .select('id, ledger_id, registered_name')
      .eq('id', payload.accountId)
      .single()

    if (bankErr || !bankAcc || !bankAcc.ledger_id) {
      throw new Error('Selected bank/cash account not found or has no linked ledger.')
    }

    const settleId = crypto.randomUUID()
    const desc = `IRD VAT Settlement ${payload.periodMonth}${payload.paymentRef ? ' | Ref: ' + payload.paymentRef : ''}${payload.notes ? ' — ' + payload.notes : ''}`

    // Leg 1: Debit 2006 Output VAT (clear liability)
    if (payload.outputVatClear > 0) {
      const { error: err1 } = await supabase.rpc('fn_fin_post_leg', {
        p_company_id: companyId,
        p_branch_id: payload.branchId || null,
        p_source_type: 'manual_adjustment',
        p_source_id: settleId,
        p_entry_date: payload.periodDate,
        p_ledger_id: outLedger.id,
        p_account_id: null,
        p_description: `${desc} (Clear Output VAT)`,
        p_debit: payload.outputVatClear,
        p_credit: 0,
      })
      if (err1) {
        throw new Error(`Failed to clear Output VAT: ${err1.message}`)
      }
    }

    // Leg 2: Credit 1010 Input VAT (offset asset credit)
    if (payload.inputVatOffset > 0) {
      const { error: err2 } = await supabase.rpc('fn_fin_post_leg', {
        p_company_id: companyId,
        p_branch_id: payload.branchId || null,
        p_source_type: 'manual_adjustment',
        p_source_id: settleId,
        p_entry_date: payload.periodDate,
        p_ledger_id: inpLedger.id,
        p_account_id: null,
        p_description: `${desc} (Offset Input VAT Asset Credit)`,
        p_debit: 0,
        p_credit: payload.inputVatOffset,
      })
      if (err2) {
        throw new Error(`Failed to offset Input VAT: ${err2.message}`)
      }
    }

    // Leg 3: Net Cash/Bank leg
    if (netPay > 0) {
      // Net remittance paid to IRD: Cr Bank
      const { error: err3 } = await supabase.rpc('fn_fin_post_leg', {
        p_company_id: companyId,
        p_branch_id: payload.branchId || null,
        p_source_type: 'manual_adjustment',
        p_source_id: settleId,
        p_entry_date: payload.periodDate,
        p_ledger_id: bankAcc.ledger_id,
        p_account_id: bankAcc.id,
        p_description: `${desc} (Net Remittance to IRD)`,
        p_debit: 0,
        p_credit: netPay,
      })
      if (err3) {
        throw new Error(`Failed to post bank remittance leg: ${err3.message}`)
      }
    } else if (netPay < 0) {
      // Net refund received: Dr Bank
      const { error: err3 } = await supabase.rpc('fn_fin_post_leg', {
        p_company_id: companyId,
        p_branch_id: payload.branchId || null,
        p_source_type: 'manual_adjustment',
        p_source_id: settleId,
        p_entry_date: payload.periodDate,
        p_ledger_id: bankAcc.ledger_id,
        p_account_id: bankAcc.id,
        p_description: `${desc} (Net Refund Claimed from IRD)`,
        p_debit: Math.abs(netPay),
        p_credit: 0,
      })
      if (err3) {
        throw new Error(`Failed to post bank refund leg: ${err3.message}`)
      }
    }

    return {
      success: true,
      settlement_id: settleId,
      output_cleared: payload.outputVatClear,
      input_offset: payload.inputVatOffset,
      net_paid: netPay,
    }
  },
}
