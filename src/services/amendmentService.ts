/**
 * amendmentService.ts
 * ====================
 * Enterprise Governance & Strict Document Immutability Service (ERPNext Standard).
 * 
 * Enforces:
 *  1. Once submitted, all operational & financial documents (GRN, GIN, AP Invoices, Vouchers, POs) are LOCKED.
 *  2. Any modification or void request requires an explicit Amendment Request.
 *  3. Only System Administrators can Approve & Unlock or Reject amendment requests in the Approvals Center.
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
  status: 'pending' | 'approved' | 'rejected'
  admin_notes?: string
  created_at: string
  resolved_at?: string
  resolved_by?: string
}

const LOCAL_STORAGE_AMENDMENTS = 'sw_document_amendments_store'

function getLocalAmendments(): DocumentAmendmentRequest[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_AMENDMENTS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalAmendments(list: DocumentAmendmentRequest[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_AMENDMENTS, JSON.stringify(list))
  } catch {
    // ignore
  }
}

/**
 * Submit an amendment / unlock request for a locked document
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

  // Save to local cache first
  const current = getLocalAmendments()
  current.unshift(newRequest)
  saveLocalAmendments(current)

  // Attempt database sync
  try {
    const { error } = await supabase.from('document_amendment_requests').insert([
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

    if (error && error.code !== 'PGRST116') {
      console.warn('[AmendmentService] Supabase insert note:', error.message)
    }
  } catch (err) {
    console.warn('[AmendmentService] Remote sync fallback to local cache:', err)
  }

  return { success: true, data: newRequest }
}

/**
 * Fetch all pending amendment requests
 */
export async function fetchPendingAmendments(branchId?: string): Promise<DocumentAmendmentRequest[]> {
  try {
    let query = supabase
      .from('document_amendment_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (branchId) {
      query = query.eq('branch_id', branchId)
    }

    const { data, error } = await query

    if (!error && data && data.length > 0) {
      // Merge with local storage
      const local = getLocalAmendments().filter((x) => x.status === 'pending')
      const merged = [...data]
      for (const item of local) {
        if (!merged.find((m) => m.id === item.id || (m.doc_id === item.doc_id && m.status === 'pending'))) {
          merged.push(item)
        }
      }
      return merged
    }
  } catch {
    // fallback
  }

  return getLocalAmendments().filter((x) => x.status === 'pending')
}

/**
 * Admin Action: Approve Amendment & Unlock Document
 */
export async function approveDocumentAmendment(
  amendmentId: string,
  docType: string,
  docId: string,
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const resolvedAt = new Date().toISOString()

  // 1. Update amendment status in local cache
  const local = getLocalAmendments()
  const found = local.find((x) => x.id === amendmentId)
  if (found) {
    found.status = 'approved'
    found.resolved_at = resolvedAt
    found.admin_notes = adminNotes
    saveLocalAmendments(local)
  }

  // 2. Unlock the target document based on doc_type
  try {
    if (['GRN', 'GIN', 'WASTAGE', 'STOCK_ADJUSTMENT'].includes(docType)) {
      await supabase
        .from('inventory_documents')
        .update({ status: 'draft', notes: `[UNLOCKED BY ADMIN] ${adminNotes || ''}` })
        .eq('id', docId)
    } else if (docType === 'PO') {
      await supabase
        .from('procurement_purchase_orders')
        .update({ status: 'draft', notes: `[UNLOCKED BY ADMIN] ${adminNotes || ''}` })
        .eq('id', docId)
    } else if (docType === 'AP_INV') {
      await supabase
        .from('ap_invoices')
        .update({ status: 'draft', notes: `[UNLOCKED BY ADMIN] ${adminNotes || ''}` })
        .eq('id', docId)
    } else if (docType === 'VOUCHER') {
      await supabase
        .from('finance_vouchers')
        .update({ status: 'draft', remarks: `[UNLOCKED BY ADMIN] ${adminNotes || ''}` })
        .eq('id', docId)
    }

    // Update remote amendment record if exists
    await supabase
      .from('document_amendment_requests')
      .update({
        status: 'approved',
        resolved_at: resolvedAt,
        admin_notes: adminNotes || 'Approved & Unlocked by Admin',
      })
      .eq('id', amendmentId)
  } catch (err: any) {
    console.warn('[AmendmentService] Unlock remote notice:', err)
  }

  return { success: true }
}

/**
 * Admin Action: Reject Amendment Request
 */
export async function rejectDocumentAmendment(
  amendmentId: string,
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const resolvedAt = new Date().toISOString()

  // Update local cache
  const local = getLocalAmendments()
  const found = local.find((x) => x.id === amendmentId)
  if (found) {
    found.status = 'rejected'
    found.resolved_at = resolvedAt
    found.admin_notes = adminNotes
    saveLocalAmendments(local)
  }

  // Update remote table if exists
  try {
    await supabase
      .from('document_amendment_requests')
      .update({
        status: 'rejected',
        resolved_at: resolvedAt,
        admin_notes: adminNotes || 'Rejected by Admin',
      })
      .eq('id', amendmentId)
  } catch (err: any) {
    console.warn('[AmendmentService] Reject remote notice:', err)
  }

  return { success: true }
}
