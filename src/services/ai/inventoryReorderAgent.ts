// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — Automated Inventory Reorder & Supplier Comparison Agent
// ═══════════════════════════════════════════════════════════════════════════════
// 1. Scans inventory stock levels against reorder thresholds.
// 2. Evaluates multi-vendor price history to determine the LOWEST COST supplier.
// 3. Calculates recommended reorder quantities and projected savings.
// 4. Generates structured draft Purchase Orders (PO) for 1-click approval.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase as defaultClient } from 'src/boot/supabase'

export interface ItemReorderRecommendation {
  itemId: string
  itemCode: string
  itemName: string
  currentQty: number
  reorderLevel: number
  recommendedQty: number
  uom: string
  bestSupplierId: string
  bestSupplierName: string
  bestSupplierPhone?: string
  bestUnitPrice: number
  highestUnitPrice?: number
  estimatedLineTotal: number
  projectedSavings: number
  priceHistoryCount: number
}

export interface SupplierOrderGroup {
  supplierId: string
  supplierName: string
  supplierPhone?: string
  items: ItemReorderRecommendation[]
  totalItems: number
  totalEstimatedAmount: number
  totalProjectedSavings: number
}

export interface ReorderScanResult {
  summary: string
  lowStockItemsCount: number
  supplierGroups: SupplierOrderGroup[]
  totalOrderCost: number
  totalEstimatedSavings: number
}

export class InventoryReorderAgent {
  private client: any

  constructor(customClient?: any) {
    this.client = customClient || defaultClient
  }

