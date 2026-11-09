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

  // 2. Cleaning equipment, chemicals, washing liquids, brooms (idal), coir (kohu), detergents, soaps, bleaches
  const isCleaning =
    purpose.includes('clean') ||
    purpose.includes('maint') ||
    catName.includes('clean') ||
    catName.includes('hygiene') ||
    (catName.includes('chemical') && !catName.includes('food')) ||
    itemName.includes('bleach') ||
    itemName.includes('soap') ||
    itemName.includes('detergent') ||
    itemName.includes('chemical') ||
    itemName.includes('clean') ||
    itemName.includes('wash') ||
    itemName.includes('dishwash') ||
    itemName.includes('handwash') ||
    itemName.includes('sanit') ||
    itemName.includes('disinfect') ||
    itemName.includes('harpic') ||
    itemName.includes('vim') ||
    itemName.includes('toilet') ||
    itemName.includes('broom') ||
    itemName.includes('brush') ||
    itemName.includes('idal') ||
    itemName.includes('kohu') ||
    itemName.includes('coir') ||
    itemName.includes('mop') ||
    itemName.includes('scrubber') ||
    (itemName.includes('sponge') && !itemName.includes('mix') && !itemName.includes('cake')) ||
    itemName.includes('serviette') ||
    itemName.includes('paper towel') ||
    itemName.includes('tissue') ||
    itemName.includes('trash bag') ||
    itemName.includes('garbage bag')

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
    purpose.includes('fuel') ||
    purpose.includes('gas') ||
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
  const isPackaging =
    purpose.includes('packag') ||
    purpose.includes('delivery') ||
    catName.includes('packag') ||
    itemName.includes('box') ||
    itemName.includes('container') ||
    itemName.includes('wrapper')

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
  const isBeverage =
    purpose.includes('bar') ||
    catName.includes('beverage') ||
    catName.includes('syrup') ||
    catName.includes('flavour')

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
  // 1. Try calling the dedicated server-side RPC if available
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('fn_fin_post_gin', { p_doc_id: docId })
    if (!rpcErr && rpcRes && rpcRes.success) {
      return { success: true, linesPosted: rpcRes.lines_posted || 0 }
    }
  } catch (e) {
    console.warn('[postGinToFinance] fn_fin_post_gin RPC skipped/failed, using fallback:', e)
  }

  // 2. Fetch document header
  const { data: doc, error: docErr } = await supabase
    .from('inventory_documents')
    .select('*, target_warehouse:warehouses!target_warehouse_id(id, name, warehouse_type)')
    .eq('id', docId)
    .single()

  if (docErr || !doc) {
    throw new Error('Document not found: ' + (docErr?.message || ''))
  }

  // NOTE: In Seven Waves restaurant operations, GINs issued to kitchen sections
  // (e.g. Italian Kitchen, Indian Kitchen, Bar, Benmar) are production issues
  // that must be recognized as Cost of Goods Sold / Expenses in the Income Statement.
  // We ONLY skip true warehouse-to-warehouse stock transfers if doc_type is TRANSFER
  // between non-kitchen stores.
  if (doc.doc_type === 'TRANSFER' && doc.target_warehouse?.warehouse_type !== 'kitchen') {
    return { success: true, linesPosted: 0 }
  }

  // 3. Fetch lines with item and category
  const { data: lines, error: lineErr } = await supabase
    .from('inventory_document_lines')
    .select('*, item:items(id, name, code, category:item_categories(id, name))')
    .eq('document_id', docId)

  if (lineErr || !lines || lines.length === 0) {
    return { success: true, linesPosted: 0 }
  }

  // 4. Fetch Ledgers map by code
  const { data: ledgers, error: legErr } = await supabase
    .from('finance_ledgers')
    .select('id, ledger_code, ledger_name, current_balance')
    .is('deleted_at', null)

  if (legErr || !ledgers) {
    throw new Error('Could not load finance ledgers: ' + (legErr?.message || ''))
  }

  const ledgerMap = new Map<string, any>()
  ledgers.forEach((l) => ledgerMap.set(l.ledger_code, l))

  // 5. Idempotency check: has this doc already been posted in finance?
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

    const kitchenSuffix = doc.target_warehouse?.name ? ` [${doc.target_warehouse.name}]` : ''
    const desc = `GIN ${doc.doc_number} — ${itemMeta.name} (${alloc.debitLedgerCode} ${alloc.allocationType}${kitchenSuffix})`
    const entryDate = doc.doc_date || new Date().toISOString().slice(0, 10)

    try {
      // Try fn_fin_post_leg RPC
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
    } catch {
      // Direct insert fallback
      try {
        await supabase.from('finance_cashbook_entries').insert([
          {
            company_id: doc.company_id,
            branch_id: doc.branch_id,
            source_type: 'manual_adjustment',
            source_id: docId,
            entry_date: entryDate,
            ledger_id: drLedger.id,
            description: desc,
            debit_amount: cost,
            credit_amount: 0,
          },
          {
            company_id: doc.company_id,
            branch_id: doc.branch_id,
            source_type: 'manual_adjustment',
            source_id: docId,
            entry_date: entryDate,
            ledger_id: crLedger.id,
            description: desc,
            debit_amount: 0,
            credit_amount: cost,
          },
        ])
      } catch (insertErr) {
        console.warn('Fallback direct insert failed for GIN finance entry:', insertErr)
      }
    }

    linesPosted++
  }

  return { success: true, linesPosted }
}

