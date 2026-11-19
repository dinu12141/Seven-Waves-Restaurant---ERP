// ═══════════════════════════════════════════════════════════════════════════
// GIN Accounting Helper
// Allocates Goods Issue Notes between:
// 1. Cost of Goods Sold (COGS - Accounts 5010–5090)
// 2. Direct Operating Expenses (Accounts 6010, 6020, 6120, 6140, 6170)
// Seven Waves Restaurant (Pvt) Ltd - Kottawa Branch
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'

export interface AccountAllocation {
  debitLedgerCode: string
  debitLedgerName: string
  creditLedgerCode: string
  creditLedgerName: string
  allocationType: 'COGS' | 'OPERATING_EXPENSE'
}

/** Official Kottawa Kitchen & Operating Sections (Retaining 'Benmar' per specification) */
export const KOTTAWA_SECTIONS = [
  { code: 'KOT-01', label: 'Benmar' },
  { code: 'KOT-02', label: 'Cashier' },
  { code: 'KOT-03', label: 'Pastry / Bakery' },
  { code: 'KOT-04', label: 'Chinese' },
  { code: 'KOT-05', label: 'Rice and Curry' },
  { code: 'KOT-06', label: 'Italian' },
  { code: 'KOT-07', label: 'Juice Bar' },
  { code: 'KOT-08', label: 'Cleaning' },
  { code: 'KOT-09', label: 'Wash-up' },
  { code: 'KOT-10', label: 'Kottu and Roti' },
] as const

/**
 * Resolves the appropriate Debit (COGS vs Expense) and Credit (Inventory Asset) accounts
 * for an item being issued via GIN, conforming to the Kottawa 4-digit Chart of Accounts.
 */
