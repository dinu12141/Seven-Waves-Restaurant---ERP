import { supabase } from 'src/boot/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TableSessionResult {
  success: boolean
  error?: string
  session_id?: string
  session_token?: string
  table_id?: string
  branch_id?: string
  expires_at?: string
  reused?: boolean
}

export interface HeartbeatResult {
  success: boolean
  error?: string
  session_id?: string
  table_id?: string
  expires_at?: string
  remaining_sec?: number
}

// ─── Device-code login ────────────────────────────────────────────────────────

/**
 * Authenticates a table device using its device_code and secret/PIN.
 * Returns a plaintext session_token on success (only returned once).
 */
export async function loginWithDeviceCode(
  deviceCode: string,
  deviceSecret: string,
): Promise<TableSessionResult> {
  const { data, error } = await supabase.rpc('create_table_session', {
    p_device_code: deviceCode.trim(),
    p_device_secret: deviceSecret,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return data as TableSessionResult
}

// ─── QR-code login ────────────────────────────────────────────────────────────

/**
 * Obtains (or creates) a customer session using a QR token embedded in the URL.
 * Rate-limited: max 10 scans/minute per QR token to prevent brute-force abuse.
 * Calls get_or_create_session_by_qr RPC.
 */
export async function loginWithQrToken(qrToken: string): Promise<TableSessionResult> {
  // SEC-C: enforce rate limit before the session RPC so a flood of QR scans
  // (automated or accidental) is blocked at the DB level and logged to audit_logs.
  const { data: rlData, error: rlError } = await supabase.rpc('check_qr_rate_limit', {
    p_identifier: qrToken,
    p_endpoint: 'qr_scan',
    p_limit: 10,
  })
  if (!rlError && rlData && !(rlData as { allowed: boolean }).allowed) {
    return { success: false, error: 'Too many scan attempts. Please wait a moment before trying again.' }
  }

  const { data, error } = await supabase.rpc('get_or_create_session_by_qr', {
    p_qr_token: qrToken,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return data as TableSessionResult
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

/**
 * Pings the server to keep the session alive and get remaining TTL.
 */
export async function sendHeartbeat(sessionToken: string): Promise<HeartbeatResult> {
  const { data, error } = await supabase.rpc('heartbeat_session', {
    p_session_token: sessionToken,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return data as HeartbeatResult
}

// ─── Order creation ───────────────────────────────────────────────────────────

export interface CartItemPayload {
  menu_item_id: string
  qty: number
  notes?: string
}

export interface CreateOrderResult {
  success: boolean
  error?: string
  order_id?: string
  table_id?: string
  branch_id?: string
  subtotal?: number
  status?: string
  order_source?: string
}

/**
 * Creates an order entirely server-side.
 * The RPC validates the session, resolves table/branch/company,
 * re-prices every item from menu_items.base_price, and inserts
 * orders + order_items atomically.
 *
 * @param sessionToken - plaintext token held in memory by tableSessionStore
 * @param items        - array of {menu_item_id, qty, notes?}
 * @param source       - 'qr' (scan entry) | 'table_screen' (device login)
 */
export async function createOrderFromSession(
  sessionToken: string,
  items: CartItemPayload[],
  source: 'qr' | 'table_screen' = 'qr',
): Promise<CreateOrderResult> {
  const { data, error } = await supabase.rpc('create_order_from_session', {
    p_session_token: sessionToken,
    p_items: items,
    p_source: source,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return data as CreateOrderResult
}
