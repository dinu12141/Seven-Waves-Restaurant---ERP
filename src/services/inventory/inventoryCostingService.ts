// ═══════════════════════════════════════════════════════════════════════════
// Inventory Costing & Monthly COGS Service
// Supports:
//   1. Moving Weighted Average Cost (MAC / LKAS 2)
//   2. Multi-Supplier Price Comparison & Variance Tracking
//   3. Monthly Inventory Cost & Valuation Calculation (Method A vs Method B)
// Seven Waves Restaurant ERP
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'

export interface SupplierPriceSummary {
  supplierId: string
  supplierName: string
  supplierPhone?: string
  lastDate?: string
  lastDocNumber?: string
  lastUnitPrice: number
  minUnitPrice: number
  maxUnitPrice: number
  avgUnitPrice: number
  totalQty: number
  totalSpend: number
  receiptCount: number
  isLowestPrice: boolean
}

export interface ItemSupplierPriceAnalysis {
  item: {
    id: string
    code: string
    name: string
    category_name?: string
    uom_code?: string
    avg_cost: number
    last_purchase_price: number
    opening_balance: number
  }
  suppliers: SupplierPriceSummary[]
  bestSupplier: SupplierPriceSummary | null
  overallMin: number
  overallMax: number
  overallAvg: number
  priceSpread: number
  history: Array<{
    id: string
    doc_date: string
    doc_number: string
    supplier_name: string
    quantity: number
    unit_cost: number
    total_cost: number
  }>
}

export interface MonthlyItemCostRow {
  itemId: string
  itemCode: string
  itemName: string
  categoryName: string
  uom: string
  unitCost: number
  openingQty: number
  openingValue: number
  purchasesQty: number
  purchasesValue: number
  kitchenIssuesQty: number
  kitchenIssuesValue: number
  operatingIssuesQty: number
  operatingIssuesValue: number
  wastageQty: number
  wastageValue: number
  closingQty: number
  closingValue: number
  minPrice: number
  maxPrice: number
}

export interface MonthlyCostingReportData {
  yearMonth: string
  dateFrom: string
  dateTo: string
  openingValuation: number
  totalPurchases: number
  totalKitchenFoodCost: number
  totalOperatingSupplies: number
  totalWastage: number
  closingValuation: number
  posRevenue: number
  foodCostPct: number
  bookedCOGS: number
  periodicCOGS: number
  variance: number
  items: MonthlyItemCostRow[]
  categories: Array<{
    name: string
    openingValue: number
    purchasesValue: number
    cogsValue: number
    closingValue: number
  }>
}

