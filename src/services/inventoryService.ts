/**
 * Inventory Service — centralised data layer for the Inventory module.
 *
 * All Supabase calls go through this single file.
 * The UI tabs import these composables instead of touching supabase directly.
 *
 * Naming convention follows the ACTUAL database tables:
 *   inventory_documents, inventory_document_lines, items, item_categories,
 *   warehouses, suppliers, uom, stock_on_hand, inventory_ledger
 *
 * Views:
 *   v_stock_on_hand, v_low_stock_alerts, v_inventory_ledger
 *
 * RPC:
 *   generate_inv_doc_number(p_company_id, p_doc_type)
 */

import { ref, type Ref } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'

/* -------------------------------------------------------
   Helpers — Lazy calls to useAuthStore() avoid calling
   before Pinia has initialized.
------------------------------------------------------- */

function getCompanyId(): string | null {
  const auth = useAuthStore()
  return auth.currentBranch?.company_id ?? auth.profile?.company_id ?? null
}

function getBranchId(): string | null {
  const auth = useAuthStore()
  return auth.currentBranch?.id ?? null
}

function getUserId(): string | null {
  const auth = useAuthStore()
  return auth.user?.id ?? null
}

/* ====================================================================
   DOCUMENT FILTERS
==================================================================== */

export interface DocumentFilters {
  docType?: string
  status?: string
  warehouseId?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

export interface DocumentLinePayload {
  item_id: string
  uom_id: string
  quantity: number
  unit_cost: number
  batch_no?: string
  expiry_date?: string
  system_qty?: number
  counted_qty?: number
  variance_qty?: number
  notes?: string
}

export interface DocumentHeaderPayload {
  doc_type: string
  doc_date: string
  warehouse_id: string
  target_warehouse_id?: string
  supplier_id?: string
  reference_no?: string
  remarks?: string
}

/* ====================================================================
   1.  listDocuments(filters)
==================================================================== */

export function useDocumentList() {
  const documents: Ref<any[]> = ref([])
  const loading = ref(false)
  const error: Ref<string | null> = ref(null)

  async function listDocuments(filters: DocumentFilters = {}) {
    loading.value = true
    error.value = null
    try {
      const companyId = getCompanyId()
      if (!companyId) throw new Error('No company context — please log in.')

      let query = supabase
        .from('inventory_documents')
        .select(
          `
          *,
          warehouse:warehouses!inventory_documents_warehouse_id_fkey(id, name, code, warehouse_type),
          target_wh:warehouses!inventory_documents_target_warehouse_id_fkey(id, name, code),
          supplier:suppliers(id, name),
          creator:profiles!inventory_documents_created_by_fkey(full_name),
          lines:inventory_document_lines(
            id,
            item:items(id, name, code)
          )
        `,
        )
        .eq('company_id', companyId)
        .order('doc_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters.docType) query = query.eq('doc_type', filters.docType)
      if (filters.status) query = query.eq('status', filters.status)
      if (filters.warehouseId) query = query.eq('warehouse_id', filters.warehouseId)
      if (filters.dateFrom) query = query.gte('doc_date', filters.dateFrom)
      if (filters.dateTo) query = query.lte('doc_date', filters.dateTo)
      if (filters.search) {
        query = query.or(
          `doc_number.ilike.%${filters.search}%,reference_no.ilike.%${filters.search}%`,
        )
      }

      const { data, error: err } = await query.limit(200)
      if (err) throw err

      // Flatten for UI convenience
      documents.value = (data || []).map((d: any) => {
        // Aggregate all unique item names and codes from lines
        const itemNames: string[] = []
        const itemCodes: string[] = []
        if (d.lines && Array.isArray(d.lines)) {
          d.lines.forEach((line: any) => {
            const name = line.item?.name
            const code = line.item?.code
            if (name && !itemNames.includes(name)) {
              itemNames.push(name)
            }
            if (code && !itemCodes.includes(code)) {
              itemCodes.push(code)
            }
          })
        }
        return {
          ...d,
          warehouse_name: d.warehouse?.name || '',
          warehouse_code: d.warehouse?.code || '',
          target_warehouse_name: d.target_wh?.name || '',
          supplier_name: d.supplier?.name || '',
          created_by_name: d.creator?.full_name || '',
          item_names: itemNames.join(', ') || '-',
          item_codes: itemCodes.join(', ') || '-',
        }
      })
    } catch (e: any) {
      error.value = e.message
      console.error('[inventoryService] listDocuments error:', e)
    } finally {
      loading.value = false
    }
  }

  return { documents, loading, error, listDocuments }
}


/**
 * listOpenPOs()
 * Returns all POSTED Purchase Orders that have NOT been referenced by a GRN yet.
 */
export async function listOpenPOs() {
  const companyId = getCompanyId()
  if (!companyId) return []

  try {
    // 1. Get all posted POs
    const { data: pos, error: poErr } = await supabase
      .from('inventory_documents')
      .select(
        `
        *,
        supplier:suppliers!supplier_id(id, name, email),
        warehouse:warehouses!warehouse_id(id, name)
      `,
      )
      .eq('company_id', companyId)
      .eq('doc_type', 'PO')
      .eq('status', 'posted')
    if (poErr) throw poErr
    if (!pos || pos.length === 0) return []

    // 2. Get all GRNs to check which POs are already used
    // We look for "Imported from PO: {doc_number}" in the remarks
    const { data: grns, error: grnErr } = await supabase
      .from('inventory_documents')
      .select('remarks')
      .eq('company_id', companyId)
      .eq('doc_type', 'GRN')
      .not('status', 'eq', 'cancelled')

    if (grnErr) throw grnErr

    const usedPONumbers = new Set<string>()
    grns?.forEach((g) => {
      if (g.remarks) {
        pos.forEach((po) => {
          if (g.remarks.includes(`Imported from PO: ${po.doc_number}`)) {
            usedPONumbers.add(po.doc_number)
          }
        })
      }
    })

    return pos.filter((po) => !usedPONumbers.has(po.doc_number))
  } catch (e) {
    console.error('[inventoryService] listOpenPOs error:', e)
    throw e
  }
}

export interface DocumentHeaderPayload {
  doc_type: string
  doc_date: string
  warehouse_id: string
  target_warehouse_id?: string | null
  supplier_id?: string | null
  reference_no?: string | null
  remarks?: string | null
  // SAP Inspired fields
  posting_date?: string
  delivery_date?: string
  sub_total?: number
  tax_total?: number
  grand_total?: number
}

export interface DocumentLinePayload {
  item_id: string
  quantity: number
  unit_cost: number
  batch_no?: string
  expiry_date?: string
  notes?: string
  // SAP Inspired fields
  tax_code?: string
  tax_amount?: number
  line_total?: number
}

/* ====================================================================
   2.  fetchDocument(id)  — single doc + lines
==================================================================== */

export async function fetchDocumentById(docId: string) {
  const { data: header, error: err1 } = await supabase
    .from('inventory_documents')
    .select(
      `
      *,
      warehouse:warehouses!inventory_documents_warehouse_id_fkey(id, name, code, warehouse_type),
      target_wh:warehouses!inventory_documents_target_warehouse_id_fkey(id, name, code),
      supplier:suppliers(id, name, code, email),
      creator:profiles!inventory_documents_created_by_fkey(full_name)
    `,
    )
    .eq('id', docId)
    .single()
  if (err1) throw err1

  const { data: lines, error: err2 } = await supabase
    .from('inventory_document_lines')
    .select(
      `
      *,
      item:items(id, code, name, avg_cost),
      uom:uom(id, code)
    `,
    )
    .eq('document_id', docId)
    .order('line_number')
  if (err2) throw err2

  return {
    header: {
      ...header,
      warehouse_name: header.warehouse?.name || '',
      supplier_name: header.supplier?.name || '',
      supplier_code: header.supplier?.code || '',
      supplier_email: header.supplier?.email || '',
      target_warehouse_name: header.target_wh?.name || '',
      created_by_name: header.creator?.full_name || '',
      reference_no: header.reference_type || '',
    },
    lines: (lines || []).map((l: any) => ({
      ...l,
      item_name: l.item?.name || '',
      item_code: l.item?.code || '',
      uom_code: l.uom?.code || '',
    })),
  }
}

/**
 * sendPOEmail(docId)
 * Triggers the send-po-email Edge Function
 */
export async function sendPOEmail(docId: string, customMessage?: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke('send-po-email', {
    body: { docId, customMessage },
  })
  if (error) throw error
  return data
}

/* ====================================================================
   3.  createDocument(header, lines)
==================================================================== */

export async function createDocument(
  header: DocumentHeaderPayload,
  lines: DocumentLinePayload[],
): Promise<any> {
  const companyId = getCompanyId()
  const branchId = getBranchId()
  const userId = getUserId()

  if (!companyId || !branchId) throw new Error('No company/branch context.')

  // 1. Generate doc number via RPC
  const { data: docNumber, error: seqErr } = await supabase.rpc('generate_inv_doc_number', {
    p_company_id: companyId,
    p_doc_type: header.doc_type,
  })
  if (seqErr) throw seqErr

  // 2. Calculate totals
  const totalQty = lines.reduce((s, l) => s + (l.quantity || 0), 0)
  const totalCost = lines.reduce((s, l) => s + (l.quantity || 0) * (l.unit_cost || 0), 0)

  // 3. Insert header
  const { data: doc, error: err1 } = await supabase
    .from('inventory_documents')
    .insert({
      company_id: companyId,
      branch_id: branchId,
      doc_type: header.doc_type,
      doc_number: docNumber,
      doc_date: header.doc_date || new Date().toISOString().split('T')[0],
      warehouse_id: header.warehouse_id,
      target_warehouse_id: header.target_warehouse_id || null,
      supplier_id: header.supplier_id || null,
      reference_no: header.reference_no || null,
      remarks: header.remarks || null,
      status: 'draft',
      total_qty: totalQty,
      total_cost: totalCost,
      created_by: userId || null,
      // SAP Fields
      posting_date: header.posting_date || header.doc_date,
      delivery_date: header.delivery_date || null,
      sub_total: header.sub_total || totalCost,
      tax_total: header.tax_total || 0,
      grand_total: header.grand_total || totalCost,
    })
    .select()
    .single()
  if (err1) throw err1

  // 4. Insert lines
  if (lines.length > 0) {
    const rows = lines.map((l, idx) => ({
      document_id: doc.id,
      line_number: idx + 1,
      item_id: l.item_id,
      uom_id: l.uom_id,
      quantity: l.quantity,
      unit_cost: l.unit_cost || 0,
      batch_no: l.batch_no || null,
      expiry_date: l.expiry_date || null,
      system_qty: l.system_qty ?? null,
      counted_qty: l.counted_qty ?? null,
      variance_qty: l.variance_qty ?? null,
      notes: l.notes || null,
      // SAP Fields
      tax_code: l.tax_code || null,
      tax_amount: l.tax_amount || 0,
      // line_total handled by DB
    }))
    const { error: err2 } = await supabase.from('inventory_document_lines').insert(rows)
    if (err2) throw err2
  }

  return doc
}

/* ====================================================================
   4.  updateDraft(document)  — update header + replace lines
==================================================================== */

export async function updateDraft(
  docId: string,
  header: Partial<DocumentHeaderPayload>,
  lines: DocumentLinePayload[],
): Promise<any> {
  // Update header
  const totalQty = lines.reduce((s, l) => s + (l.quantity || 0), 0)
  const totalCost = lines.reduce((s, l) => s + (l.quantity || 0) * (l.unit_cost || 0), 0)

  const { data: doc, error: err1 } = await supabase
    .from('inventory_documents')
    .update({
      doc_type: header.doc_type,
      doc_date: header.doc_date,
      warehouse_id: header.warehouse_id,
      target_warehouse_id: header.target_warehouse_id || null,
      supplier_id: header.supplier_id || null,
      reference_no: header.reference_no || null,
      remarks: header.remarks || null,
      total_qty: totalQty,
      total_cost: totalCost,
      // SAP Fields
      posting_date: header.posting_date,
      delivery_date: header.delivery_date,
      sub_total: header.sub_total,
      tax_total: header.tax_total,
      grand_total: header.grand_total,
    })
    .eq('id', docId)
    .eq('status', 'draft') // RLS: only drafts can be edited
    .select()
    .single()
  if (err1) throw err1

  // Delete old lines, insert new ones
  const { error: delErr } = await supabase
    .from('inventory_document_lines')
    .delete()
    .eq('document_id', docId)
  if (delErr) throw delErr

  if (lines.length > 0) {
    const rows = lines.map((l, idx) => ({
      document_id: docId,
      line_number: idx + 1,
      item_id: l.item_id,
      uom_id: l.uom_id,
      quantity: l.quantity,
      unit_cost: l.unit_cost || 0,
      batch_no: l.batch_no || null,
      expiry_date: l.expiry_date || null,
      system_qty: l.system_qty ?? null,
      counted_qty: l.counted_qty ?? null,
      variance_qty: l.variance_qty ?? null,
      notes: l.notes || null,
      // SAP Fields
      tax_code: l.tax_code || null,
      tax_amount: l.tax_amount || 0,
      // line_total handled by DB
    }))
    const { error: err2 } = await supabase.from('inventory_document_lines').insert(rows)
    if (err2) throw err2
  }

  return doc
}

/* ====================================================================
   5.  postDocument(docId)
       Triggers the BEFORE UPDATE trigger which does all ledger inserts
==================================================================== */

export async function postDocument(docId: string): Promise<any> {
  const { data, error } = await supabase
    .from('inventory_documents')
    .update({ status: 'posted' })
    .eq('id', docId)
    .eq('status', 'draft')
    .select()
    .single()
  if (error) throw error
  return data
}

/* ====================================================================
   6.  cancelDocument(docId)
       The trigger's cancel branch creates reversal ledger entries
==================================================================== */

export async function cancelDocument(docId: string): Promise<any> {
  const { data, error } = await supabase
    .from('inventory_documents')
    .update({ status: 'cancelled' })
    .eq('id', docId)
    .eq('status', 'posted')
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteDocument(docId: string): Promise<void> {
  const { error } = await supabase.from('inventory_documents').delete().eq('id', docId)
  if (error) throw error
}

/* ====================================================================
   7.  ITEMS MASTER (CRUD)
==================================================================== */

export function useItemsList() {
  const items: Ref<any[]> = ref([])
  const loading = ref(false)

  async function listItems() {
    loading.value = true
    try {
      const companyId = getCompanyId()
      if (!companyId) throw new Error('No company context.')

      const { data, error } = await supabase
        .from('items')
        .select(
          `
          *,
          category:item_categories(id, name),
          inv_uom:uom!items_inventory_uom_id_fkey(id, code, name),
          default_supplier:suppliers(id, name)
        `,
        )
        .eq('company_id', companyId)
        .order('name')

      if (error) throw error
      items.value = (data || []).map((i: any) => ({
        ...i,
        category_name: i.category?.name || '',
        uom_code: i.inv_uom?.code || '',
        uom_id: i.inv_uom?.id || '',
        supplier_name: i.default_supplier?.name || '',
      }))
    } catch (e: any) {
      console.error('[inventoryService] listItems error:', e)
    } finally {
      loading.value = false
    }
  }

  async function createItem(item: Record<string, any>) {
    const companyId = getCompanyId()
    const { data, error } = await supabase
      .from('items')
      .insert({ ...item, company_id: companyId })
      .select('id')
      .single()
    if (error) throw error
    return data
  }

  async function updateItem(id: string, updates: Record<string, any>) {
    const { data, error } = await supabase
      .from('items')
      .update(updates)
      .eq('id', id)
      .select('id')
      .single()
    if (error) throw error
    return data
  }

  async function deactivateItem(id: string) {
    return updateItem(id, { is_active: false })
  }

  async function deleteItem(id: string) {
    const { data, error } = await supabase.rpc('delete_item_cascade', { p_item_id: id })
    if (error) throw error
    if (data && !data.success) throw new Error(data.error || 'Delete failed')
    // Remove from local list
    items.value = items.value.filter((i: any) => i.id !== id)
    return data
  }

  async function generateNextItemCode() {
    const companyId = getCompanyId()
    if (!companyId) return ''
    const { data, error } = await supabase.rpc('generate_item_code', {
      p_company_id: companyId,
    })
    if (error) throw error
    return data
  }

  return { items, loading, listItems, createItem, updateItem, deactivateItem, deleteItem, generateNextItemCode }
}

/* ====================================================================
   8.  WAREHOUSES (CRUD)
==================================================================== */

export function useWarehouseList() {
  const warehouses: Ref<any[]> = ref([])
  const loading = ref(false)

  async function listWarehouses() {
    loading.value = true
    try {
      const companyId = getCompanyId()
      if (!companyId) throw new Error('No company context.')

      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('company_id', companyId)
        .order('warehouse_type')
        .order('name')

      if (error) throw error
      warehouses.value = data || []
    } catch (e: any) {
      console.error('[inventoryService] listWarehouses error:', e)
    } finally {
      loading.value = false
    }
  }

  async function createWarehouse(wh: Record<string, any>) {
    const companyId = getCompanyId()
    const branchId = getBranchId()
    const { data, error } = await supabase
      .from('warehouses')
      .insert({ ...wh, company_id: companyId, branch_id: branchId })
      .select()
      .single()
    if (error) throw error
    warehouses.value.push(data)
    return data
  }

  async function updateWarehouse(id: string, updates: Record<string, any>) {
    const { data, error } = await supabase
      .from('warehouses')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    const idx = warehouses.value.findIndex((w: any) => w.id === id)
    if (idx !== -1) warehouses.value[idx] = { ...warehouses.value[idx], ...data }
    return data
  }

  async function deleteWarehouse(id: string) {
    const { error } = await supabase
      .from('warehouses')
      .delete()
      .eq('id', id)
    if (error) throw error
    warehouses.value = warehouses.value.filter((w: any) => w.id !== id)
  }

  return { warehouses, loading, listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse }
}

/* ====================================================================
   9.  SUPPLIERS
==================================================================== */

export function useSupplierList() {
  const suppliers: Ref<any[]> = ref([])
  const loading = ref(false)

  async function listSuppliers() {
    loading.value = true
    try {
      const companyId = getCompanyId()
      if (!companyId) {
        console.warn('[inventoryService] listSuppliers: No company ID found.')
        return
      }
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('company_id', companyId)
        .order('name')
      if (error) throw error
      suppliers.value = data || []
    } catch (e: any) {
      console.error('[inventoryService] listSuppliers error:', e)
    } finally {
      loading.value = false
    }
  }

  async function createSupplier(supplier: Record<string, any>) {
    const companyId = getCompanyId()
    if (!companyId) throw new Error('Authentication required: Company ID not found.')

    const payload: any = { ...supplier, company_id: companyId }
    // If code is missing, generate one
    if (!payload.code) {
      const { data: nextCode } = await supabase.rpc('generate_supplier_code', {
        p_company_id: companyId,
      })
      if (nextCode) payload.code = nextCode
    }

    const { data, error } = await supabase.from('suppliers').insert(payload).select().single()
    if (error) throw error
    suppliers.value.push(data)
    return data
  }

  async function updateSupplier(id: string, updates: Record<string, any>) {
    const { data, error } = await supabase
      .from('suppliers')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    const idx = suppliers.value.findIndex((s: any) => s.id === id)
    if (idx !== -1) suppliers.value[idx] = { ...suppliers.value[idx], ...data }
    return data
  }

  async function generateNextSupplierCode() {
    const companyId = getCompanyId()
    if (!companyId) return ''
    const { data, error } = await supabase.rpc('generate_supplier_code', {
      p_company_id: companyId,
    })
    if (error) throw error
    return data
  }

  return {
    suppliers,
    loading,
    listSuppliers,
    createSupplier,
    updateSupplier,
    generateNextSupplierCode,
  }
}

/* ====================================================================
   10.  CATEGORIES
==================================================================== */

export function useCategoryList() {
  const categories: Ref<any[]> = ref([])
  const loading = ref(false)

  async function listCategories() {
    loading.value = true
    try {
      const companyId = getCompanyId()
      const { data, error } = await supabase
        .from('item_categories')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      categories.value = data || []
    } catch (e: any) {
      console.error('[inventoryService] listCategories error:', e)
    } finally {
      loading.value = false
    }
  }

  async function createCategory(name: string) {
    const companyId = getCompanyId()
    const { data, error } = await supabase
      .from('item_categories')
      .insert({ company_id: companyId, name, is_active: true })
      .select()
      .single()
    if (error) throw error
    categories.value.push(data)
    return data
  }

  async function deleteCategory(id: string) {
    const { error } = await supabase.from('item_categories').delete().eq('id', id)
    if (error) throw error
    categories.value = categories.value.filter((c: any) => c.id !== id)
  }

  return { categories, loading, listCategories, createCategory, deleteCategory }
}

/* ====================================================================
   11.  UOMs
==================================================================== */

export function useUomList() {
  const uoms: Ref<any[]> = ref([])
  const loading = ref(false)

  async function listUoms() {
    loading.value = true
    try {
      const companyId = getCompanyId()
      if (!companyId) return
      const { data, error } = await supabase
        .from('uom')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('code')
      if (error) throw error
      uoms.value = data || []
    } catch (e: any) {
      console.error('[inventoryService] listUoms error:', e)
    } finally {
      loading.value = false
    }
  }

  async function createUom(code: string) {
    const companyId = getCompanyId()
    const { data, error } = await supabase
      .from('uom')
      .insert({ company_id: companyId, code, name: code, is_active: true })
      .select()
      .single()
    if (error) throw error
    uoms.value.push(data)
    return data
  }

  async function deleteUom(id: string) {
    const { error } = await supabase.from('uom').delete().eq('id', id)
    if (error) throw error
    uoms.value = uoms.value.filter((u: any) => u.id !== id)
  }

  return { uoms, loading, listUoms, createUom, deleteUom }
}

/* ====================================================================
   12.  STOCK ON HAND (Dashboard)
==================================================================== */

export function useStockDashboard() {
  const stockOnHand: Ref<any[]> = ref([])
  const lowStockAlerts: Ref<any[]> = ref([])
  const loading = ref(false)
  let channel: any = null

  function updateAlerts() {
    lowStockAlerts.value = stockOnHand.value.filter(
      (r: any) => r.stock_status === 'low_stock' || r.stock_status === 'out_of_stock',
    )
  }

  async function fetchStockOnHand() {
    loading.value = true
    try {
      const companyId = getCompanyId()
      if (!companyId) return

      // 1. Initial Fetch
      const { data, error } = await supabase
        .from('v_stock_on_hand')
        .select('*')
        .eq('company_id', companyId)
        .order('item_name')
      if (error) throw error
      stockOnHand.value = data || []
      updateAlerts()

      // 2. Real-time Subscription
      if (!channel) {
        channel = supabase
          .channel('stock-on-hand-realtime')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'stock_on_hand',
              filter: `company_id=eq.${companyId}`,
            },
            async () => {
              // Silently refresh from the view when the underlying table changes
              const { data: newData } = await supabase
                .from('v_stock_on_hand')
                .select('*')
                .eq('company_id', companyId)
                .order('item_name')
              if (newData) {
                stockOnHand.value = newData
                updateAlerts()
              }
            },
          )
          .subscribe()
      }
    } catch (e: any) {
      console.error('[inventoryService] fetchStockOnHand error:', e)
    } finally {
      loading.value = false
    }
  }

  return { stockOnHand, lowStockAlerts, loading, fetchStockOnHand }
}

/* ====================================================================
   12b. FETCH STOCK BY WAREHOUSE
         Returns a Map<item_id, qty_on_hand> for a given warehouse.
         Used by the transfer/GIN document editor to validate quantities.
         NOTE: queries v_stock_on_hand (the real-time ledger view) with
         company_id so RLS does not filter out rows.
==================================================================== */
export async function fetchStockByWarehouse(warehouseId: string): Promise<Record<string, number>> {
  if (!warehouseId) return {}
  try {
    const companyId = getCompanyId()
    let query = supabase
      .from('v_stock_on_hand')
      .select('item_id, qty_on_hand')
      .eq('warehouse_id', warehouseId)
    if (companyId) query = query.eq('company_id', companyId)

    const { data, error } = await query
    if (error) throw error

    const result: Record<string, number> = {}
    ;(data || []).forEach((r: any) => {
      result[r.item_id] = Number(r.qty_on_hand) || 0
    })
    console.debug(
      `[inventoryService] fetchStockByWarehouse(${warehouseId}): ${Object.keys(result).length} items`,
      result,
    )
    return result
  } catch (e: any) {
    console.error('[inventoryService] fetchStockByWarehouse error:', e)
    return {}
  }
}


/* ====================================================================
   13.  STOCK LEDGER (Audit Trail)
==================================================================== */

export interface LedgerFilters {
  docType?: string
  direction?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

export function useStockLedger() {
  const entries: Ref<any[]> = ref([])
  const loading = ref(false)
  let channel: any = null

  async function fetchLedger(filters: LedgerFilters = {}) {
    loading.value = true
    try {
      const companyId = getCompanyId()
      if (!companyId) return
      let query = supabase
        .from('v_inventory_ledger')
        .select('*')
        .eq('company_id', companyId)
        .order('posted_at', { ascending: false })
        .limit(500)

      if (filters.docType) query = query.eq('doc_type', filters.docType)
      if (filters.direction) query = query.eq('direction', filters.direction)
      if (filters.dateFrom) query = query.gte('posted_at', filters.dateFrom)
      if (filters.dateTo) query = query.lte('posted_at', filters.dateTo + 'T23:59:59')
      if (filters.search)
        query = query.or(`item_name.ilike.%${filters.search}%,doc_number.ilike.%${filters.search}%`)

      const { data, error } = await query
      if (error) throw error
      entries.value = data || []

      // Real-time subscription for ledger entries
      if (!channel) {
        channel = supabase
          .channel('inventory-ledger-realtime')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'inventory_ledger',
              filter: `company_id=eq.${companyId}`,
            },
            async () => {
              // Refresh siliently to get updated view data
              const { data: newData } = await supabase
                .from('v_inventory_ledger')
                .select('*')
                .eq('company_id', companyId)
                .order('posted_at', { ascending: false })
                .limit(500)
              if (newData) entries.value = newData
            },
          )
          .subscribe()
      }
    } catch (e: any) {
      console.error('[inventoryService] fetchLedger error:', e)
    } finally {
      loading.value = false
    }
  }

