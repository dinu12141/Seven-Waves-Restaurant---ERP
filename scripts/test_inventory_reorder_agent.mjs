// ═══════════════════════════════════════════════════════════════════════════════
// Test CLI for Inventory Reorder & Supplier Comparison Agent
// Seven Waves ERP
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function fmtLKR(val) {
  return 'LKR ' + Number(val || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function runTest() {
  console.log('🤖 Seven Waves ERP — Inventory Reorder & Supplier Price Comparison Agent')
  console.log('========================================================================')
  console.log('🔍 Scanning stock levels against reorder thresholds...')

  // 1. Fetch active items with reorder level
  const { data: allItems, error: itmErr } = await supabase
    .from('items')
    .select(`
      id, code, name, reorder_level, reorder_qty, avg_cost, last_purchase_price,
      cost_price, default_supplier_id, is_active,
      default_supplier:suppliers!default_supplier_id(id, name, phone)
    `)
    .eq('is_active', true)
    .gt('reorder_level', 0)

  if (itmErr) throw itmErr

  // 2. Fetch stock on hand
  const { data: stockRows, error: stkErr } = await supabase
    .from('stock_on_hand')
    .select('item_id, qty_on_hand')

  if (stkErr) throw stkErr

  const stockMap = new Map()
  for (const s of stockRows || []) {
    const q = Number(s.qty_on_hand || 0)
    stockMap.set(s.item_id, (stockMap.get(s.item_id) || 0) + q)
  }

  // 3. Filter low stock items
  const lowStockItems = []
  for (const it of allItems || []) {
    const onHand = stockMap.get(it.id) || 0
    const reorderLevel = Number(it.reorder_level || 0)
    if (onHand <= reorderLevel) {
      lowStockItems.push({
        ...it,
        onHand,
        reorderLevel
      })
    }
  }

  console.log(`📊 Found ${lowStockItems.length} items requiring reorder.\n`)

  // 4. Fetch supplier price history
  const lowItemIds = lowStockItems.map(i => i.id)
  const { data: grnLines } = await supabase
    .from('inventory_document_lines')
    .select(`
      item_id, unit_cost, quantity,
      document:inventory_documents!document_id(doc_type, status, supplier_id, supplier:suppliers(id, name, phone))
    `)
    .in('item_id', lowItemIds)
    .eq('document.doc_type', 'GRN')
    .neq('document.status', 'cancelled')

  const { data: fallbackSuppliers } = await supabase.from('suppliers').select('id, name, phone').limit(5)
  const defaultSupplier = fallbackSuppliers && fallbackSuppliers[0] ? fallbackSuppliers[0] : { id: 'default', name: 'General Vendor' }

  // Price matrix
  const priceMap = new Map()
  for (const line of grnLines || []) {
    if (!line.document?.supplier_id) continue
    const sId = line.document.supplier_id
    const sName = line.document.supplier?.name || 'Supplier'
    const sPhone = line.document.supplier?.phone
    const unitCost = Number(line.unit_cost || 0)
    if (unitCost <= 0) continue

    if (!priceMap.has(line.item_id)) priceMap.set(line.item_id, new Map())
    const itemSuppliers = priceMap.get(line.item_id)
    if (!itemSuppliers.has(sId)) {
      itemSuppliers.set(sId, { supplierId: sId, supplierName: sName, supplierPhone: sPhone, minPrice: unitCost, maxPrice: unitCost })
    } else {
      const e = itemSuppliers.get(sId)
      e.minPrice = Math.min(e.minPrice, unitCost)
      e.maxPrice = Math.max(e.maxPrice, unitCost)
    }
  }

  // Group by supplier
  const supplierGroups = new Map()
  let totalOrderCost = 0
  let totalProjectedSavings = 0

  for (const it of lowStockItems) {
    const supplierOffers = priceMap.get(it.id)
    let bestSuppId = it.default_supplier?.id || defaultSupplier.id
    let bestSuppName = it.default_supplier?.name || defaultSupplier.name
    let bestSuppPhone = it.default_supplier?.phone || defaultSupplier.phone
    let bestPrice = Number(it.last_purchase_price || it.avg_cost || it.cost_price || 0)
    let highestPrice = bestPrice

    if (supplierOffers && supplierOffers.size > 0) {
      let minFound = Infinity
      let maxFound = -Infinity
      for (const offer of supplierOffers.values()) {
        if (offer.minPrice < minFound) {
          minFound = offer.minPrice
          bestSuppId = offer.supplierId
          bestSuppName = offer.supplierName
          bestSuppPhone = offer.supplierPhone
        }
        if (offer.maxPrice > maxFound) maxFound = offer.maxPrice
      }
      if (minFound !== Infinity && minFound > 0) {
        bestPrice = minFound
        highestPrice = maxFound
      }
    }

    if (bestPrice <= 0) bestPrice = 500

    const targetQty = Number(it.reorder_qty || 0) > 0
      ? Number(it.reorder_qty)
      : Math.max(it.reorderLevel * 2 - it.onHand, it.reorderLevel || 5)

    const lineTotal = targetQty * bestPrice
    const savings = highestPrice > bestPrice ? (highestPrice - bestPrice) * targetQty : 0

    totalOrderCost += lineTotal
    totalProjectedSavings += savings

    if (!supplierGroups.has(bestSuppId)) {
      supplierGroups.set(bestSuppId, {
        supplierId: bestSuppId,
        supplierName: bestSuppName,
        supplierPhone: bestSuppPhone,
        items: [],
        totalAmount: 0,
        totalSavings: 0
      })
    }
    const grp = supplierGroups.get(bestSuppId)
    grp.items.push({
      code: it.code,
      name: it.name,
      onHand: it.onHand,
      reorderLevel: it.reorderLevel,
      recommendedQty: targetQty,
      bestUnitPrice: bestPrice,
      highestUnitPrice: highestPrice > bestPrice ? highestPrice : undefined,
      lineTotal,
      savings
    })
    grp.totalAmount += lineTotal
    grp.totalSavings += savings
  }

  // Print results
  console.log(`📦 Summary of Reorder Proposals by Supplier:`)
  console.log(`------------------------------------------------------------------------`)

  const groups = Array.from(supplierGroups.values()).sort((a, b) => b.totalAmount - a.totalAmount)

  for (const grp of groups.slice(0, 5)) {
    console.log(`\n🏢 Supplier: ${grp.supplierName} ${grp.supplierPhone ? '(' + grp.supplierPhone + ')' : ''}`)
    console.log(`   Estimated Order Value: ${fmtLKR(grp.totalAmount)} | Items: ${grp.items.length}`)
    if (grp.totalSavings > 0) {
      console.log(`   💡 Projected Savings vs High Quote: ${fmtLKR(grp.totalSavings)}`)
    }
    console.log(`   Items to Reorder:`)
    for (const it of grp.items.slice(0, 4)) {
      console.log(`   • ${it.name} (${it.code}) -> Order: ${it.recommendedQty} units @ ${fmtLKR(it.bestUnitPrice)} (Total: ${fmtLKR(it.lineTotal)}) [Current Stock: ${it.onHand} / Min: ${it.reorderLevel}]`)
    }
    if (grp.items.length > 4) {
      console.log(`   ...and ${grp.items.length - 4} more items for this vendor.`)
    }
  }

  console.log(`\n========================================================================`)
  console.log(`🎯 Grand Total Reorder Spend: ${fmtLKR(totalOrderCost)}`)
  console.log(`💰 Grand Total Projected Savings: ${fmtLKR(totalProjectedSavings)}`)
  console.log(`✅ Automated Price Comparison & Reorder Analysis Complete!`)
}

runTest().catch(err => {
  console.error('Test run failed:', err)
  process.exit(1)
})