  /**
   * Scan stock levels, compare supplier prices, and generate reorder proposals.
   */
  async scanAndProposeReorders(branchId?: string): Promise<ReorderScanResult> {
    // 1. Fetch active items with reorder level
    const { data: allItems, error: itmErr } = await this.client
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
    const { data: stockRows, error: stkErr } = await this.client
      .from('stock_on_hand')
      .select('item_id, qty_on_hand')

    if (stkErr) throw stkErr

    const stockMap = new Map<string, number>()
    for (const s of stockRows || []) {
      const q = Number(s.qty_on_hand || 0)
      stockMap.set(s.item_id, (stockMap.get(s.item_id) || 0) + q)
    }

    // 3. Filter low stock items
    const lowStockItems: any[] = []
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

    if (lowStockItems.length === 0) {
      return {
        summary: '✅ All inventory items are currently healthy above their reorder thresholds.',
        lowStockItemsCount: 0,
        supplierGroups: [],
        totalOrderCost: 0,
        totalEstimatedSavings: 0
      }
    }

    // 4. Fetch supplier purchase price history for these items
    const lowItemIds = lowStockItems.map(i => i.id)
    const { data: grnLines } = await this.client
      .from('inventory_document_lines')
      .select(`
        item_id, unit_cost, line_total, quantity,
        document:inventory_documents!document_id(doc_type, status, supplier_id, supplier:suppliers(id, name, phone))
      `)
      .in('item_id', lowItemIds)
      .eq('document.doc_type', 'GRN')
      .neq('document.status', 'cancelled')

    // Also fetch default suppliers pool for items with no GRN history
    const { data: fallbackSuppliers } = await this.client
      .from('suppliers')
      .select('id, name, phone')
      .limit(5)

    const defaultSupplier = fallbackSuppliers && fallbackSuppliers[0] ? fallbackSuppliers[0] : { id: 'default', name: 'General Vendor' }

    // Group prices by item
    const priceMap = new Map<string, Map<string, { supplierId: string; supplierName: string; supplierPhone?: string; minPrice: number; maxPrice: number }>>()

    for (const line of grnLines || []) {
      if (!line.document?.supplier_id) continue
      const sId = line.document.supplier_id
      const sName = line.document.supplier?.name || 'Supplier'
      const sPhone = line.document.supplier?.phone
      const unitCost = Number(line.unit_cost || 0)
      if (unitCost <= 0) continue

      if (!priceMap.has(line.item_id)) {
        priceMap.set(line.item_id, new Map())
      }
      const itemSuppliers = priceMap.get(line.item_id)!
      if (!itemSuppliers.has(sId)) {
        itemSuppliers.set(sId, { supplierId: sId, supplierName: sName, supplierPhone: sPhone, minPrice: unitCost, maxPrice: unitCost })
      } else {
        const entry = itemSuppliers.get(sId)!
        entry.minPrice = Math.min(entry.minPrice, unitCost)
        entry.maxPrice = Math.max(entry.maxPrice, unitCost)
      }
    }

    // 5. Build recommendations
    const recommendations: ItemReorderRecommendation[] = []

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
          if (offer.maxPrice > maxFound) {
            maxFound = offer.maxPrice
          }
        }
        if (minFound !== Infinity && minFound > 0) {
          bestPrice = minFound
          highestPrice = maxFound
        }
      }

      // If price is still 0, provide baseline estimate
      if (bestPrice <= 0) bestPrice = 500

      // Reorder quantity calculation:
      // If reorder_qty specified, use it. Otherwise calculate (reorder_level * 2) - current on hand
      const targetReorderQty = Number(it.reorder_qty || 0) > 0
        ? Number(it.reorder_qty)
        : Math.max(it.reorderLevel * 2 - it.onHand, it.reorderLevel || 5)

      const lineTotal = targetReorderQty * bestPrice
      const savingsPerUnit = highestPrice > bestPrice ? (highestPrice - bestPrice) : 0
      const totalSavings = savingsPerUnit * targetReorderQty

      recommendations.push({
        itemId: it.id,
        itemCode: it.code,
        itemName: it.name,
        currentQty: it.onHand,
        reorderLevel: it.reorderLevel,
        recommendedQty: targetReorderQty,
        uom: 'PCS',
        bestSupplierId: bestSuppId,
        bestSupplierName: bestSuppName,
        bestSupplierPhone: bestSuppPhone,
        bestUnitPrice: bestPrice,
        highestUnitPrice: highestPrice > bestPrice ? highestPrice : undefined,
        estimatedLineTotal: lineTotal,
        projectedSavings: totalSavings,
        priceHistoryCount: supplierOffers?.size || 0
      })
    }

    // 6. Group by best supplier
    const groupMap = new Map<string, SupplierOrderGroup>()
    let totalOrderCost = 0
    let totalEstimatedSavings = 0

    for (const rec of recommendations) {
      totalOrderCost += rec.estimatedLineTotal
      totalEstimatedSavings += rec.projectedSavings

      if (!groupMap.has(rec.bestSupplierId)) {
        groupMap.set(rec.bestSupplierId, {
          supplierId: rec.bestSupplierId,
          supplierName: rec.bestSupplierName,
          supplierPhone: rec.bestSupplierPhone,
          items: [],
          totalItems: 0,
          totalEstimatedAmount: 0,
          totalProjectedSavings: 0
        })
      }
      const grp = groupMap.get(rec.bestSupplierId)!
      grp.items.push(rec)
      grp.totalItems++
      grp.totalEstimatedAmount += rec.estimatedLineTotal
      grp.totalProjectedSavings += rec.projectedSavings
    }

    const supplierGroups = Array.from(groupMap.values())
    supplierGroups.sort((a, b) => b.totalEstimatedAmount - a.totalEstimatedAmount)

    const summary = `Found ${lowStockItems.length} low stock items across ${supplierGroups.length} suppliers. Total estimated PO cost: LKR ${totalOrderCost.toLocaleString('en-LK', { minimumFractionDigits: 2 })}.`

    return {
      summary,
      lowStockItemsCount: lowStockItems.length,
      supplierGroups,
      totalOrderCost,
      totalEstimatedSavings
    }
  }

  /**
   * Automatically generate draft Purchase Orders in the database for the proposed supplier groups.
   */
  async generateDraftPurchaseOrders(
    supplierGroups: SupplierOrderGroup[],
    options: { branchId?: string; companyId?: string; warehouseId?: string } = {}
  ): Promise<{ success: boolean; createdOrders: any[]; error?: string }> {
    try {
      const createdOrders: any[] = []

      // Get branch / company if not provided
      let branchId = options.branchId
      let companyId = options.companyId

      if (!branchId || !companyId) {
        const { data: branch } = await this.client.from('branches').select('id, company_id').limit(1).single()
        if (branch) {
          branchId = branchId || branch.id
          companyId = companyId || branch.company_id
        }
      }

      // Get main warehouse
      let warehouseId = options.warehouseId
      if (!warehouseId) {
        const { data: wh } = await this.client.from('warehouses').select('id').limit(1).single()
        if (wh) warehouseId = wh.id
      }

      const todayStr = new Date().toISOString().slice(0, 10)

      for (const grp of supplierGroups) {
        // Create draft PO header
        const docNumber = `PO-AI-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`
        const poHeader = {
          company_id: companyId,
          branch_id: branchId,
          doc_number: docNumber,
          doc_date: todayStr,
          supplier_id: grp.supplierId !== 'default' ? grp.supplierId : null,
          warehouse_id: warehouseId,
          currency: 'LKR',
          exchange_rate: 1,
          subtotal: grp.totalEstimatedAmount,
          tax_amount: 0,
          total_amount: grp.totalEstimatedAmount,
          status: 'draft',
          remarks: `[AI-AUTO-REORDER] Auto-generated based on low stock thresholds and supplier lowest-price analysis. Proposed savings: LKR ${grp.totalProjectedSavings.toFixed(2)}.`
        }

        const { data: insertedPo, error: poErr } = await this.client
          .from('purchase_orders')
          .insert(poHeader)
          .select('id, doc_number, total_amount, status')
          .single()

        if (poErr) {
          console.warn('[InventoryReorderAgent] PO Header Insert Error:', poErr.message)
          continue
        }

        // Insert PO lines
        const lines = grp.items.map(it => ({
          order_id: insertedPo.id,
          item_id: it.itemId,
          quantity: it.recommendedQty,
          unit_price: it.bestUnitPrice,
          line_total: it.estimatedLineTotal,
          tax_amount: 0
        }))

        await this.client.from('purchase_order_lines').insert(lines)

        createdOrders.push({
          poId: insertedPo.id,
          docNumber: insertedPo.doc_number,
          supplierName: grp.supplierName,
          totalAmount: insertedPo.total_amount,
          itemCount: grp.items.length
        })
      }

      return { success: true, createdOrders }
    } catch (err: any) {
      console.error('[InventoryReorderAgent] Failed to create draft POs:', err)
      return { success: false, createdOrders: [], error: err.message }
    }
  }
}

export const inventoryReorderAgent = new InventoryReorderAgent()