  return { entries, loading, fetchLedger }
}

/* ====================================================================
   14.  DASHBOARD STATS (aggregated via RPC or simple queries)
==================================================================== */

export async function fetchDashboardStats() {
  const companyId = getCompanyId()
  if (!companyId) {
    return { totalStockValue: 0, lowStockCount: 0, todayGRN: 0, todayGIN: 0, todayBOM: 0 }
  }
  const today = new Date().toISOString().split('T')[0]

  const [stockRes, grnRes, ginRes, bomRes] = await Promise.all([
    supabase
      .from('v_stock_on_hand')
      .select('total_value, stock_status')
      .eq('company_id', companyId),
    supabase
      .from('inventory_documents')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('doc_type', 'GRN')
      .eq('status', 'posted')
      .eq('doc_date', today),
    supabase
      .from('inventory_documents')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('doc_type', 'GIN')
      .eq('status', 'posted')
      .eq('doc_date', today),
    supabase
      .from('inventory_documents')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('doc_type', 'BOM_DEDUCT')
      .eq('status', 'posted')
      .eq('doc_date', today),
  ])

  const stockRows = stockRes.data || []
  const totalValue = stockRows.reduce((s: number, r: any) => s + (r.total_value || 0), 0)
  const lowStockCount = stockRows.filter(
    (r: any) => r.stock_status === 'low_stock' || r.stock_status === 'out_of_stock',
  ).length

  return {
    totalStockValue: totalValue,
    lowStockCount,
    todayGRN: grnRes.count ?? 0,
    todayGIN: ginRes.count ?? 0,
    todayBOM: bomRes.count ?? 0,
  }
}

