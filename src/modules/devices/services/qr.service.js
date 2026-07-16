// ═══════════════════════════════════════════════════════════════════
// QR Code Service — QR generation, validation, signing
// Seven Waves ERP — Step 06 Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

import { logger } from 'src/core/logging/logger'

/**
 * QR token types supported by the system.
 */
export const QR_TYPES = {
  TABLE_ORDER: 'table_order',
  PAYMENT: 'payment',
  LOYALTY: 'loyalty',
  STAFF_LOGIN: 'staff_login',
  DELIVERY_TRACK: 'delivery_track',
}

/**
 * Generate a signed QR payload.
 * Signs with HMAC-SHA256 for tamper detection.
 */
export async function generateQRPayload(type, data, options = {}) {
  const { expiresInMinutes = 60, branchId } = options

  const payload = {
    t: type,
    d: data,
    b: branchId || null,
    iat: Date.now(),
    exp: Date.now() + (expiresInMinutes * 60 * 1000),
    nonce: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
  }

  // Sign the payload
  const signature = await signPayload(JSON.stringify(payload))
  const qrData = JSON.stringify({ ...payload, sig: signature })

  logger.debug('[QR] Generated payload', { type, expiresInMinutes })

  return {
    raw: qrData,
    base64: btoa(qrData),
    payload,
  }
}

/**
 * Validate a scanned QR payload.
 * Checks signature, expiration, type, and branch isolation.
 */
export async function validateQRPayload(qrString, expectedType = null, expectedBranchId = null) {
  try {
    let parsed
    try {
      // Try base64 first, then raw JSON
      parsed = JSON.parse(atob(qrString))
    } catch {
      parsed = JSON.parse(qrString)
    }

    // Check required fields
    if (!parsed.t || !parsed.d || !parsed.iat || !parsed.exp) {
      return { valid: false, error: 'Malformed QR payload' }
    }

    // Check expiration
    if (Date.now() > parsed.exp) {
      return { valid: false, error: 'QR code has expired' }
    }

    // Check type
    if (expectedType && parsed.t !== expectedType) {
      return { valid: false, error: `Expected type ${expectedType}, got ${parsed.t}` }
    }

    // Check branch isolation
    if (expectedBranchId && parsed.b && parsed.b !== expectedBranchId) {
      return { valid: false, error: 'QR code belongs to a different branch' }
    }

    // Verify signature
    const { sig, ...payloadWithoutSig } = parsed
    const expectedSig = await signPayload(JSON.stringify(payloadWithoutSig))

    if (sig !== expectedSig) {
      logger.warn('[QR] Invalid signature detected', { type: parsed.t })
      return { valid: false, error: 'Invalid QR signature — possible tampering' }
    }

    return { valid: true, type: parsed.t, data: parsed.d, payload: parsed }
  } catch (err) {
    logger.error('[QR] Validation error', err)
    return { valid: false, error: 'Invalid QR code format' }
  }
}

/**
 * Generate table ordering QR data.
 */
export async function generateTableQR(tableNumber, branchId, options = {}) {
  return generateQRPayload(QR_TYPES.TABLE_ORDER, {
    table: tableNumber,
    branch: branchId,
  }, {
    expiresInMinutes: options.expiresInMinutes || 480, // 8 hours default
    branchId,
  })
}

/**
 * Generate payment QR data.
 */
export async function generatePaymentQR(orderId, amount, branchId) {
  return generateQRPayload(QR_TYPES.PAYMENT, {
    order_id: orderId,
    amount,
  }, {
    expiresInMinutes: 15,
    branchId,
  })
}

/**
 * Generate staff login QR.
 */
export async function generateStaffQR(userId, branchId) {
  return generateQRPayload(QR_TYPES.STAFF_LOGIN, {
    user_id: userId,
  }, {
    expiresInMinutes: 1440, // 24 hours
    branchId,
  })
}

/**
 * Generate delivery tracking QR.
 */
export async function generateDeliveryQR(orderId, branchId) {
  return generateQRPayload(QR_TYPES.DELIVERY_TRACK, {
    order_id: orderId,
  }, {
    expiresInMinutes: 120, // 2 hours
    branchId,
  })
}

// ─── Internal: HMAC Signing ─────────────────────────────────────────
// NOTE: This client-side HMAC provides tamper *detection* only for UX.
// The secret lives in the browser bundle regardless, so it is NOT a real
// security boundary. Authoritative QR verification MUST be done server-side
// (Supabase RPC / Edge Function) where the secret is never exposed.
const QR_SECRET = import.meta.env.VITE_QR_SECRET
if (!QR_SECRET) {
  console.error('[QRService] VITE_QR_SECRET is not set — QR signing disabled')
}

async function signPayload(data) {
  if (!QR_SECRET) {
    throw new Error('QR signing unavailable: VITE_QR_SECRET not configured')
  }
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(QR_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16)
  }
  // Fallback: simple hash for environments without SubtleCrypto
  let hash = 0
  const combined = QR_SECRET + data
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}
