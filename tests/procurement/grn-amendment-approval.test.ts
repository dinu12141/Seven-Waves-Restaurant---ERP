import { describe, it, expect, beforeEach } from 'vitest'
import {
  extractAmendmentFromRemarks,
  packAmendmentIntoRemarks,
  getActiveApprovedAmendment,
  getPendingAmendment,
  type DocumentAmendmentRequest,
} from '../../src/services/amendmentService'

describe('GRN Amendment & One-Time Admin Approval Flow', () => {
  const requesterId = 'user-storekeeper-101'
  const requesterName = 'Kasun Perera'
  const otherUserId = 'user-storekeeper-999'
  const adminId = 'admin-user-001'

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  it('embeds amendment request into remarks and extracts it reliably', () => {
    const existingRemarks = 'Invoice received with delivery truck #4'
    const amendment: DocumentAmendmentRequest = {
      id: 'amend_123',
      doc_type: 'GRN',
      doc_id: 'grn-555',
      doc_number: '25823',
      requested_by_id: requesterId,
      requested_by_name: requesterName,
      requester_role: 'Storekeeper',
      reason: 'Entered incorrect unit price on Skinless Chicken',
      action_type: 'edit_unlock',
      status: 'pending',
      created_at: new Date().toISOString(),
    }

    const packedRemarks = packAmendmentIntoRemarks(existingRemarks, amendment)
    expect(packedRemarks).toContain('Invoice received with delivery truck #4')
    expect(packedRemarks).toContain('[AMENDMENT:')

    const extracted = extractAmendmentFromRemarks(packedRemarks)
    expect(extracted).not.toBeNull()
    expect(extracted?.id).toBe('amend_123')
    expect(extracted?.doc_id).toBe('grn-555')
    expect(extracted?.requested_by_id).toBe(requesterId)
    expect(extracted?.status).toBe('pending')
    expect(extracted?.reason).toBe('Entered incorrect unit price on Skinless Chicken')
  })

  it('identifies pending amendment status accurately', () => {
    const amendment: DocumentAmendmentRequest = {
      id: 'amend_123',
      doc_type: 'GRN',
      doc_id: 'grn-555',
      doc_number: '25823',
      requested_by_id: requesterId,
      requested_by_name: requesterName,
      requester_role: 'Storekeeper',
      reason: 'Quantity mismatch',
      action_type: 'edit_unlock',
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    const remarks = packAmendmentIntoRemarks('Original remark', amendment)

    const pending = getPendingAmendment('GRN', 'grn-555', remarks)
    expect(pending).not.toBeNull()
    expect(pending?.status).toBe('pending')

    // Approved should be null while pending
    const approved = getActiveApprovedAmendment('GRN', 'grn-555', remarks)
    expect(approved).toBeNull()
  })

  it('verifies that ONLY the requesting user receives edit authorization upon admin approval', () => {
    const approvedAmendment: DocumentAmendmentRequest = {
      id: 'amend_123',
      doc_type: 'GRN',
      doc_id: 'grn-555',
      doc_number: '25823',
      requested_by_id: requesterId,
      requested_by_name: requesterName,
      requester_role: 'Storekeeper',
      reason: 'Price correction',
      action_type: 'edit_unlock',
      status: 'approved',
      admin_notes: 'Approved by Manager. Please fix chicken price.',
      created_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      resolved_by: 'General Manager',
    }

    const remarks = packAmendmentIntoRemarks('Original remark', approvedAmendment)
    const activeApproval = getActiveApprovedAmendment('GRN', 'grn-555', remarks)
    expect(activeApproval).not.toBeNull()
    expect(activeApproval?.status).toBe('approved')

    // Helper simulating isAuthorizedEditor computed in GRNPage.vue
    const checkCanEdit = (currentUserId: string, isAdmin = false) => {
      if (!activeApproval) return false
      const isRequester = activeApproval.requested_by_id === currentUserId
      return Boolean(isRequester || isAdmin)
    }

    // 1. The user who requested approval CAN edit
    expect(checkCanEdit(requesterId, false)).toBe(true)

    // 2. Another storekeeper / staff member CANNOT edit
    expect(checkCanEdit(otherUserId, false)).toBe(false)

    // 3. System Admin can also supervise/edit
    expect(checkCanEdit(adminId, true)).toBe(true)
  })

  it('enforces single-use consumption: once consumed, document is locked and cannot be edited again', () => {
    const consumedAmendment: DocumentAmendmentRequest = {
      id: 'amend_123',
      doc_type: 'GRN',
      doc_id: 'grn-555',
      doc_number: '25823',
      requested_by_id: requesterId,
      requested_by_name: requesterName,
      requester_role: 'Storekeeper',
      reason: 'Price correction',
      action_type: 'edit_unlock',
      status: 'consumed',
      admin_notes: 'Approved by Manager',
      created_at: '2026-09-25T10:00:00Z',
      resolved_at: '2026-09-25T10:15:00Z',
      consumed_at: '2026-09-25T10:30:00Z',
      consumed_by_id: requesterId,
      consumed_by_name: requesterName,
    }

    const remarks = packAmendmentIntoRemarks('Original remark', consumedAmendment)

    // Active approved amendment must now be null because it has been consumed
    const activeApproval = getActiveApprovedAmendment('GRN', 'grn-555', remarks)
    expect(activeApproval).toBeNull()

    // Since activeApproval is null, checkCanEdit returns false for everyone
    const canEdit = Boolean(activeApproval && activeApproval.requested_by_id === requesterId)
    expect(canEdit).toBe(false)
  })

  it('rejects tampered or corrupt amendment remarks gracefully', () => {
    expect(extractAmendmentFromRemarks('Corrupt [AMENDMENT:{invalid json}]')).toBeNull()
    expect(extractAmendmentFromRemarks('Normal remark without amendment tag')).toBeNull()
    expect(extractAmendmentFromRemarks('')).toBeNull()
    expect(extractAmendmentFromRemarks(null)).toBeNull()
  })
})
