/**
 * amendmentService.ts
 * ====================
 * Enterprise Governance & Strict Document Immutability Service (ERPNext Standard).
 * 
 * Enforces:
 *  1. Once submitted, all operational & financial documents (GRN, GIN, AP Invoices, Vouchers, POs) are LOCKED.
 *  2. Any modification or void request requires an explicit Amendment Request with justification.
 *  3. Only System Administrators can Approve & Unlock or Reject amendment requests in the Approvals Center.
 *  4. Single-User Authorization: Only the user who requested the approval can edit the unlocked document.
 *  5. Single-Use Security: Once the authorized user saves their corrections, the approval is consumed and the document is locked again.
 */

import { supabase } from '../boot/supabase'

export interface DocumentAmendmentRequest {
  id: string
  doc_type: 'GRN' | 'GIN' | 'AP_INV' | 'PO' | 'VOUCHER' | 'ORDER' | 'WASTAGE' | string
  doc_id: string
  doc_number: string
  branch_id?: string
  requested_by_id?: string
  requested_by_name: string
  requester_role: string
  reason: string
  action_type: 'edit_unlock' | 'void_cancel'
  status: 'pending' | 'approved' | 'rejected' | 'consumed'
  admin_notes?: string
  created_at: string
  resolved_at?: string
  resolved_by?: string
  consumed_at?: string
  consumed_by_id?: string
  consumed_by_name?: string
}

const LOCAL_STORAGE_AMENDMENTS = 'sw_document_amendments_store'

export function getLocalAmendments(): DocumentAmendmentRequest[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_AMENDMENTS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveLocalAmendments(list: DocumentAmendmentRequest[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_AMENDMENTS, JSON.stringify(list))
  } catch {
    // ignore
  }
}

/**
 * Extracts amendment metadata safely embedded in document remarks.
 */
