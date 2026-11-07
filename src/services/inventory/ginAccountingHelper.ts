// ═══════════════════════════════════════════════════════════════════════════
// GIN Accounting Helper
// Allocates Goods Issue Notes between:
// 1. Cost of Goods Sold (COGS - Account 6000, 6001, 6002, 6003)
// 2. Direct Operating Expenses (Account 7044 Cleaning, 7011 Gas, 7005 Staff Meal)
// Seven Waves Restaurant (Pvt) Ltd
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'

export interface AccountAllocation {
  debitLedgerCode: string
  debitLedgerName: string
  creditLedgerCode: string
  creditLedgerName: string
  allocationType: 'COGS' | 'EXPENSE'
}

/**
 * Resolves the appropriate Debit (COGS vs Expense) and Credit (Inventory Asset) accounts
 * for an item being issued via GIN.
 */
export function resolveItemGinAccounts(
  item: { name?: string; code?: string; category_name?: string } | null,
  issuePurpose?: string
): AccountAllocation {
  const itemName = (item?.name || '').toLowerCase()
  const catName = (item?.category_name || '').toLowerCase()
  const purpose = (issuePurpose || '').toLowerCase()

  // 1. Check issue purpose overrides
  if (purpose.includes('staff meal')) {
    return {
      debitLedgerCode: '7005',
      debitLedgerName: 'Staff Welfare',
      creditLedgerCode: '1005',
      creditLedgerName: 'Inventory - Raw Materials',
      allocationType: 'EXPENSE',
    }
  }

  if (purpose.includes('wastage')) {
    return {
      debitLedgerCode: '6003',
      debitLedgerName: 'Kitchen Wastage',
      creditLedgerCode: '1005',
      creditLedgerName: 'Inventory - Raw Materials',
      allocationType: 'COGS',
    }
  }

  if (purpose.includes('damaged')) {
    return {
      debitLedgerCode: '6004',
      debitLedgerName: 'Inventory Adjustment',
      creditLedgerCode: '1005',
      creditLedgerName: 'Inventory - Raw Materials',
      allocationType: 'COGS',
    }
  }

  // 2. Cleaning equipment, chemicals, brooms (idal), coir (kohu), detergents
  const isCleaning =
    catName.includes('clean') ||
    itemName.includes('bleach') ||
    itemName.includes('soap') ||
    itemName.includes('detergent') ||
    itemName.includes('serviette') ||
    itemName.includes('chemical') ||
    itemName.includes('broom') ||
    itemName.includes('idal') ||
    itemName.includes('kohu') ||
    itemName.includes('scrubber') ||
    itemName.includes('sponge') ||
    purpose.includes('clean')

  if (isCleaning) {
    return {
      debitLedgerCode: '7044',
      debitLedgerName: 'Cleaning & Sanitation Expenses',
      creditLedgerCode: '1009',
      creditLedgerName: 'Inventory - Cleaning Materials',
      allocationType: 'EXPENSE',
    }
  }

  // 3. Cooking Gas / Fuels
  const isFuel =
    catName.includes('fuel') ||
    catName.includes('gas') ||
    itemName.includes('gas') ||
    itemName.includes('lpg')

  if (isFuel) {
    return {
      debitLedgerCode: '7011',
      debitLedgerName: 'Gas Expense',
      creditLedgerCode: '1005',
      creditLedgerName: 'Inventory - Raw Materials',
      allocationType: 'EXPENSE',
    }
  }

  // 4. Packaging materials
  const isPackaging = catName.includes('packag') || itemName.includes('box') || itemName.includes('container')

  if (isPackaging) {
    return {
      debitLedgerCode: '6001',
      debitLedgerName: 'Packaging Cost',
      creditLedgerCode: '1008',
      creditLedgerName: 'Inventory - Packaging Materials',
      allocationType: 'COGS',
    }
  }

  // 5. Beverage ingredients
  const isBeverage = catName.includes('beverage') || catName.includes('syrup') || catName.includes('flavour')

  if (isBeverage) {
    return {
      debitLedgerCode: '6000',
      debitLedgerName: 'Food Cost',
      creditLedgerCode: '1006',
      creditLedgerName: 'Inventory - Beverages Stock',
      allocationType: 'COGS',
    }
  }

  // 6. Default: Food / Raw Materials to Kitchen
  return {
    debitLedgerCode: '6000',
    debitLedgerName: 'Food Cost',
    creditLedgerCode: '1005',
    creditLedgerName: 'Inventory - Raw Materials',
    allocationType: 'COGS',
  }
}

