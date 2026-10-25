// ═══════════════════════════════════════════════════════════════════════════════
// Finance Statements Service — Trial Balance, P&L, Balance Sheet
// Seven Waves Restaurant (Pvt) Ltd
// Matches exact structure of Chart OF Accounts UPDATED.xlsx
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'

export const financeStatementsService = {
  // ── 1. Trial Balance ────────────────────────────────────────────────────────
  async generateTrialBalance(filters = {}) {
    let q = supabase
      .from('finance_ledgers')
      .select('*')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('ledger_code')

    if (filters.branch_id) q = q.eq('branch_id', filters.branch_id)
    const { data: ledgers, error: lErr } = await q
    if (lErr) throw lErr

    let eq = supabase
      .from('finance_cashbook_entries')
      .select('ledger_id, debit_amount, credit_amount, entry_date')

    if (filters.branch_id) eq = eq.eq('branch_id', filters.branch_id)
    if (filters.date_from) eq = eq.gte('entry_date', filters.date_from)
    if (filters.date_to) eq = eq.lte('entry_date', filters.date_to)
    const { data: entries, error: eErr } = await eq
    if (eErr) throw eErr

    const entryMap = {}
    ;(entries || []).forEach(e => {
      if (!entryMap[e.ledger_id]) entryMap[e.ledger_id] = { debit: 0, credit: 0 }
      entryMap[e.ledger_id].debit += Number(e.debit_amount || 0)
      entryMap[e.ledger_id].credit += Number(e.credit_amount || 0)
    })

    const rows = (ledgers || []).map(l => {
      const opening = Number(l.opening_balance || 0)
      const openingDebit = l.opening_balance_type === 'debit' ? opening : 0
      const openingCredit = l.opening_balance_type === 'credit' ? opening : 0
      const periodDebit = entryMap[l.id]?.debit || 0
      const periodCredit = entryMap[l.id]?.credit || 0
      const closingDebit = openingDebit + periodDebit
      const closingCredit = openingCredit + periodCredit
      const currentBalance = Number(l.current_balance || 0)

      return {
        id: l.id,
        ledger_code: l.ledger_code,
        ledger_name: l.ledger_name.trim(),
        ledger_type: l.ledger_type,
        ledger_nature: l.ledger_nature,
        account_group: l.account_group || '',
        current_balance: currentBalance,
        opening_debit: openingDebit,
        opening_credit: openingCredit,
        period_debit: periodDebit,
        period_credit: periodCredit,
        closing_debit: closingDebit,
        closing_credit: closingCredit,
      }
    })

    // Filter to rows with activity or non-zero balance for the TB table view
    const displayRows = rows.filter(
      r => r.closing_debit !== 0 || r.closing_credit !== 0 || r.current_balance !== 0
    )

    const totalDebit = displayRows.reduce((s, r) => s + r.closing_debit, 0)
    const totalCredit = displayRows.reduce((s, r) => s + r.closing_credit, 0)

    return {
      rows: displayRows,
      allLedgers: rows,
      totalDebit,
      totalCredit,
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
      generated_at: new Date().toISOString(),
    }
  },

  // ── 2. Profit & Loss (Statement of Profit and Loss) ─────────────────────────
  async generateProfitLoss(filters = {}) {
    const tb = await this.generateTrialBalance(filters)
    const all = tb.allLedgers || tb.rows

    // Helper to compute net P&L amount for a ledger
    // For income: credit - debit (or current_balance if nature is credit)
    // For expense: debit - credit (or current_balance if nature is debit)
    const getAmount = (l) => {
      if (l.closing_credit !== 0 || l.closing_debit !== 0) {
        return l.ledger_type === 'income'
          ? l.closing_credit - l.closing_debit
          : l.closing_debit - l.closing_credit
      }
      return Number(l.current_balance || 0)
    }

    // 1. REVENUE (5000)
    const revenueItems = all
      .filter(l => l.ledger_type === 'income' && (l.account_group === 'Revenue' || l.ledger_code === '5000'))
      .map(l => ({ code: l.ledger_code, name: l.ledger_name, amount: getAmount(l) }))
    const totalRevenue = revenueItems.reduce((s, i) => s + i.amount, 0)

    // 2. OTHER INCOME (5001 - 5007)
    const otherIncomeItems = all
      .filter(l => l.ledger_type === 'income' && l.account_group === 'Other Income')
      .map(l => ({ code: l.ledger_code, name: l.ledger_name, amount: getAmount(l) }))
    const totalOtherIncome = otherIncomeItems.reduce((s, i) => s + i.amount, 0)

    const totalIncome = totalRevenue + totalOtherIncome

    // 3. COST OF GOODS SOLD (COGS) (6000 - 6005)
    const cogsItems = all
      .filter(l => l.ledger_type === 'expense' && (l.account_group === 'Cost of Sales' || l.ledger_code.startsWith('600')))
      .map(l => ({ code: l.ledger_code, name: l.ledger_name, amount: getAmount(l) }))
    const totalCogs = cogsItems.reduce((s, i) => s + i.amount, 0)

    const grossProfit = totalIncome - totalCogs

    // 4. EXPENSES
    // 4a. Admin & Operation Expenses (7000 - 7042)
    const adminItems = all
      .filter(l => l.ledger_type === 'expense' && l.account_group === 'Admin and Operation Expenses' && l.ledger_code !== '7043')
      .map(l => ({ code: l.ledger_code, name: l.ledger_name, amount: getAmount(l) }))
    const totalAdmin = adminItems.reduce((s, i) => s + i.amount, 0)

    // 4b. Selling & Distribution Expenses (8001 - 8005)
    const sellingItems = all
      .filter(l => l.ledger_type === 'expense' && l.account_group === 'Selling and Distribution')
      .map(l => ({ code: l.ledger_code, name: l.ledger_name, amount: getAmount(l) }))
    const totalSelling = sellingItems.reduce((s, i) => s + i.amount, 0)

    // 4c. Finance & Other Expenses (9000 - 9002, 10000, 10002)
    const financeOtherItems = all
      .filter(l => l.ledger_type === 'expense' && (l.account_group === 'Finance Expenses' || l.account_group === 'Other Expenses'))
      .map(l => ({ code: l.ledger_code, name: l.ledger_name, amount: getAmount(l) }))
    const totalFinanceOther = financeOtherItems.reduce((s, i) => s + i.amount, 0)

    const totalExpenses = totalAdmin + totalSelling + totalFinanceOther
    const netProfitBeforeTax = grossProfit - totalExpenses

    // 5. TAX (7043: Corporate Income Tax)
    const taxLedger = all.find(l => l.ledger_code === '7043')
    const taxAmount = taxLedger ? getAmount(taxLedger) : 0
    const netProfit = netProfitBeforeTax - taxAmount

    const periodStr = filters.date_from && filters.date_to
      ? `FOR THE PERIOD OF ${filters.date_from} TO ${filters.date_to}`
      : filters.date_from
      ? `FROM ${filters.date_from} TO DATE`
      : 'FOR THE CURRENT FINANCIAL PERIOD'

    return {
      company_name: 'SEVEN WAVES RESTAURANT (PVT) LTD',
      title: 'STATEMENT OF PROFIT AND LOSS',
      period: periodStr,
      revenue: {
        label: 'REVENUE',
        items: revenueItems,
        total: totalRevenue,
      },
      other_income: {
        label: 'OTHER INCOME',
        items: otherIncomeItems,
        total: totalOtherIncome,
      },
      total_income: totalIncome,
      cost_of_sales: {
        label: 'COST OF GOODS SOLD (COGS)',
        items: cogsItems,
        total: totalCogs,
      },
      gross_profit: grossProfit,
      expenses: {
        admin_and_operation: {
          label: 'ADMIN AND OPERATION EXPENSES',
          items: adminItems,
          total: totalAdmin,
        },
        selling_and_distribution: {
          label: 'SELLING AND DISTRIBUTION EXPENSES',
          items: sellingItems,
          total: totalSelling,
        },
        finance_and_other: {
          label: 'FINANCE AND OTHER EXPENSES',
          items: financeOtherItems,
          total: totalFinanceOther,
        },
        total_expenses: totalExpenses,
      },
      net_profit_before_tax: netProfitBeforeTax,
      tax: {
        label: 'TAX',
        amount: taxAmount,
      },
      net_profit: netProfit,
      generated_at: new Date().toISOString(),
    }
  },

  // ── 3. Balance Sheet (Statement of Financial Position) ──────────────────────
  async generateBalanceSheet(filters = {}) {
    const tb = await this.generateTrialBalance(filters)
    const all = tb.allLedgers || tb.rows

    // Helper to calculate asset closing balance (debit nature)
    const getAssetAmount = (l) => {
      if (l.closing_debit !== 0 || l.closing_credit !== 0) {
        return l.closing_debit - l.closing_credit
      }
      return Number(l.current_balance || 0)
    }

    // Helper to calculate liability/equity closing balance (credit nature)
    const getLiabilityAmount = (l) => {
      if (l.closing_credit !== 0 || l.closing_debit !== 0) {
        return l.closing_credit - l.closing_debit
      }
      return Number(l.current_balance || 0)
    }

    // 1. NON-CURRENT ASSETS (1013 - 1020)
    const nonCurrentItems = all
      .filter(l => l.ledger_type === 'asset' && l.account_group === 'Assets-Non Current')
      .map(l => {
        const raw = getAssetAmount(l)
        // If accumulated depreciation, it's a contra asset (deducted)
        const isDepr = l.ledger_code === '1020' || l.ledger_name.toLowerCase().includes('depreciation')
        const amt = isDepr ? -Math.abs(raw) : raw
        return { code: l.ledger_code, name: l.ledger_name, amount: amt }
      })
    const totalNonCurrentAssets = nonCurrentItems.reduce((s, i) => s + i.amount, 0)

    // 2. CURRENT ASSETS (1001 - 1012, 10001, 10011, 10012, 100001-3, 100005)
    const currentAssetItems = all
      .filter(l => l.ledger_type === 'asset' && (l.account_group === 'Assets-Current' || l.account_group === 'Assets-Current (Other Receivable)'))
      // Exclude generic header 1002 if bank sub-accounts exist
      .filter(l => l.ledger_code !== '1002')
      .map(l => ({ code: l.ledger_code, name: l.ledger_name, amount: getAssetAmount(l) }))
    const totalCurrentAssets = currentAssetItems.reduce((s, i) => s + i.amount, 0)

    const totalAssets = totalNonCurrentAssets + totalCurrentAssets

    // 3. EQUITY
    // Net profit from P&L for current period
    const pl = await this.generateProfitLoss(filters)

    const statedCapitalLedger = all.find(l => l.ledger_code === '3100')
    const drawingsLedger = all.find(l => l.ledger_code === '3101')

    const statedCapital = statedCapitalLedger ? getLiabilityAmount(statedCapitalLedger) : 0
    const directorDrawings = drawingsLedger ? -Math.abs(getAssetAmount(drawingsLedger)) : 0
    const netProfitCurrent = pl.net_profit || 0

    const equityItems = [
      { code: '3100', name: 'Stated Capital', amount: statedCapital },
      { code: '3101', name: 'Director Drawings', amount: directorDrawings },
      { code: '', name: 'Net Profit / (Loss) for the Period', amount: netProfitCurrent },
    ]
    const totalEquity = statedCapital + directorDrawings + netProfitCurrent

    // 4. NON-CURRENT LIABILITIES (3000, 3001)
    const nonCurrentLiabItems = all
      .filter(l => l.ledger_type === 'liability' && l.account_group === 'Non Current Liabilities')
      .map(l => ({ code: l.ledger_code, name: l.ledger_name, amount: getLiabilityAmount(l) }))
    const totalNonCurrentLiab = nonCurrentLiabItems.reduce((s, i) => s + i.amount, 0)

    // 5. CURRENT LIABILITIES (2000 - 2007)
    const currentLiabItems = all
      .filter(l => l.ledger_type === 'liability' && l.account_group === 'Current Liabilities')
      .map(l => ({ code: l.ledger_code, name: l.ledger_name, amount: getLiabilityAmount(l) }))
    const totalCurrentLiab = currentLiabItems.reduce((s, i) => s + i.amount, 0)

    const totalLiabilitiesEquity = totalEquity + totalNonCurrentLiab + totalCurrentLiab
    const isBalanced = Math.abs(totalAssets - totalLiabilitiesEquity) < 0.01

    const asOfStr = filters.date_to ? `AS AT ${filters.date_to}` : `AS AT ${new Date().toISOString().slice(0, 10)}`

    return {
      company_name: 'SEVEN WAVES RESTAURANT (PVT) LTD',
      title: 'STATEMENT OF FINANCIAL POSITION',
      as_of_date: asOfStr,
      assets: {
        non_current: {
          label: 'NON-CURRENT ASSETS',
          items: nonCurrentItems,
          total: totalNonCurrentAssets,
        },
        current: {
          label: 'CURRENT ASSETS',
          items: currentAssetItems,
          total: totalCurrentAssets,
        },
        total_assets: totalAssets,
      },
      equity_and_liabilities: {
        equity: {
          label: 'EQUITY',
          items: equityItems,
          total: totalEquity,
        },
        non_current_liabilities: {
          label: 'NON CURRENT LIABILITIES',
          items: nonCurrentLiabItems,
          total: totalNonCurrentLiab,
        },
        current_liabilities: {
          label: 'CURRENT LIABILITIES',
          items: currentLiabItems,
          total: totalCurrentLiab,
        },
        total_liabilities_equity: totalLiabilitiesEquity,
      },
      is_balanced: isBalanced,
      generated_at: new Date().toISOString(),
    }
  },
}