/* ====================================================================
   15.  RECIPE / BOM MANAGEMENT (CRUD)
==================================================================== */

export interface RecipeItemPayload {
  item_id: string
  qty_per_serving: number
  uom_id: string
  wastage_percent?: number
  notes?: string
}

export interface RecipePayload {
  menu_item_id: string
  variant_id?: string | null
  name?: string
  yield_qty?: number
  yield_unit?: string
  notes?: string
  items: RecipeItemPayload[]
}

export function useRecipeList() {
  const recipes: Ref<any[]> = ref([])
  const loading = ref(false)

  async function listRecipes() {
    loading.value = true
    try {
      const companyId = getCompanyId()
      if (!companyId) throw new Error('No company context.')

      const { data, error } = await supabase
        .from('recipes')
        .select(`
          *,
          menu_item:menu_items!recipes_menu_item_id_fkey(id, name, base_price, image_url,
            category:categories(id, name),
            kitchen:kitchens(id, name)
          ),
          variant:item_variants(id, name, price),
          recipe_items(
            id, item_id, qty_per_serving, uom_id, wastage_percent, notes,
            item:items(id, code, name, avg_cost, inventory_uom_id,
              inv_uom:uom!items_inventory_uom_id_fkey(id, code, name, conversion_factor)
            ),
            uom:uom(id, code, name, conversion_factor)
          )
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      if (error) throw error

      recipes.value = (data || []).map((r: any) => {
        const items = r.recipe_items || []
        const totalCost = items.reduce((s: number, ri: any) => {
          const qty = ri.qty_per_serving * (1 + (ri.wastage_percent || 0) / 100)
          const avgCost = ri.item?.avg_cost || 0

          // UOM conversion: BOM UOM → item stock UOM
          // e.g. 250g (factor=0.001) with stock in KG (factor=1) → 0.25 KG
          const bomUomFactor = Number(ri.uom?.conversion_factor) || 1
          // Item's inventory UOM — fetched via items.inv_uom in listItems, but recipe_items
          // only joins uom (bom uom). We need to get the item's stock uom separately.
          // Use the item object which includes inventory_uom_id via join
          const stockUomFactor = Number(ri.item?.inv_uom?.conversion_factor) || 1
          const conversionRatio = stockUomFactor > 0 ? bomUomFactor / stockUomFactor : bomUomFactor

          return s + qty * conversionRatio * avgCost
        }, 0)
        return {
          ...r,
          menu_item_name: r.menu_item?.name || '',
          menu_item_price: r.menu_item?.base_price || 0,
          category_name: r.menu_item?.category?.name || '',
          kitchen_name: r.menu_item?.kitchen?.name || '',
          variant_name: r.variant?.name || '',
          ingredient_count: items.length,
          total_cost: totalCost,
          food_cost_pct: r.menu_item?.base_price
            ? ((totalCost / r.menu_item.base_price) * 100).toFixed(1)
            : '0.0',
        }
      })
    } catch (e: any) {
      console.error('[inventoryService] listRecipes error:', e)
    } finally {
      loading.value = false
    }
  }

  async function createRecipe(payload: RecipePayload) {
    const companyId = getCompanyId()
    if (!companyId) throw new Error('No company context.')

    // Insert recipe header
    const { data: recipe, error: err1 } = await supabase
      .from('recipes')
      .insert({
        company_id: companyId,
        menu_item_id: payload.menu_item_id,
        variant_id: payload.variant_id || null,
        name: payload.name || null,
        yield_qty: payload.yield_qty || 1,
        yield_unit: payload.yield_unit || null,
        notes: payload.notes || null,
      })
      .select()
      .single()
    if (err1) throw err1

    // Insert recipe items
    if (payload.items.length > 0) {
      const rows = payload.items.map((item) => ({
        recipe_id: recipe.id,
        item_id: item.item_id,
        qty_per_serving: item.qty_per_serving,
        uom_id: item.uom_id,
        wastage_percent: item.wastage_percent || 0,
        notes: item.notes || null,
      }))
      const { error: err2 } = await supabase.from('recipe_items').insert(rows)
      if (err2) throw err2
    }

    await listRecipes()
    return recipe
  }

  async function updateRecipe(recipeId: string, payload: RecipePayload) {
    // Update header
    const { error: err1 } = await supabase
      .from('recipes')
      .update({
        menu_item_id: payload.menu_item_id,
        variant_id: payload.variant_id || null,
        name: payload.name || null,
        yield_qty: payload.yield_qty || 1,
        yield_unit: payload.yield_unit || null,
        notes: payload.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recipeId)
    if (err1) throw err1

    // Replace items: delete old, insert new
    const { error: delErr } = await supabase
      .from('recipe_items')
      .delete()
      .eq('recipe_id', recipeId)
    if (delErr) throw delErr

    if (payload.items.length > 0) {
      const rows = payload.items.map((item) => ({
        recipe_id: recipeId,
        item_id: item.item_id,
        qty_per_serving: item.qty_per_serving,
        uom_id: item.uom_id,
        wastage_percent: item.wastage_percent || 0,
        notes: item.notes || null,
      }))
      const { error: err2 } = await supabase.from('recipe_items').insert(rows)
      if (err2) throw err2
    }

    await listRecipes()
  }

  async function deleteRecipe(recipeId: string) {
    // Delete items first, then recipe
    await supabase.from('recipe_items').delete().eq('recipe_id', recipeId)
    const { error } = await supabase.from('recipes').delete().eq('id', recipeId)
    if (error) throw error
    recipes.value = recipes.value.filter((r: any) => r.id !== recipeId)
  }

  async function toggleRecipeActive(recipeId: string, isActive: boolean) {
    const { error } = await supabase
      .from('recipes')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', recipeId)
    if (error) throw error
    const idx = recipes.value.findIndex((r: any) => r.id === recipeId)
    if (idx !== -1) recipes.value[idx].is_active = isActive
  }

  return { recipes, loading, listRecipes, createRecipe, updateRecipe, deleteRecipe, toggleRecipeActive }
}

/* ====================================================================
   16.  KOT STOCK DEDUCTION / REVERSAL (RPC wrappers)
==================================================================== */

export async function deductStockForKOT(kotBatchId: string): Promise<any> {
  const { data, error } = await supabase.rpc('fn_kot_deduct_stock', {
    p_kot_batch_id: kotBatchId,
  })
  if (error) {
    console.error('[inventoryService] deductStockForKOT error:', error)
    throw error
  }
  return data
}

export async function reverseStockForKOT(kotBatchId: string): Promise<any> {
  const { data, error } = await supabase.rpc('fn_kot_reverse_stock', {
    p_kot_batch_id: kotBatchId,
  })
  if (error) {
    console.error('[inventoryService] reverseStockForKOT error:', error)
    throw error
  }
  return data
}

/* ====================================================================
   17.  KOT DEDUCTION LOG (monitoring)
==================================================================== */

export function useKotDeductionLog() {
  const logs: Ref<any[]> = ref([])
  const loading = ref(false)

  async function fetchDeductionLogs(filters: { dateFrom?: string; dateTo?: string } = {}) {
    loading.value = true
    try {
      const branchId = getBranchId()
      if (!branchId) return

      let query = supabase
        .from('kot_deduction_log')
        .select(`
          *,
          inv_doc:inventory_documents!kot_deduction_log_inv_document_id_fkey(
            id, doc_number, doc_date, total_qty, total_cost
          ),
          kitchen:kitchens!kot_deduction_log_kitchen_id_fkey(id, name),
          warehouse:warehouses!kot_deduction_log_warehouse_id_fkey(id, name)
        `)
        .eq('branch_id', branchId)
        .order('deducted_at', { ascending: false })
        .limit(200)

      if (filters.dateFrom) query = query.gte('deducted_at', filters.dateFrom)
      if (filters.dateTo) query = query.lte('deducted_at', filters.dateTo + 'T23:59:59')

      const { data, error } = await query
      if (error) throw error
      logs.value = (data || []).map((log: any) => ({
        ...log,
        doc_number: log.inv_doc?.doc_number || '',
        total_qty: log.inv_doc?.total_qty || 0,
        total_cost: log.inv_doc?.total_cost || 0,
        kitchen_name: log.kitchen?.name || '',
        warehouse_name: log.warehouse?.name || '',
      }))
    } catch (e: any) {
      console.error('[inventoryService] fetchDeductionLogs error:', e)
    } finally {
      loading.value = false
    }
  }

  return { logs, loading, fetchDeductionLogs }
}

/* ====================================================================
   18.  INVENTORY REPORTS — reusable data fetchers
==================================================================== */

/** BOM Consumption Report: consumption by menu item based on BOM deductions */
export async function fetchBOMConsumptionReport(dateFrom: string, dateTo: string) {
  const companyId = getCompanyId()
  if (!companyId) return []

  const { data, error } = await supabase
    .from('inventory_ledger')
    .select(`
      item_id,
      quantity,
      unit_cost,
      total_cost,
      posted_at,
      item:items(id, code, name),
      warehouse:warehouses(id, name),
      document:inventory_documents!inventory_ledger_document_id_fkey(
        id, doc_number, remarks, reference_id
      )
    `)
    .eq('company_id', companyId)
    .eq('doc_type', 'BOM_DEDUCT')
    .eq('direction', 'OUT')
    .gte('posted_at', dateFrom)
    .lte('posted_at', dateTo + 'T23:59:59')
    .order('posted_at', { ascending: false })
    .limit(1000)

  if (error) throw error
  return (data || []).map((r: any) => ({
    ...r,
    item_name: r.item?.name || '',
    item_code: r.item?.code || '',
    warehouse_name: r.warehouse?.name || '',
    doc_number: r.document?.doc_number || '',
    kot_remarks: r.document?.remarks || '',
  }))
}

/** Daily Kitchen Consumption: aggregated ingredient usage per day */
export async function fetchDailyConsumption(dateFrom: string, dateTo: string) {
  const companyId = getCompanyId()
  if (!companyId) return []

  const { data, error } = await supabase
    .from('inventory_ledger')
    .select(`
      item_id,
      quantity,
      total_cost,
      posted_at,
      warehouse_id,
      item:items(id, code, name),
      warehouse:warehouses(id, name)
    `)
    .eq('company_id', companyId)
    .eq('doc_type', 'BOM_DEDUCT')
    .eq('direction', 'OUT')
    .gte('posted_at', dateFrom)
    .lte('posted_at', dateTo + 'T23:59:59')
    .order('posted_at', { ascending: false })
    .limit(2000)

  if (error) throw error

  // Group by date + item
  const grouped: Record<string, any> = {}
  for (const row of data || []) {
    const date = (row.posted_at as string).split('T')[0]
    const key = `${date}__${row.item_id}`
    if (!grouped[key]) {
      grouped[key] = {
        date,
        item_id: row.item_id,
        item_name: (row as any).item?.name || '',
        item_code: (row as any).item?.code || '',
        warehouse_name: (row as any).warehouse?.name || '',
        total_qty: 0,
        total_cost: 0,
      }
    }
    grouped[key].total_qty += row.quantity || 0
    grouped[key].total_cost += row.total_cost || 0
  }
  return Object.values(grouped).sort((a: any, b: any) => b.date.localeCompare(a.date))
}

/** Ingredient Consumption Report: per-ingredient breakdown */
export async function fetchIngredientConsumption(dateFrom: string, dateTo: string) {
  const companyId = getCompanyId()
  if (!companyId) return []

  const { data, error } = await supabase
    .from('inventory_ledger')
    .select(`
      item_id,
      quantity,
      total_cost,
      item:items(id, code, name, avg_cost, reorder_level,
        inv_uom:uom!items_inventory_uom_id_fkey(code)
      )
    `)
    .eq('company_id', companyId)
    .eq('doc_type', 'BOM_DEDUCT')
    .eq('direction', 'OUT')
    .gte('posted_at', dateFrom)
    .lte('posted_at', dateTo + 'T23:59:59')
    .limit(2000)

  if (error) throw error

  // Aggregate by item
  const agg: Record<string, any> = {}
  for (const row of data || []) {
    const id = row.item_id
    if (!agg[id]) {
      agg[id] = {
        item_id: id,
        item_name: (row as any).item?.name || '',
        item_code: (row as any).item?.code || '',
        uom: (row as any).item?.inv_uom?.code || '',
        avg_cost: (row as any).item?.avg_cost || 0,
        total_qty: 0,
        total_cost: 0,
      }
    }
    agg[id].total_qty += row.quantity || 0
    agg[id].total_cost += row.total_cost || 0
  }
  return Object.values(agg).sort((a: any, b: any) => b.total_cost - a.total_cost)
}