/**
 * Posts double-entry legs to finance for a posted GIN document.
 */
export async function postGinToFinance(docId: string): Promise<{ success: boolean; linesPosted: number }> {
  // 1. Fetch document header
  const { data: doc, error: docErr } = await supabase
    .from('inventory_documents')
    .select('*')
    .eq('id', docId)
    .single()

  if (docErr || !doc) {
    throw new Error('Document not found: ' + (docErr?.message || ''))
  }

  // Skip transfers between stores (stock moves, not consumed)
  if (doc.target_warehouse_id) {
    return { success: true, linesPosted: 0 }
  }

  // 2. Fetch lines with item and category
  const { data: lines, error: lineErr } = await supabase
    .from('inventory_document_lines')
    .select('*, item:items(id, name, code, category:item_categories(id, name))')
    .eq('document_id', docId)

  if (lineErr || !lines || lines.length === 0) {
    return { success: true, linesPosted: 0 }
  }

  // 3. Fetch Ledgers map by code
  const { data: ledgers, error: legErr } = await supabase
    .from('finance_ledgers')
    .select('id, ledger_code, ledger_name, current_balance')
    .is('deleted_at', null)

  if (legErr || !ledgers) {
    throw new Error('Could not load finance ledgers: ' + (legErr?.message || ''))
  }

  const ledgerMap = new Map<string, any>()
  ledgers.forEach((l) => ledgerMap.set(l.ledger_code, l))

  // 4. Idempotency check: has this doc already been posted in finance?
  const { count } = await supabase
    .from('finance_cashbook_entries')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', docId)

  if (count && count > 0) {
    return { success: true, linesPosted: count / 2 }
  }

  let linesPosted = 0
  const issuePurpose = doc.remarks || ''

  for (const line of lines) {
    const cost = Number(line.quantity || 0) * Number(line.unit_cost || 0)
    if (cost <= 0) continue

    const itemMeta = {
      name: line.item?.name,
      code: line.item?.code,
      category_name: line.item?.category?.name,
    }

    const alloc = resolveItemGinAccounts(itemMeta, issuePurpose)
    const drLedger = ledgerMap.get(alloc.debitLedgerCode) || ledgerMap.get('6000')
    const crLedger = ledgerMap.get(alloc.creditLedgerCode) || ledgerMap.get('1005')

    if (!drLedger || !crLedger) {
      console.warn('Missing ledger mapping for GIN line:', alloc)
      continue
    }

    const desc = `GIN ${doc.doc_number} — ${itemMeta.name} (${alloc.debitLedgerCode} ${alloc.allocationType})`
    const entryDate = doc.doc_date || new Date().toISOString().slice(0, 10)

    // Debit leg (COGS / Operating Expense)
    await supabase.rpc('fn_fin_post_leg', {
      p_company_id: doc.company_id,
      p_branch_id: doc.branch_id,
      p_source_type: 'manual_adjustment',
      p_source_id: docId,
      p_entry_date: entryDate,
      p_ledger_id: drLedger.id,
      p_account_id: null,
      p_description: desc,
      p_debit: cost,
      p_credit: 0,
    })

    // Credit leg (Inventory Asset)
    await supabase.rpc('fn_fin_post_leg', {
      p_company_id: doc.company_id,
      p_branch_id: doc.branch_id,
      p_source_type: 'manual_adjustment',
      p_source_id: docId,
      p_entry_date: entryDate,
      p_ledger_id: crLedger.id,
      p_account_id: null,
      p_description: desc,
      p_debit: 0,
      p_credit: cost,
    })

    linesPosted++
  }

  return { success: true, linesPosted }
}