export const inventoryCostingService = {
  /**
   * Fetches the supplier price history and comparison matrix for a specific item.
   */
  async fetchItemSupplierPrices(itemId: string): Promise<ItemSupplierPriceAnalysis> {
    // 1. Fetch item details
    const { data: itemData, error: itemErr } = await supabase
      .from('items')
      .select('id, code, name, avg_cost, last_purchase_price, attrs, category:item_categories(name), uom(code, name)')
      .eq('id', itemId)
      .single()

    if (itemErr || !itemData) {
      throw new Error(`Failed to load item: ${itemErr?.message || 'Not found'}`)
    }

    let opBal = 0
    if (Array.isArray(itemData.attrs)) {
      opBal = Number(itemData.attrs.find((a: any) => a?.key === 'opening_balance')?.value || 0)
    } else if (itemData.attrs && typeof itemData.attrs === 'object') {
      opBal = Number((itemData.attrs as any).opening_balance || 0)
    }

    const itemMeta = {
      id: itemData.id,
      code: itemData.code || '',
      name: itemData.name || '',
      category_name: (itemData.category as any)?.name || 'General',
      uom_code: (itemData.uom as any)?.code || 'PCS',
      avg_cost: Number(itemData.avg_cost || itemData.last_purchase_price || 0),
      last_purchase_price: Number(itemData.last_purchase_price || 0),
      opening_balance: opBal,
    }

    // 2. Fetch all posted GRN lines for this item
    const { data: lines, error: lineErr } = await supabase
      .from('goods_receipt_lines')
      .select(`
        id,
        quantity,
        unit_cost,
        grn:goods_receipts(id, doc_number, doc_date, status, supplier_id, supplier:suppliers(id, name, phone))
      `)
      .eq('item_id', itemId)

    if (lineErr) {
      console.error('[InventoryCosting] lineErr:', lineErr)
    }

    const postedLines = (lines || []).filter((l: any) => l.grn?.status === 'posted')

    // 3. Group by supplier
    const supplierMap = new Map<string, {
      supplierId: string
      supplierName: string
      supplierPhone?: string
      lastDate?: string
      lastDocNumber?: string
      lastUnitPrice: number
      prices: number[]
      totalQty: number
      totalSpend: number
      receiptCount: number
    }>()

    const history: ItemSupplierPriceAnalysis['history'] = []

    for (const l of postedLines) {
      const sId = l.grn?.supplier_id || 'unknown'
      const sName = (l.grn?.supplier as any)?.name || 'Direct Supplier'
      const sPhone = (l.grn?.supplier as any)?.phone || ''
      const price = Number(l.unit_cost || 0)
      const qty = Number(l.quantity || 0)
      const date = l.grn?.doc_date || ''
      const docNo = l.grn?.doc_number || ''

      history.push({
        id: l.id,
        doc_date: date,
        doc_number: docNo,
        supplier_name: sName,
        quantity: qty,
        unit_cost: price,
        total_cost: Math.round(qty * price * 100) / 100,
      })

      if (!supplierMap.has(sId)) {
        supplierMap.set(sId, {
          supplierId: sId,
          supplierName: sName,
          supplierPhone: sPhone,
          lastDate: date,
          lastDocNumber: docNo,
          lastUnitPrice: price,
          prices: [price],
          totalQty: qty,
          totalSpend: qty * price,
          receiptCount: 1,
        })
      } else {
        const existing = supplierMap.get(sId)!
        existing.prices.push(price)
        existing.totalQty += qty
        existing.totalSpend += qty * price
        existing.receiptCount += 1
        if (!existing.lastDate || date > existing.lastDate) {
          existing.lastDate = date
          existing.lastDocNumber = docNo
          existing.lastUnitPrice = price
        }
      }
    }

    // Sort history by date descending
    history.sort((a, b) => (b.doc_date || '').localeCompare(a.doc_date || ''))

    const supplierSummaries: SupplierPriceSummary[] = []
    let minPriceOverall = Infinity
    let maxPriceOverall = 0
    let totalSpendOverall = 0
    let totalQtyOverall = 0

    supplierMap.forEach((entry) => {
      const minP = Math.min(...entry.prices)
      const maxP = Math.max(...entry.prices)
      const avgP = entry.totalQty > 0 ? entry.totalSpend / entry.totalQty : minP

      if (minP < minPriceOverall) minPriceOverall = minP
      if (maxP > maxPriceOverall) maxPriceOverall = maxP
      totalSpendOverall += entry.totalSpend
      totalQtyOverall += entry.totalQty

      supplierSummaries.push({
        supplierId: entry.supplierId,
        supplierName: entry.supplierName,
        supplierPhone: entry.supplierPhone,
        lastDate: entry.lastDate,
        lastDocNumber: entry.lastDocNumber,
        lastUnitPrice: entry.lastUnitPrice,
        minUnitPrice: minP,
        maxUnitPrice: maxP,
        avgUnitPrice: Math.round(avgP * 100) / 100,
        totalQty: entry.totalQty,
        totalSpend: Math.round(entry.totalSpend * 100) / 100,
        receiptCount: entry.receiptCount,
        isLowestPrice: false,
      })
    })

    if (minPriceOverall === Infinity) minPriceOverall = itemMeta.last_purchase_price || itemMeta.avg_cost
    if (maxPriceOverall === 0) maxPriceOverall = itemMeta.last_purchase_price || itemMeta.avg_cost

    let bestSupplier: SupplierPriceSummary | null = null
    supplierSummaries.forEach((s) => {
      if (s.minUnitPrice <= minPriceOverall) {
        s.isLowestPrice = true
        bestSupplier = s
      }
    })

    // Sort suppliers by lowest price first
    supplierSummaries.sort((a, b) => a.minUnitPrice - b.minUnitPrice)

    const overallAvg = totalQtyOverall > 0 ? totalSpendOverall / totalQtyOverall : itemMeta.avg_cost

    return {
      item: itemMeta,
      suppliers: supplierSummaries,
      bestSupplier,
      overallMin: minPriceOverall,
      overallMax: maxPriceOverall,
      overallAvg: Math.round(overallAvg * 100) / 100,
      priceSpread: Math.round((maxPriceOverall - minPriceOverall) * 100) / 100,
      history,
    }
  },

  /**
   * Generates the comprehensive Monthly Inventory Cost & Valuation Report data.
   */
  async fetchMonthlyCostingReport(
    yearMonth: string,
    filters: { warehouseId?: string; categoryId?: string; branchId?: string } = {},
  ): Promise<MonthlyCostingReportData> {
    const ym = yearMonth || new Date().toISOString().slice(0, 7)
    const [year, month] = ym.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    const dateFrom = `${ym}-01`
    const dateTo = `${ym}-${String(lastDay).padStart(2, '0')}`

    // 1. Fetch Items
    let itemQuery = supabase
      .from('items')
      .select('id, code, name, category_id, avg_cost, last_purchase_price, attrs, category:item_categories(name), uom(code, name)')
      .eq('is_active', true)
      .order('name')

    if (filters.categoryId) {
      itemQuery = itemQuery.eq('category_id', filters.categoryId)
    }

    const { data: rawItems } = await itemQuery

    const itemsMap = new Map<string, MonthlyItemCostRow>()

    for (const it of rawItems || []) {
      let opBal = 0
      if (Array.isArray(it.attrs)) {
        opBal = Number(it.attrs.find((a: any) => a?.key === 'opening_balance')?.value || 0)
      } else if (it.attrs && typeof it.attrs === 'object') {
        opBal = Number((it.attrs as any).opening_balance || 0)
      }

      const cost = Number(it.avg_cost || it.last_purchase_price || 0)
      itemsMap.set(it.id, {
        itemId: it.id,
        itemCode: it.code || '',
        itemName: it.name || '',
        categoryName: (it.category as any)?.name || 'General',
        uom: (it.uom as any)?.code || 'PCS',
        unitCost: cost,
        openingQty: opBal,
        openingValue: Math.round(opBal * cost * 100) / 100,
        purchasesQty: 0,
        purchasesValue: 0,
        kitchenIssuesQty: 0,
        kitchenIssuesValue: 0,
        operatingIssuesQty: 0,
        operatingIssuesValue: 0,
        wastageQty: 0,
        wastageValue: 0,
        closingQty: opBal,
        closingValue: Math.round(opBal * cost * 100) / 100,
        minPrice: cost,
        maxPrice: cost,
      })
    }

    // 2. Fetch inventory_ledger movements for this period
    let ledgerQuery = supabase
      .from('inventory_ledger')
      .select('id, item_id, doc_type, direction, quantity, unit_cost, total_cost, posted_at, warehouse_id')
      .gte('posted_at', `${dateFrom}T00:00:00`)
      .lte('posted_at', `${dateTo}T23:59:59`)

    if (filters.warehouseId) {
      ledgerQuery = ledgerQuery.eq('warehouse_id', filters.warehouseId)
    }

    const { data: ledgerEntries } = await ledgerQuery

    for (const leg of ledgerEntries || []) {
      const row = itemsMap.get(leg.item_id)
      if (!row) continue

      const qty = Number(leg.quantity || 0)
      const cost = Number(leg.total_cost || qty * Number(leg.unit_cost || row.unitCost || 0))
      const uCost = Number(leg.unit_cost || 0)

      if (uCost > 0) {
        if (row.minPrice === 0 || uCost < row.minPrice) row.minPrice = uCost
        if (uCost > row.maxPrice) row.maxPrice = uCost
      }

      if (leg.doc_type === 'GRN' && leg.direction === 'IN') {
        row.purchasesQty += qty
        row.purchasesValue += cost
      } else if (leg.doc_type === 'WASTAGE') {
        row.wastageQty += qty
        row.wastageValue += cost
      } else if (leg.doc_type === 'GIN' || leg.doc_type === 'GIN_ISSUE' || leg.doc_type === 'BOM_DEDUCT') {
        // Categorize into Food Cost vs Operating Supplies
        const cat = (row.categoryName || '').toLowerCase()
        const iName = (row.itemName || '').toLowerCase()
        const isOperating =
          cat.includes('clean') ||
          cat.includes('fuel') ||
          cat.includes('gas') ||
          cat.includes('chemical') ||
          cat.includes('hygiene') ||
          iName.includes('bleach') ||
          iName.includes('soap') ||
          iName.includes('detergent') ||
          iName.includes('clean') ||
          iName.includes('wash') ||
          iName.includes('dishwash') ||
          iName.includes('handwash') ||
          iName.includes('sanit') ||
          iName.includes('disinfect') ||
          iName.includes('harpic') ||
          iName.includes('vim') ||
          iName.includes('toilet') ||
          iName.includes('gas') ||
          iName.includes('lpg') ||
          iName.includes('fuel') ||
          iName.includes('broom') ||
          iName.includes('brush') ||
          iName.includes('idal') ||
          iName.includes('kohu') ||
          iName.includes('coir') ||
          iName.includes('mop') ||
          iName.includes('scrubber') ||
          (iName.includes('sponge') && !iName.includes('mix') && !iName.includes('cake')) ||
          iName.includes('serviette') ||
          iName.includes('paper towel') ||
          iName.includes('tissue')

        if (isOperating) {
          row.operatingIssuesQty += qty
          row.operatingIssuesValue += cost
        } else {
          row.kitchenIssuesQty += qty
          row.kitchenIssuesValue += cost
        }
      }
    }

    // 3. Compute Closing stock and values
    let totalOpeningVal = 0
    let totalPurchasesVal = 0
    let totalKitchenVal = 0
    let totalOperatingVal = 0
    let totalWastageVal = 0
    let totalClosingVal = 0

    const itemRows = Array.from(itemsMap.values())

    itemRows.forEach((r) => {
      // Closing = Opening + Purchases - KitchenIssues - OperatingIssues - Wastage
      r.closingQty = Math.max(
        0,
        r.openingQty + r.purchasesQty - r.kitchenIssuesQty - r.operatingIssuesQty - r.wastageQty,
      )
      r.closingValue = Math.round(r.closingQty * r.unitCost * 100) / 100

      totalOpeningVal += r.openingValue
      totalPurchasesVal += r.purchasesValue
      totalKitchenVal += r.kitchenIssuesValue
      totalOperatingVal += r.operatingIssuesValue
      totalWastageVal += r.wastageValue
      totalClosingVal += r.closingValue
    })

    // 4. Monthly POS Revenue from orders
    let revQuery = supabase
      .from('orders')
      .select('total_amount, status')
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lte('created_at', `${dateTo}T23:59:59`)

    if (filters.branchId) {
      revQuery = revQuery.eq('branch_id', filters.branchId)
    }

    const { data: orderData } = await revQuery
    const validOrders = (orderData || []).filter(
      (o) => o.status !== 'cancelled' && o.status !== 'void',
    )
    const posRevenue = validOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0)

    // 5. Method A vs Method B Reconciliation
    const bookedCOGS = Math.round((totalKitchenVal + totalWastageVal) * 100) / 100
    const periodicCOGS = Math.round((totalOpeningVal + totalPurchasesVal - totalClosingVal) * 100) / 100
    const variance = Math.round((periodicCOGS - bookedCOGS) * 100) / 100
    const foodCostPct = posRevenue > 0 ? Math.round((bookedCOGS / posRevenue) * 10000) / 100 : 0

    // 6. Category breakdown
    const catMap = new Map<string, {
      name: string
      openingValue: number
      purchasesValue: number
      cogsValue: number
      closingValue: number
    }>()

    itemRows.forEach((r) => {
      const c = r.categoryName || 'General'
      if (!catMap.has(c)) {
        catMap.set(c, {
          name: c,
          openingValue: r.openingValue,
          purchasesValue: r.purchasesValue,
          cogsValue: r.kitchenIssuesValue + r.operatingIssuesValue,
          closingValue: r.closingValue,
        })
      } else {
        const existing = catMap.get(c)!
        existing.openingValue += r.openingValue
        existing.purchasesValue += r.purchasesValue
        existing.cogsValue += r.kitchenIssuesValue + r.operatingIssuesValue
        existing.closingValue += r.closingValue
      }
    })

    return {
      yearMonth: ym,
      dateFrom,
      dateTo,
      openingValuation: Math.round(totalOpeningVal * 100) / 100,
      totalPurchases: Math.round(totalPurchasesVal * 100) / 100,
      totalKitchenFoodCost: Math.round(totalKitchenVal * 100) / 100,
      totalOperatingSupplies: Math.round(totalOperatingVal * 100) / 100,
      totalWastage: Math.round(totalWastageVal * 100) / 100,
      closingValuation: Math.round(totalClosingVal * 100) / 100,
      posRevenue: Math.round(posRevenue * 100) / 100,
      foodCostPct,
      bookedCOGS,
      periodicCOGS,
      variance,
      items: itemRows,
      categories: Array.from(catMap.values()),
    }
  },
}