export function resolveItemGinAccounts(
  item: { name?: string; code?: string; category_name?: string } | null,
  issuePurpose?: string,
): AccountAllocation {
  const itemName = (item?.name || '').toLowerCase()
  const catName = (item?.category_name || '').toLowerCase()
  const purpose = (issuePurpose || '').toLowerCase()

  // 1. Check issue purpose overrides
  if (purpose.includes('staff meal') || purpose.includes('staff welfare')) {
    return {
      debitLedgerCode: '6020',
      debitLedgerName: 'Staff Welfare',
      creditLedgerCode: '1080',
      creditLedgerName: 'Inventory – General Food Raw Materials',
      allocationType: 'OPERATING_EXPENSE',
    }
  }

  // 2. Cleaning equipment, chemicals, washing liquids, detergents, soaps, bleaches
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
      debitLedgerCode: '6120',
      debitLedgerName: 'Cleaning Expense',
      creditLedgerCode: '1140',
      creditLedgerName: 'Inventory – Cleaning Supplies',
      allocationType: 'OPERATING_EXPENSE',
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
      debitLedgerCode: '6170',
      debitLedgerName: 'Fuel Expenses (Gas & Fuel)',
      creditLedgerCode: '1150',
      creditLedgerName: 'Inventory – Kitchen Consumables',
      allocationType: 'OPERATING_EXPENSE',
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
      debitLedgerCode: '5080',
      debitLedgerName: 'Packaging Consumption',
      creditLedgerCode: '1110',
      creditLedgerName: 'Inventory – Packaging',
      allocationType: 'COGS',
    }
  }

  // 5. Meat & Seafood
  const isMeatOrFish =
    catName.includes('meat') ||
    catName.includes('fish') ||
    catName.includes('seafood') ||
    itemName.includes('chicken') ||
    itemName.includes('beef') ||
    itemName.includes('pork') ||
    itemName.includes('fish') ||
    itemName.includes('prawn') ||
    itemName.includes('cuttlefish') ||
    itemName.includes('crab')

  if (isMeatOrFish) {
    return {
      debitLedgerCode: '5010',
      debitLedgerName: 'Meat and Seafood Consumption',
      creditLedgerCode: '1081',
      creditLedgerName: 'Inventory – Meat and Seafood',
      allocationType: 'COGS',
    }
  }

  // 6. Dairy and Eggs
  const isDairy =
    catName.includes('dairy') ||
    itemName.includes('milk') ||
    itemName.includes('cheese') ||
    itemName.includes('butter') ||
    itemName.includes('cream') ||
    itemName.includes('egg') ||
    itemName.includes('yogurt')

  if (isDairy) {
    return {
      debitLedgerCode: '5050',
      debitLedgerName: 'Dairy and Egg Consumption',
      creditLedgerCode: '1085',
      creditLedgerName: 'Inventory – Dairy and Eggs',
      allocationType: 'COGS',
    }
  }

  // 7. Coffee & Tea
  const isCoffeeTea =
    catName.includes('coffee') ||
    catName.includes('tea') ||
    itemName.includes('coffee') ||
    itemName.includes('tea')

  if (isCoffeeTea) {
    return {
      debitLedgerCode: '5070',
      debitLedgerName: 'Coffee and Tea Consumption',
      creditLedgerCode: '1091',
      creditLedgerName: 'Inventory – Coffee and Tea',
      allocationType: 'COGS',
    }
  }

  // 8. Beverage ingredients & Syrups
  const isBeverage =
    purpose.includes('bar') ||
    catName.includes('beverage') ||
    catName.includes('syrup') ||
    catName.includes('flavour') ||
    itemName.includes('syrup') ||
    itemName.includes('juice') ||
    itemName.includes('soda')

  if (isBeverage) {
    return {
      debitLedgerCode: '5060',
      debitLedgerName: 'Beverage Raw Material Consumption',
      creditLedgerCode: '1090',
      creditLedgerName: 'Inventory – Beverages',
      allocationType: 'COGS',
    }
  }

  // 9. Bakery Raw Materials
  const isBakery =
    catName.includes('bakery') ||
    catName.includes('pastry') ||
    itemName.includes('yeast') ||
    itemName.includes('baking powder') ||
    itemName.includes('icing') ||
    itemName.includes('fondant')

  if (isBakery) {
    return {
      debitLedgerCode: '5040',
      debitLedgerName: 'Bakery Raw Material Consumption',
      creditLedgerCode: '1084',
      creditLedgerName: 'Inventory – Bakery Raw Materials',
      allocationType: 'COGS',
    }
  }

  // 10. Vegetables, Fruits, Rice & Dry Goods
  const isVegOrFruit =
    itemName.includes('veg') ||
    itemName.includes('fruit') ||
    itemName.includes('onion') ||
    itemName.includes('garlic') ||
    itemName.includes('tomato') ||
    itemName.includes('potato') ||
    itemName.includes('chilli') ||
    itemName.includes('lime') ||
    itemName.includes('carrot') ||
    itemName.includes('leeks') ||
    itemName.includes('cabbage')

  if (isVegOrFruit) {
    return {
      debitLedgerCode: '5020',
      debitLedgerName: 'Vegetables and Fruits Consumption',
      creditLedgerCode: '1082',
      creditLedgerName: 'Inventory – Vegetables and Fruits',
      allocationType: 'COGS',
    }
  }

  // 11. Rice & Dry Goods (Default Raw Materials)
  return {
    debitLedgerCode: '5030',
    debitLedgerName: 'Rice and Dry Goods Consumption',
    creditLedgerCode: '1083',
    creditLedgerName: 'Inventory – Rice and Dry Goods',
    allocationType: 'COGS',
  }
}

/**
 * Posts double-entry legs to finance for a posted GIN document.
 */
export async function postGinToFinance(
  docId: string,
  sectionCode?: string,
): Promise<{ success: boolean; linesPosted: number }> {
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

  // Determine section code tag
  let sectionTag = sectionCode ? `[Section: ${sectionCode}]` : ''
  if (!sectionTag && doc.remarks) {
    const match = doc.remarks.match(/\[Section:\s*(KOT-\d+[^\]]*)\]/i)
    if (match) sectionTag = `[Section: ${match[1]}]`
  }

  for (const line of lines) {
    const cost = Number(line.quantity || 0) * Number(line.unit_cost || 0)
    if (cost <= 0) continue

    const itemMeta = {
      name: line.item?.name,
      code: line.item?.code,
      category_name: line.item?.category?.name,
    }

    const alloc = resolveItemGinAccounts(itemMeta, issuePurpose)
    const drLedger = ledgerMap.get(alloc.debitLedgerCode) || ledgerMap.get('5010') || ledgerMap.get('6000')
    const crLedger = ledgerMap.get(alloc.creditLedgerCode) || ledgerMap.get('1080') || ledgerMap.get('1005')

    if (!drLedger || !crLedger) {
      console.warn('Missing ledger mapping for GIN line:', alloc)
      continue
    }

    const kitchenSuffix = doc.target_warehouse?.name ? ` [${doc.target_warehouse.name}]` : ''
    const desc = `GIN ${doc.doc_number} — ${itemMeta.name} (${alloc.debitLedgerCode} ${alloc.allocationType}${kitchenSuffix}) ${sectionTag}`.trim()
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