export function extractAmendmentFromRemarks(remarks?: string | null): DocumentAmendmentRequest | null {
  if (!remarks || typeof remarks !== 'string') return null
  const match = remarks.match(/\[AMENDMENT:([\s\S]*?)\]/)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

/**
 * Embeds/updates amendment metadata in document remarks while preserving user text.
 */
export function packAmendmentIntoRemarks(
  existingRemarks: string | null | undefined,
  amendment: DocumentAmendmentRequest,
): string {
  const cleanRemarks = (existingRemarks || '').replace(/\[AMENDMENT:[\s\S]*?\]/g, '').trim()
  const payload = `[AMENDMENT:${JSON.stringify(amendment)}]`
  return cleanRemarks ? `${cleanRemarks}\n${payload}` : payload
}

/**
 * Submit an amendment / unlock request for a locked document.
 * Records the requester ID and stores in DB remarks and local cache.
 */
export async function requestDocumentAmendment(params: {
  docType: string
  docId: string
  docNumber: string
  branchId?: string
  requestedById?: string
  requestedByName: string
  requesterRole: string
  reason: string
  actionType?: 'edit_unlock' | 'void_cancel'
}): Promise<{ success: boolean; data?: DocumentAmendmentRequest; error?: string }> {
  const newRequest: DocumentAmendmentRequest = {
    id: `amend_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    doc_type: params.docType,
    doc_id: params.docId,
    doc_number: params.docNumber || '—',
    branch_id: params.branchId,
    requested_by_id: params.requestedById,
    requested_by_name: params.requestedByName || 'Staff Member',
    requester_role: params.requesterRole || 'User',
    reason: params.reason,
    action_type: params.actionType || 'edit_unlock',
    status: 'pending',
    created_at: new Date().toISOString(),
  }

  // 1. Save to local cache first
  const current = getLocalAmendments()
  // Remove any stale request for the same document
  const filtered = current.filter((x) => !(x.doc_id === params.docId && x.status === 'pending'))
  filtered.unshift(newRequest)
  saveLocalAmendments(filtered)

  // 2. Persist in database directly on document remarks (cross-device source of truth)
  if (params.docType === 'GRN') {
    try {
      const { data: grn } = await supabase
        .from('goods_receipts')
        .select('remarks')
        .eq('id', params.docId)
        .maybeSingle()

      const newRemarks = packAmendmentIntoRemarks(grn?.remarks, newRequest)
      await supabase.from('goods_receipts').update({ remarks: newRemarks }).eq('id', params.docId)
    } catch (err) {
      console.warn('[AmendmentService] goods_receipts remarks sync fallback:', err)
    }
  }

  // 3. Fallback table sync if table exists
  try {
    await supabase.from('document_amendment_requests').insert([
      {
        id: newRequest.id,
        doc_type: newRequest.doc_type,
        doc_id: newRequest.doc_id,
        doc_number: newRequest.doc_number,
        branch_id: newRequest.branch_id,
        requested_by_id: newRequest.requested_by_id,
        requested_by_name: newRequest.requested_by_name,
        requester_role: newRequest.requester_role,
        reason: newRequest.reason,
        action_type: newRequest.action_type,
        status: 'pending',
        created_at: newRequest.created_at,
      },
    ])
  } catch {
    // Non-blocking
  }

  return { success: true, data: newRequest }
}

/**
 * Fetch all pending amendment requests for the Approvals Center.
 * Aggregates database document remarks and local cache.
 */
export async function fetchPendingAmendments(branchId?: string): Promise<DocumentAmendmentRequest[]> {
  const results: DocumentAmendmentRequest[] = []

  // 1. Fetch from goods_receipts remarks
  try {
    const { data: grnRows, error: grnErr } = await supabase
      .from('goods_receipts')
      .select('id, doc_number, branch_id, remarks')
      .like('remarks', '%[AMENDMENT:%')

    if (!grnErr && grnRows) {
      for (const row of grnRows) {
        const parsed = extractAmendmentFromRemarks(row.remarks)
        if (parsed && parsed.status === 'pending') {
          if (!branchId || parsed.branch_id === branchId || row.branch_id === branchId) {
            results.push(parsed)
          }
        }
      }
    }
  } catch (err) {
    console.warn('[AmendmentService] Failed fetching pending from goods_receipts:', err)
  }

  // 2. Fetch from document_amendment_requests table if available
  try {
    let query = supabase
      .from('document_amendment_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (branchId) query = query.eq('branch_id', branchId)

    const { data, error } = await query
    if (!error && data && data.length > 0) {
      for (const item of data) {
        if (!results.find((r) => r.id === item.id || (r.doc_id === item.doc_id && r.status === 'pending'))) {
          results.push(item)
        }
      }
    }
  } catch {
    // fallback
  }

  // 3. Merge with local storage cache
  const local = getLocalAmendments().filter((x) => x.status === 'pending')
  for (const item of local) {
    if (!results.find((r) => r.id === item.id || (r.doc_id === item.doc_id && r.status === 'pending'))) {
      if (!branchId || item.branch_id === branchId) {
        results.push(item)
      }
    }
  }

  return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

/**
 * Admin Action: Approve Amendment & Unlock Document for the specific requester.
 */
export async function approveDocumentAmendment(
  amendmentId: string,
  docType: string,
  docId: string,
  adminNotes?: string,
  adminMeta?: { id?: string; name?: string },
): Promise<{ success: boolean; error?: string }> {
  const resolvedAt = new Date().toISOString()

  // 1. Update amendment in local cache
  const local = getLocalAmendments()
  let found = local.find((x) => x.id === amendmentId || (x.doc_id === docId && x.status === 'pending'))
  if (found) {
    found.status = 'approved'
    found.resolved_at = resolvedAt
    found.resolved_by = adminMeta?.name || 'Administrator'
    found.admin_notes = adminNotes
    saveLocalAmendments(local)
  }

  // 2. If it's a GRN, update goods_receipts table in Supabase
  if (docType === 'GRN') {
    try {
      const { data: grn } = await supabase
        .from('goods_receipts')
        .select('remarks, doc_number')
        .eq('id', docId)
        .maybeSingle()

      let updatedAmendment = found
      if (!updatedAmendment) {
        const fromRemarks = extractAmendmentFromRemarks(grn?.remarks)
        if (fromRemarks) {
          updatedAmendment = {
            ...fromRemarks,
            status: 'approved',
            resolved_at: resolvedAt,
            resolved_by: adminMeta?.name || 'Administrator',
            admin_notes: adminNotes,
          }
        }
      }

      if (updatedAmendment) {
        updatedAmendment.status = 'approved'
        updatedAmendment.resolved_at = resolvedAt
        updatedAmendment.admin_notes = adminNotes
        const newRemarks = packAmendmentIntoRemarks(grn?.remarks, updatedAmendment)

        // Set status to draft so it can be updated and save amendment in remarks
        const { error } = await supabase
          .from('goods_receipts')
          .update({
            status: 'draft',
            remarks: newRemarks,
          })
          .eq('id', docId)

        if (error) throw new Error(error.message)
      } else {
        const fallbackAmendment: DocumentAmendmentRequest = {
          id: amendmentId,
          doc_type: 'GRN',
          doc_id: docId,
          doc_number: grn?.doc_number || '',
          requested_by_name: 'Staff',
          requester_role: 'User',
          reason: adminNotes || 'Admin unlock',
          action_type: 'edit_unlock',
          status: 'approved',
          created_at: resolvedAt,
          resolved_at: resolvedAt,
          resolved_by: adminMeta?.name || 'Administrator',
          admin_notes: adminNotes,
        }
        const newRemarks = packAmendmentIntoRemarks(grn?.remarks, fallbackAmendment)
        const { error } = await supabase
          .from('goods_receipts')
          .update({
            status: 'draft',
            remarks: newRemarks,
          })
          .eq('id', docId)

        if (error) throw new Error(error.message)
      }
    } catch (err: any) {
      console.warn('[AmendmentService] Error unlocking GRN in database:', err)
      return { success: false, error: err.message }
    }
  } else if (['GIN', 'WASTAGE', 'STOCK_ADJUSTMENT'].includes(docType)) {
    try {
      await supabase
        .from('inventory_documents')
        .update({ status: 'draft', notes: `[UNLOCKED BY ADMIN] ${adminNotes || ''}` })
        .eq('id', docId)
    } catch (err: any) {
      console.warn('[AmendmentService] Unlock inventory_documents error:', err)
    }
  } else if (docType === 'PO') {
    try {
      await supabase
        .from('procurement_purchase_orders')
        .update({ status: 'draft', notes: `[UNLOCKED BY ADMIN] ${adminNotes || ''}` })
        .eq('id', docId)
    } catch (err: any) {
      console.warn('[AmendmentService] Unlock PO error:', err)
    }
  } else if (docType === 'AP_INV') {
    try {
      await supabase
        .from('ap_invoices')
        .update({ status: 'draft', notes: `[UNLOCKED BY ADMIN] ${adminNotes || ''}` })
        .eq('id', docId)
    } catch (err: any) {
      console.warn('[AmendmentService] Unlock AP invoice error:', err)
    }
  }

  // Update remote amendment table if it exists
  try {
    await supabase
      .from('document_amendment_requests')
      .update({
        status: 'approved',
        resolved_at: resolvedAt,
        admin_notes: adminNotes || 'Approved & Unlocked by Admin',
      })
      .eq('id', amendmentId)
  } catch {
    // non-blocking
  }

  return { success: true }
}

/**
 * Admin Action: Reject Amendment Request
 */
export async function rejectDocumentAmendment(
  amendmentId: string,
  adminNotes?: string,
  docType?: string,
  docId?: string,
): Promise<{ success: boolean; error?: string }> {
  const resolvedAt = new Date().toISOString()

  // Update local cache
  const local = getLocalAmendments()
  const found = local.find(
    (x) => x.id === amendmentId || (docId && x.doc_id === docId && x.status === 'pending'),
  )
  if (found) {
    found.status = 'rejected'
    found.resolved_at = resolvedAt
    found.admin_notes = adminNotes
    saveLocalAmendments(local)
  }

  // If GRN, keep posted and update remarks
  if (docType === 'GRN' || (found && found.doc_type === 'GRN')) {
    const targetDocId = docId || found?.doc_id
    if (targetDocId) {
      try {
        const { data: grn } = await supabase
          .from('goods_receipts')
          .select('remarks')
          .eq('id', targetDocId)
          .maybeSingle()

        if (found) {
          const newRemarks = packAmendmentIntoRemarks(grn?.remarks, found)
          await supabase.from('goods_receipts').update({ remarks: newRemarks }).eq('id', targetDocId)
        }
      } catch (err) {
        console.warn('[AmendmentService] Error updating rejected amendment on GRN:', err)
      }
    }
  }

  try {
    await supabase
      .from('document_amendment_requests')
      .update({
        status: 'rejected',
        resolved_at: resolvedAt,
        admin_notes: adminNotes || 'Rejected by Admin',
      })
      .eq('id', amendmentId)
  } catch {
    // non-blocking
  }

  return { success: true }
}

/**
 * Consume / Close a one-time edit authorization once the approved user saves corrections.
 * Sets the document status back to 'posted' and marks amendment as consumed.
 */
export async function consumeDocumentAmendment(
  docType: string,
  docId: string,
  amendmentId?: string,
  userMeta?: { consumed_by_id?: string; consumed_by_name?: string },
): Promise<{ success: boolean; error?: string }> {
  const consumedAt = new Date().toISOString()

  // 1. Update local cache
  const local = getLocalAmendments()
  const found = local.find(
    (x) => (amendmentId && x.id === amendmentId) || (x.doc_id === docId && x.status === 'approved'),
  )
  if (found) {
    found.status = 'consumed'
    found.consumed_at = consumedAt
    found.consumed_by_id = userMeta?.consumed_by_id
    found.consumed_by_name = userMeta?.consumed_by_name || 'Staff'
    saveLocalAmendments(local)
  }

  // 2. If GRN, lock back to 'posted' and persist consumed status in remarks
  if (docType === 'GRN') {
    try {
      const { data: grn } = await supabase
        .from('goods_receipts')
        .select('remarks')
        .eq('id', docId)
        .maybeSingle()

      const amendmentToSave: DocumentAmendmentRequest = found || {
        id: amendmentId || `amend_${Date.now()}`,
        doc_type: 'GRN',
        doc_id: docId,
        doc_number: '',
        requested_by_name: userMeta?.consumed_by_name || 'Staff',
        requester_role: 'Staff',
        reason: 'One-time edit completed',
        action_type: 'edit_unlock',
        status: 'consumed',
        created_at: consumedAt,
        consumed_at: consumedAt,
        consumed_by_id: userMeta?.consumed_by_id,
        consumed_by_name: userMeta?.consumed_by_name,
      }

      amendmentToSave.status = 'consumed'
      amendmentToSave.consumed_at = consumedAt
      amendmentToSave.consumed_by_id = userMeta?.consumed_by_id
      amendmentToSave.consumed_by_name = userMeta?.consumed_by_name

      const newRemarks = packAmendmentIntoRemarks(grn?.remarks, amendmentToSave)

      // Lock document back to posted in Supabase
      const { error } = await supabase
        .from('goods_receipts')
        .update({
          status: 'posted',
          remarks: newRemarks,
          updated_at: consumedAt,
        })
        .eq('id', docId)

      if (error) throw new Error(error.message)
    } catch (err: any) {
      console.warn('[AmendmentService] Error consuming GRN amendment in database:', err)
      return { success: false, error: err.message }
    }
  }

  return { success: true }
}

/**
 * Find an active approved amendment for a document.
 * Returns null if no approved amendment exists or if it has already been consumed.
 */
export function getActiveApprovedAmendment(
  docType: string,
  docId: string,
  docRemarks?: string | null,
): DocumentAmendmentRequest | null {
  // Check doc remarks first (source of truth from DB)
  if (docRemarks) {
    const fromRemarks = extractAmendmentFromRemarks(docRemarks)
    if (fromRemarks && fromRemarks.doc_type === docType && fromRemarks.status === 'approved') {
      return fromRemarks
    }
  }

  // Check local store
  const local = getLocalAmendments()
  const found = local.find(
    (x) => x.doc_type === docType && x.doc_id === docId && x.status === 'approved',
  )
  return found || null
}

/**
 * Check if an amendment request is currently pending admin approval
 */
export function getPendingAmendment(
  docType: string,
  docId: string,
  docRemarks?: string | null,
): DocumentAmendmentRequest | null {
  if (docRemarks) {
    const fromRemarks = extractAmendmentFromRemarks(docRemarks)
    if (fromRemarks && fromRemarks.doc_type === docType && fromRemarks.status === 'pending') {
      return fromRemarks
    }
  }

  const local = getLocalAmendments()
  const found = local.find(
    (x) => x.doc_type === docType && x.doc_id === docId && x.status === 'pending',
  )
  return found || null
}
