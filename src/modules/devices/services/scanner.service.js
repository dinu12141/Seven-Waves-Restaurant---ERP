// ═══════════════════════════════════════════════════════════════════
// Scanner Service — Barcode scanner workflows
// Seven Waves ERP — Step 06 Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

import { api } from 'src/core/api/ApiClient'

const MODULE = 'devices.scanner'

/**
 * Lookup an inventory item by barcode/SKU.
 * Used by POS scan, inventory scan, GRN scan.
 */
export async function lookupByBarcode(barcode, branchId) {
  const query = (c) => {
    let q = c.from('menu_items')
      .select('id, name, sku, barcode, price, category, stock_quantity')
      .or(`barcode.eq.${barcode},sku.eq.${barcode}`)
      .limit(1)
      .maybeSingle()
    if (branchId) q = q.eq('branch_id', branchId)
    return q
  }
  return api.query(query, { module: MODULE, action: 'lookupByBarcode' })
}

/**
 * Lookup a customer by loyalty card barcode/QR.
 */
export async function lookupCustomerByCard(cardCode) {
  return api.query(
    (c) => c.from('customers')
      .select('id, name, phone, email, loyalty_points, loyalty_tier')
      .eq('loyalty_card_number', cardCode)
      .maybeSingle(),
    { module: MODULE, action: 'lookupCustomerByCard' }
  )
}

/**
 * Log a scan event for audit.
 */
export async function logScanEvent(scanData) {
  return api.query(
    (c) => c.from('audit_logs').insert({
      action: 'barcode_scan',
      module: 'devices',
      details: scanData,
      created_at: new Date().toISOString(),
    }),
    { module: MODULE, action: 'logScanEvent', silent: true }
  )
}
